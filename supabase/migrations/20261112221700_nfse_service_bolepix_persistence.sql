BEGIN;
-- The shared adapter owns reserve/preflight/POST. This scoped guard reauthorizes
-- the durable intent at its existing atomic API marker, immediately before POST.
CREATE FUNCTION private.guard_nfse_service_bolepix_api_intent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job private.nfse_service_bolepix_jobs%ROWTYPE;l private.nfse_service_receivables%ROWTYPE;
BEGIN
  IF NEW.gateway_submission_status IS DISTINCT FROM 'API_AMBIGUOUS'
    OR OLD.gateway_submission_status IS NOT NULL THEN RETURN NEW; END IF;
  -- Serialize against fiscal cancellation even for a local-only service, which
  -- has no automatic bank job. Generic Outros Créditos cannot bypass that plan.
  SELECT * INTO l FROM private.nfse_service_receivables WHERE receivable_id=NEW.id FOR SHARE NOWAIT;
  IF FOUND AND l.fiscal_cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'BOLEPIX_FISCAL_CANCELLED' USING ERRCODE='42501'; END IF;
  SELECT * INTO job FROM private.nfse_service_bolepix_jobs WHERE receivable_id=NEW.id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN
    IF l.receivable_id IS NOT NULL THEN RAISE EXCEPTION 'BOLEPIX_SERVICE_PLAN_DENIED' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BOLEPIX_WORKER_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT l FROM private.nfse_service_receivables WHERE receivable_id=NEW.id;
  PERFORM 1 FROM public.parceiros WHERE id=NEW.cliente_id FOR SHARE NOWAIT;
  PERFORM 1 FROM public.usuarios_sistema WHERE auth_user_id=job.actor_auth_user_id FOR SHARE NOWAIT;
  PERFORM 1 FROM public.perfis_acesso WHERE id IN (SELECT perfil_acesso_id FROM public.usuarios_sistema
    WHERE auth_user_id=job.actor_auth_user_id) FOR SHARE NOWAIT;
  IF job.state<>'LEASED' OR job.lease_until<=clock_timestamp() OR NEW.gateway_creation_token IS DISTINCT FROM job.api_attempt_token
    OR job.api_attempt_token IS DISTINCT FROM job.lease_token
    OR NOT EXISTS(SELECT 1 FROM public.parceiros WHERE id=NEW.cliente_id
      AND regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')=job.payer_document)
    OR l.fiscal_cancelled_at IS NOT NULL OR private.nfse_service_bolepix_intent(NEW,l) IS DISTINCT FROM job.intent
    OR NOT coalesce(internal_financial_payments.actor_allowed(job.actor_auth_user_id,NEW.polo_id,'receber'),false)
    OR NOT EXISTS(SELECT 1 FROM public.payment_gateway_routes WHERE modalidade='OUTROS_CREDITOS' AND payment_method='BOLETO'
      AND environment='production' AND enabled AND provider_code='banese_card' AND credential_id=job.credential_id)
    OR NEW.gateway_issuer_polo_id IS DISTINCT FROM job.issuer_polo_id
    OR NOT EXISTS(SELECT 1 FROM public.payment_gateway_runtime_config WHERE id AND enabled AND active_environment='production') THEN
    RAISE EXCEPTION 'BOLEPIX_API_INTENT_CHANGED' USING ERRCODE='42501'; END IF;
  IF job.bank_our_number IS NOT NULL AND job.bank_our_number IS DISTINCT FROM NEW.gateway_boleto_nosso_numero THEN
    RAISE EXCEPTION 'BOLEPIX_BANK_IDENTITY_CHANGED' USING ERRCODE='40001'; END IF;
  UPDATE private.nfse_service_bolepix_jobs SET bank_our_number=NEW.gateway_boleto_nosso_numero WHERE id=job.id;
  RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.guard_nfse_service_bolepix_api_intent() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_service_bolepix_api_intent BEFORE UPDATE OF gateway_submission_status ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION private.guard_nfse_service_bolepix_api_intent();

CREATE FUNCTION public.preserve_nfse_service_bolepix_creation_internal(p_job_id uuid,p_api_attempt_token uuid,p_evidence jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE job private.nfse_service_bolepix_jobs%ROWTYPE;c public.contas_receber%ROWTYPE;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BOLEPIX_WORKER_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT job FROM private.nfse_service_bolepix_jobs WHERE id=p_job_id FOR UPDATE NOWAIT;
  SELECT * INTO STRICT c FROM public.contas_receber WHERE id=job.receivable_id FOR UPDATE NOWAIT;
  IF p_api_attempt_token IS NULL OR job.api_attempt_token IS DISTINCT FROM p_api_attempt_token
    OR c.gateway_provider IS DISTINCT FROM 'banese_card' OR c.gateway_environment IS DISTINCT FROM 'production'
    OR c.gateway_submission_status NOT IN ('API_AMBIGUOUS','API_REGISTERED')
    OR (c.gateway_submission_status='API_AMBIGUOUS' AND c.gateway_creation_token IS DISTINCT FROM p_api_attempt_token)
    OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' OR jsonb_typeof(p_evidence->'request') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_evidence->'creationResponse') IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_evidence) k WHERE k NOT IN ('request','creationResponse','pixPayload','pixEncodedImage'))
    OR p_evidence#>>'{request,NossoNumero}' IS DISTINCT FROM job.bank_our_number
    OR c.gateway_boleto_nosso_numero IS DISTINCT FROM job.bank_our_number
    OR (p_evidence#>>'{request,ValorNominal}')::numeric IS DISTINCT FROM (job.intent->>'amount')::numeric
    OR (p_evidence#>>'{request,DataVencimento}')::date IS DISTINCT FROM (job.intent->>'dueDate')::date
    OR (p_evidence#>>'{creationResponse,NossoNumero}' IS NOT NULL AND lpad(regexp_replace(
      p_evidence#>>'{creationResponse,NossoNumero}','[^0-9]','','g'),9,'0') IS DISTINCT FROM c.gateway_boleto_nosso_numero)
    OR (p_evidence#>>'{creationResponse,ValorNominal}' IS NOT NULL
      AND (p_evidence#>>'{creationResponse,ValorNominal}')::numeric IS DISTINCT FROM c.valor)
    OR (nullif(p_evidence->>'pixPayload','') IS NULL)<>(nullif(p_evidence->>'pixEncodedImage','') IS NULL)
    OR octet_length(p_evidence::text)>100000 THEN
    RAISE EXCEPTION 'BOLEPIX_CREATION_EVIDENCE_CHANGED' USING ERRCODE='40001'; END IF;
  IF job.creation_evidence IS NOT NULL AND job.creation_evidence IS DISTINCT FROM p_evidence THEN
    RAISE EXCEPTION 'BOLEPIX_CREATION_EVIDENCE_IMMUTABLE' USING ERRCODE='40001'; END IF;
  UPDATE private.nfse_service_bolepix_jobs SET creation_evidence=coalesce(creation_evidence,p_evidence) WHERE id=job.id;
END$$;
REVOKE ALL ON FUNCTION public.preserve_nfse_service_bolepix_creation_internal(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preserve_nfse_service_bolepix_creation_internal(uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION public.complete_nfse_service_bolepix_job_internal(p_job_id uuid,p_lease_token uuid,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='10s' AS $$
DECLARE job private.nfse_service_bolepix_jobs%ROWTYPE;c public.contas_receber%ROWTYPE;
  l private.nfse_service_receivables%ROWTYPE;t public.payment_gateway_transactions%ROWTYPE;
  number text:=p_result->>'bankSlipOurNumber';line text:=p_result->>'bankSlipDigitableLine';
  barcode text:=p_result->>'bankSlipBarcode';pix text:=nullif(p_result->>'pixPayload','');
  image text:=nullif(p_result->>'pixEncodedImage','');stamp timestamptz:=clock_timestamp();
  raw jsonb;complete boolean;
BEGIN
  job:=private.lock_nfse_service_bolepix_job(p_job_id,p_lease_token);
  pix:=coalesce(nullif(job.creation_evidence->>'pixPayload',''),pix);
  image:=coalesce(nullif(job.creation_evidence->>'pixEncodedImage',''),image);
  SELECT * INTO STRICT c FROM public.contas_receber WHERE id=job.receivable_id FOR UPDATE NOWAIT;
  SELECT * INTO STRICT l FROM private.nfse_service_receivables WHERE receivable_id=c.id FOR SHARE NOWAIT;
  IF private.nfse_service_bolepix_intent(c,l) IS DISTINCT FROM job.intent
    OR c.gateway_provider IS DISTINCT FROM 'banese_card' OR c.gateway_environment IS DISTINCT FROM 'production'
    OR c.gateway_payment_method IS DISTINCT FROM 'BOLETO' OR c.gateway_submission_channel IS DISTINCT FROM 'API'
    OR c.gateway_submission_status NOT IN ('API_AMBIGUOUS','API_REGISTERED')
    OR (c.gateway_submission_status='API_AMBIGUOUS' AND (c.gateway_creation_token IS DISTINCT FROM job.api_attempt_token OR c.gateway_status<>'CREATING'))
    OR c.status NOT IN ('PENDENTE','VENCIDO') OR c.data_pagamento IS NOT NULL OR c.valor_pago IS NOT NULL
    OR c.manual_settlement_id IS NOT NULL OR c.gateway_settlement_recorded_at IS NOT NULL
    OR p_result->>'providerCode' IS DISTINCT FROM 'banese_card'
    OR coalesce(p_result->>'remoteStatus','') NOT IN ('PENDING','REGISTERING')
    OR (c.gateway_submission_status='API_REGISTERED' AND p_result->>'remoteStatus'<>'PENDING')
    OR p_result->>'remotePaymentId' IS DISTINCT FROM number OR p_result->>'issuerPoloId' IS DISTINCT FROM c.gateway_issuer_polo_id::text
    OR p_result->'financialTerms' IS DISTINCT FROM c.gateway_financial_terms
    OR coalesce(number,'') !~ '^[0-9]{9}$' OR number IS DISTINCT FROM c.gateway_boleto_nosso_numero
    OR coalesce(line,'') !~ '^0479[0-9]{43}$' OR coalesce(barcode,'') !~ '^0479[0-9]{40}$'
    OR substring(barcode,31,9)<>number OR substring(barcode,10,10)::numeric<>(c.valor*100)
    OR (pix IS NULL)<>(image IS NULL) OR jsonb_typeof(p_result->'rawPayload') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'BOLEPIX_RESULT_OR_FINANCIAL_CAS_CHANGED' USING ERRCODE='40001'; END IF;
  IF (SELECT count(*) FROM public.payment_gateway_transactions WHERE receivable_id=c.id)>1 THEN
    RAISE EXCEPTION 'BOLEPIX_MULTIPLE_TRANSACTIONS' USING ERRCODE='55000'; END IF;
  SELECT * INTO t FROM public.payment_gateway_transactions WHERE receivable_id=c.id FOR UPDATE NOWAIT;
  raw:=(p_result->'rawPayload')||CASE WHEN job.creation_evidence IS NOT NULL THEN jsonb_build_object(
    'creationResponse',job.creation_evidence->'creationResponse','creationRequest',job.creation_evidence->'request') ELSE '{}'::jsonb END
    ||jsonb_build_object('nfseServiceIssuance',jsonb_build_object(
    'jobId',job.id,'serviceId',l.service_id,'operationId',l.operation_id,'installment',l.installment_number,
    'fiscalNumber',l.fiscal_number,'fiscalDescription',l.fiscal_description));
  IF FOUND THEN
    IF c.gateway_submission_status<>'API_REGISTERED' OR t.provider_code<>'banese_card' OR t.environment<>'production'
      OR t.payment_method<>'BOLETO' OR t.remote_payment_id<>number OR t.bank_slip_our_number<>number
      OR t.amount IS DISTINCT FROM c.valor OR t.bank_slip_digitable_line<>line OR t.bank_slip_barcode<>barcode
      OR t.raw_payload#>>'{nfseServiceIssuance,jobId}' IS DISTINCT FROM job.id::text
      OR (c.gateway_pix_payload IS NOT NULL AND pix IS NOT NULL AND c.gateway_pix_payload<>pix)
      OR (c.gateway_pix_payload IS NULL)<>(c.gateway_pix_encoded_image IS NULL) THEN
      RAISE EXCEPTION 'BOLEPIX_TRANSACTION_CHANGED' USING ERRCODE='40001'; END IF;
    -- Keep the original POST and its first official Pix. Later GET cannot erase either.
    UPDATE public.payment_gateway_transactions SET pix_payload=coalesce(pix_payload,pix),
      pix_encoded_image=coalesce(pix_encoded_image,image),remote_status=p_result->>'remoteStatus',
      raw_payload=raw_payload||jsonb_build_object('nfseServiceLastQuery',raw),
      synced_at=stamp,updated_at=stamp WHERE id=t.id;
  ELSE
    IF c.gateway_submission_status<>'API_AMBIGUOUS' THEN RAISE EXCEPTION 'BOLEPIX_TRANSACTION_MISSING' USING ERRCODE='40001'; END IF;
    INSERT INTO public.payment_gateway_transactions(receivable_id,provider_code,environment,payment_method,
      origin_polo_id,issuer_polo_id,installments,remote_payment_id,remote_status,amount,
      bank_slip_digitable_line,bank_slip_barcode,bank_slip_our_number,pix_payload,pix_encoded_image,raw_payload,synced_at,updated_at)
    VALUES(c.id,'banese_card','production','BOLETO',c.polo_id,c.gateway_issuer_polo_id,1,number,p_result->>'remoteStatus',c.valor,
      line,barcode,number,pix,image,raw,stamp,stamp);
  END IF;
  UPDATE public.contas_receber SET gateway_payment_id=number,gateway_status=p_result->>'remoteStatus',gateway_submission_status='API_REGISTERED',
    gateway_creation_token=NULL,gateway_boleto_linha_digitavel=line,gateway_boleto_codigo_barras=barcode,
    gateway_pix_payload=coalesce(gateway_pix_payload,pix),gateway_pix_encoded_image=coalesce(gateway_pix_encoded_image,image),
    gateway_financial_terms_confirmed_at=coalesce(gateway_financial_terms_confirmed_at,stamp),
    gateway_boleto_issued_at=coalesce(gateway_boleto_issued_at,stamp),gateway_last_error=NULL,gateway_synced_at=stamp,updated_at=stamp
    WHERE id=c.id RETURNING * INTO c;
  complete:=c.gateway_pix_payload IS NOT NULL AND c.gateway_pix_encoded_image IS NOT NULL AND c.gateway_status='PENDING';
  UPDATE private.nfse_service_bolepix_jobs SET state=CASE WHEN complete THEN 'DONE'
      WHEN stamp-job.created_at>=interval '7 days' THEN 'REVIEW' ELSE 'READY' END,
    lease_token=NULL,lease_until=NULL,next_check_at=stamp+CASE WHEN stamp-job.created_at<interval '6 hours' THEN interval '1 minute'
      WHEN stamp-job.created_at<interval '24 hours' THEN interval '5 minutes' ELSE interval '1 hour' END,
    diagnostic_code=CASE WHEN complete THEN NULL ELSE 'PIX_PENDING' END,
    updated_at=stamp WHERE id=job.id;
  RETURN jsonb_build_object('persisted',true,'complete',complete,'receivableId',c.id,
    'reviewRequired',NOT complete AND stamp-job.created_at>=interval '7 days');
END$$;
REVOKE ALL ON FUNCTION public.complete_nfse_service_bolepix_job_internal(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_nfse_service_bolepix_job_internal(uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION public.fail_nfse_service_bolepix_job_internal(p_job_id uuid,p_lease_token uuid,p_transient boolean,p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job private.nfse_service_bolepix_jobs%ROWTYPE;age interval;delay interval;
BEGIN
  job:=private.lock_nfse_service_bolepix_job(p_job_id,p_lease_token);
  IF p_code IS NULL OR p_code NOT IN ('TRANSPORT','AUTH_BLOCKED','INVALID_EVIDENCE','LOCAL_CONFLICT','PIX_PENDING') THEN
    RAISE EXCEPTION 'BOLEPIX_INVALID_DIAGNOSTIC' USING ERRCODE='22023'; END IF;
  age:=clock_timestamp()-job.created_at;
  delay:=CASE WHEN age<interval '6 hours' THEN interval '1 minute' WHEN age<interval '24 hours' THEN interval '5 minutes' ELSE interval '1 hour' END;
  UPDATE private.nfse_service_bolepix_jobs SET state=CASE WHEN p_transient AND age<interval '7 days' THEN 'READY' ELSE 'REVIEW' END,
    lease_token=NULL,lease_until=NULL,next_check_at=clock_timestamp()+delay,diagnostic_code=p_code,updated_at=clock_timestamp()
    WHERE id=job.id;
END$$;
REVOKE ALL ON FUNCTION public.fail_nfse_service_bolepix_job_internal(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fail_nfse_service_bolepix_job_internal(uuid,uuid,boolean,text) TO service_role;
COMMIT;
