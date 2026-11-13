BEGIN;
CREATE FUNCTION public.complete_nfse_service_cancellation_job_internal(p_job_id uuid,p_lease_token uuid,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='10s' AS $$
DECLARE j private.nfse_service_cancellation_jobs%ROWTYPE;c public.contas_receber%ROWTYPE;
  b private.nfse_service_bolepix_jobs%ROWTYPE;t public.payment_gateway_transactions%ROWTYPE;
  material jsonb;v_outcome text:=p_result->>'outcome';stamp timestamptz:=clock_timestamp();confirmed timestamptz;
  number text:=p_result->>'nossoNumero';line text:=p_result->>'bankSlipDigitableLine';barcode text:=p_result->>'bankSlipBarcode';raw jsonb;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_CANCEL_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO j FROM private.nfse_service_cancellation_jobs WHERE id=p_job_id FOR UPDATE NOWAIT;
  IF FOUND AND j.state='DONE' AND p_lease_token IS NOT NULL AND j.lease_token=p_lease_token THEN
    IF j.evidence IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'SERVICE_CANCEL_EVIDENCE_IMMUTABLE' USING ERRCODE='40001'; END IF;
    RETURN jsonb_build_object('completed',true,'receivableId',j.receivable_id);
  END IF;
  j:=private.lock_nfse_service_cancellation_job(p_job_id,p_lease_token);
  material:=public.get_nfse_service_cancellation_material_internal(p_job_id,p_lease_token);
  SELECT * INTO STRICT c FROM public.contas_receber WHERE id=j.receivable_id FOR UPDATE NOWAIT;
  IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR octet_length(p_result::text)>100000
    OR coalesce(p_result->>'evidenceFingerprint','') !~ '^[a-f0-9]{64}$'
    OR v_outcome IS NULL OR v_outcome NOT IN ('LOCAL_CANCELLED','CANCELLED','PAID') THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_INVALID_EVIDENCE' USING ERRCODE='22023'; END IF;
  confirmed:=(p_result->>'confirmedAt')::timestamptz;
  IF confirmed IS NULL OR confirmed<stamp-interval '2 minutes' OR confirmed>stamp+interval '30 seconds' THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_STALE_PROOF' USING ERRCODE='22023'; END IF;
  IF v_outcome='PAID' THEN
    -- A server-side bank reconciliation must have already recorded the payment.
    -- This branch only closes the cancellation audit and never fabricates receipt.
    IF c.status IS DISTINCT FROM 'PAGO' OR material->>'action' IS DISTINCT FROM 'PRESERVE_PAID'
      OR p_result->>'remoteStatus' IS DISTINCT FROM 'PAID' THEN
      RAISE EXCEPTION 'SERVICE_CANCEL_PAYMENT_HISTORY' USING ERRCODE='55000'; END IF;
  ELSIF v_outcome='LOCAL_CANCELLED' THEN
    IF material->>'action' IS DISTINCT FROM 'LOCAL_CANCEL' OR j.cancel_intent_at IS NOT NULL
      OR p_result->>'remoteStatus' IS DISTINCT FROM 'LOCAL' THEN
      RAISE EXCEPTION 'SERVICE_CANCEL_LOCAL_PROOF_INVALID' USING ERRCODE='40001'; END IF;
    PERFORM private.nfse_service_cancellation_queue_fence(c.id,true);
    UPDATE public.contas_receber SET status='CANCELADO',gateway_creation_token=NULL,
      gateway_last_error=NULL,updated_at=stamp WHERE id=c.id;
  ELSE
    IF material->>'action' NOT IN ('CANCEL_BANK','OBSERVE_BANK')
      OR p_result->>'remoteStatus' IS DISTINCT FROM 'CANCELED'
      OR p_result->'situationCode' IS DISTINCT FROM '5'::jsonb
      OR p_result->>'convenio' IS DISTINCT FROM c.gateway_boleto_convenio
      OR number IS DISTINCT FROM c.gateway_boleto_nosso_numero
      OR p_result->'strictEffectivePayments' IS DISTINCT FROM 'true'::jsonb
      OR p_result->'identityValidated' IS DISTINCT FROM 'true'::jsonb
      OR p_result->'termsValidated' IS DISTINCT FROM 'true'::jsonb
      OR p_result->'paymentsCount' IS DISTINCT FROM '0'::jsonb
      OR jsonb_typeof(p_result->'mutationAttempted') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(p_result->'alreadyCanceled') IS DISTINCT FROM 'boolean'
      OR NOT ((p_result->>'mutationAttempted')::boolean OR (p_result->>'alreadyCanceled')::boolean)
      OR ((p_result->>'mutationAttempted')::boolean AND j.cancel_intent_at IS NULL)
      OR p_result->'financialTerms' IS DISTINCT FROM c.gateway_financial_terms
      OR coalesce(line,'') !~ '^0479[0-9]{43}$' OR coalesce(barcode,'') !~ '^0479[0-9]{40}$'
      OR substring(barcode,31,9) IS DISTINCT FROM number OR substring(barcode,10,10)::numeric IS DISTINCT FROM c.valor*100
      OR (c.gateway_boleto_linha_digitavel IS NOT NULL AND c.gateway_boleto_linha_digitavel<>line)
      OR (c.gateway_boleto_codigo_barras IS NOT NULL AND c.gateway_boleto_codigo_barras<>barcode) THEN
      RAISE EXCEPTION 'SERVICE_CANCEL_BANK_PROOF_INVALID' USING ERRCODE='40001'; END IF;
    PERFORM private.nfse_service_cancellation_queue_fence(c.id,true);
    IF (SELECT count(*) FROM public.payment_gateway_transactions WHERE receivable_id=c.id)>1 THEN
      RAISE EXCEPTION 'SERVICE_CANCEL_MULTIPLE_TRANSACTIONS' USING ERRCODE='55000'; END IF;
    SELECT * INTO t FROM public.payment_gateway_transactions WHERE receivable_id=c.id FOR UPDATE NOWAIT;
    SELECT * INTO b FROM private.nfse_service_bolepix_jobs WHERE receivable_id=c.id FOR UPDATE NOWAIT;
    raw:=jsonb_build_object('nfseServiceCancellation',p_result,'nfseServiceCancellationJobId',j.id)
      ||CASE WHEN b.creation_evidence IS NOT NULL THEN jsonb_build_object(
        'creationResponse',b.creation_evidence->'creationResponse','creationRequest',b.creation_evidence->'request') ELSE '{}'::jsonb END;
    IF t.id IS NOT NULL THEN
      IF t.provider_code IS DISTINCT FROM 'banese_card' OR t.environment IS DISTINCT FROM 'production'
        OR t.payment_method IS DISTINCT FROM 'BOLETO' OR t.amount IS DISTINCT FROM c.valor
        OR t.origin_polo_id IS DISTINCT FROM c.polo_id OR t.issuer_polo_id IS DISTINCT FROM c.gateway_issuer_polo_id
        OR t.remote_payment_id IS DISTINCT FROM number OR t.bank_slip_our_number IS DISTINCT FROM number
        OR t.bank_slip_digitable_line IS DISTINCT FROM line OR t.bank_slip_barcode IS DISTINCT FROM barcode
        OR coalesce(t.remote_status,'') NOT IN ('PENDING','OVERDUE','REGISTERING','CANCELED') THEN
        RAISE EXCEPTION 'SERVICE_CANCEL_TRANSACTION_CHANGED' USING ERRCODE='40001'; END IF;
      UPDATE public.payment_gateway_transactions SET remote_status='CANCELED',
        raw_payload=coalesce(raw_payload,'{}')||raw,synced_at=stamp,updated_at=stamp WHERE id=t.id;
    ELSE
      -- An accepted POST may still be returning when its NFS-e is cancelled.
      -- Strict GET proof can record this bank identity without inventing a POST.
      IF c.gateway_submission_status<>'API_AMBIGUOUS' THEN
        RAISE EXCEPTION 'SERVICE_CANCEL_TRANSACTION_MISSING' USING ERRCODE='40001'; END IF;
      INSERT INTO public.payment_gateway_transactions(receivable_id,provider_code,environment,payment_method,
        origin_polo_id,issuer_polo_id,installments,remote_payment_id,remote_status,amount,
        bank_slip_digitable_line,bank_slip_barcode,bank_slip_our_number,pix_payload,pix_encoded_image,raw_payload,synced_at,updated_at)
      VALUES(c.id,'banese_card','production','BOLETO',c.polo_id,c.gateway_issuer_polo_id,1,number,'CANCELED',c.valor,
        line,barcode,number,coalesce(c.gateway_pix_payload,b.creation_evidence->>'pixPayload'),
        coalesce(c.gateway_pix_encoded_image,b.creation_evidence->>'pixEncodedImage'),raw,stamp,stamp);
    END IF;
    UPDATE public.contas_receber SET status='CANCELADO',gateway_status='CANCELED',gateway_payment_id=number,
      gateway_submission_status='API_REGISTERED',gateway_creation_token=NULL,
      gateway_boleto_linha_digitavel=line,gateway_boleto_codigo_barras=barcode,
      gateway_financial_terms_confirmed_at=coalesce(gateway_financial_terms_confirmed_at,stamp),
      gateway_boleto_issued_at=coalesce(gateway_boleto_issued_at,stamp),
      gateway_last_error=NULL,gateway_synced_at=stamp,updated_at=stamp WHERE id=c.id;
    UPDATE public.banese_reconciliation_queue SET last_result='CANCELED' WHERE receivable_id=c.id;
  END IF;
  UPDATE private.nfse_service_cancellation_jobs SET state='DONE',outcome=v_outcome,evidence=p_result,
    lease_until=NULL,diagnostic_code=NULL,updated_at=stamp WHERE id=j.id;
  RETURN jsonb_build_object('completed',true,'receivableId',c.id);
END$$;
REVOKE ALL ON FUNCTION public.complete_nfse_service_cancellation_job_internal(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_nfse_service_cancellation_job_internal(uuid,uuid,jsonb) TO service_role;
COMMIT;
