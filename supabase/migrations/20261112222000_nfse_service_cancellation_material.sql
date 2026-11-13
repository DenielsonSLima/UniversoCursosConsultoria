BEGIN;
CREATE FUNCTION private.lock_nfse_service_cancellation_job(p_job uuid,p_lease uuid)
RETURNS private.nfse_service_cancellation_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j private.nfse_service_cancellation_jobs%ROWTYPE;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_CANCEL_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO j FROM private.nfse_service_cancellation_jobs WHERE id=p_job FOR UPDATE NOWAIT;
  IF NOT FOUND OR p_lease IS NULL OR j.state<>'LEASED' OR j.lease_token IS DISTINCT FROM p_lease
    OR j.lease_until IS NULL OR j.lease_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_LEASE_CHANGED' USING ERRCODE='40001'; END IF;
  RETURN j;
END$$;
CREATE FUNCTION public.claim_nfse_service_cancellation_job_internal() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE j private.nfse_service_cancellation_jobs%ROWTYPE;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_CANCEL_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.nfse_service_bolepix_control WHERE singleton AND enabled) THEN RETURN NULL; END IF;
  SELECT * INTO j FROM private.nfse_service_cancellation_jobs
    WHERE (state='READY' AND next_check_at<=clock_timestamp()) OR (state='LEASED' AND lease_until<=clock_timestamp())
    ORDER BY next_check_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE private.nfse_service_cancellation_jobs SET state='LEASED',lease_token=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '180 seconds',attempt_count=attempt_count+1,updated_at=clock_timestamp()
    WHERE id=j.id RETURNING * INTO j;
  RETURN jsonb_build_object('jobId',j.id,'leaseToken',j.lease_token,'receivableId',j.receivable_id);
END$$;

CREATE FUNCTION private.validate_nfse_service_cancellation_scope(j private.nfse_service_cancellation_jobs,
  c public.contas_receber,l private.nfse_service_receivables,p_bank boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT private.nfse_service_cancellation_proven(j.cancellation_id)
    OR l.operation_id IS DISTINCT FROM j.operation_id OR l.service_id IS DISTINCT FROM j.service_id
    OR c.id IS DISTINCT FROM j.receivable_id OR c.polo_id IS DISTINCT FROM j.polo_id
    OR private.nfse_service_cancellation_identity(c,l) IS DISTINCT FROM j.intent
    OR c.categoria IS DISTINCT FROM 'OUTROS_CREDITOS' OR c.tipo_lancamento IS DISTINCT FROM 'OUTRO_CREDITO'
    OR c.matricula_id IS NOT NULL OR c.turma_id IS NOT NULL OR c.origem_cronograma_id IS NOT NULL THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  PERFORM private.authorize_nfse_individual_internal(j.fiscal_actor_id,j.fiscal_context_key,j.polo_id,'PRODUCAO',j.month);
  IF p_bank AND NOT coalesce(internal_financial_payments.actor_allowed(j.bank_actor_id,j.polo_id,'receber'),false) THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_BANK_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
END$$;

CREATE FUNCTION private.nfse_service_cancellation_bank_identity(c public.contas_receber) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('provider',c.gateway_provider,'environment',c.gateway_environment,
    'method',c.gateway_payment_method,'issuerId',c.gateway_issuer_polo_id,
    'convenio',c.gateway_boleto_convenio,'nossoNumero',c.gateway_boleto_nosso_numero,'agency',c.gateway_boleto_agencia,
    'payerDocument',(SELECT regexp_replace(coalesce(p.cpf_cnpj,''),'[^0-9]','','g') FROM public.parceiros p WHERE p.id=c.cliente_id));
$$;
CREATE FUNCTION private.nfse_service_cancellation_is_local(c public.contas_receber,b private.nfse_service_bolepix_jobs)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT c.gateway_submission_channel IS NULL AND c.gateway_submission_status IS NULL
    AND c.gateway_cnab_file_id IS NULL AND c.gateway_payment_id IS NULL AND c.gateway_payment_link_id IS NULL
    AND c.gateway_boleto_linha_digitavel IS NULL AND c.gateway_boleto_codigo_barras IS NULL
    AND c.gateway_pix_payload IS NULL AND c.gateway_pix_encoded_image IS NULL AND c.gateway_boleto_issued_at IS NULL
    AND c.gateway_financial_terms_confirmed_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.payment_gateway_transactions t WHERE t.receivable_id=c.id)
    AND (coalesce(c.gateway_provider,'') IN ('','local') OR (c.gateway_provider='banese_card'
      AND b.id IS NOT NULL AND b.bank_our_number IS NULL
      AND c.gateway_creation_token IS NOT DISTINCT FROM b.api_attempt_token));
$$;

CREATE FUNCTION public.get_nfse_service_cancellation_material_internal(p_job_id uuid,p_lease_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='10s' AS $$
DECLARE j private.nfse_service_cancellation_jobs%ROWTYPE;c public.contas_receber%ROWTYPE;
  l private.nfse_service_receivables%ROWTYPE;b private.nfse_service_bolepix_jobs%ROWTYPE;
  action text;metadata jsonb;
BEGIN
  j:=private.lock_nfse_service_cancellation_job(p_job_id,p_lease_token);
  SELECT * INTO STRICT c FROM public.contas_receber WHERE id=j.receivable_id FOR UPDATE NOWAIT;
  SELECT * INTO STRICT l FROM private.nfse_service_receivables WHERE receivable_id=c.id FOR SHARE NOWAIT;
  PERFORM private.validate_nfse_service_cancellation_scope(j,c,l,false);
  IF EXISTS(SELECT 1 FROM internal_other_credit_cancellation.items WHERE receivable_id=c.id) THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_LEGACY_INTENT_EXISTS' USING ERRCODE='55000'; END IF;
  SELECT * INTO b FROM private.nfse_service_bolepix_jobs WHERE receivable_id=c.id FOR UPDATE NOWAIT;
  -- A fiscal cancellation wins every unstarted issuance. If its API marker
  -- exists, keep that identity: an in-flight POST is observed, never recreated.
  IF b.id IS NOT NULL AND b.state IN ('READY','LEASED') THEN
    UPDATE private.nfse_service_bolepix_jobs SET state='REVIEW',lease_token=NULL,lease_until=NULL,
      diagnostic_code='FISCAL_CANCELLED',updated_at=clock_timestamp() WHERE id=b.id;
  END IF;
  IF c.status='PAGO' THEN action:='PRESERVE_PAID';
  ELSIF private.nfse_service_cancellation_has_payment(c) THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_PAYMENT_HISTORY' USING ERRCODE='55000';
  ELSIF private.nfse_service_cancellation_is_local(c,b) THEN action:='LOCAL_CANCEL';
  ELSE
    PERFORM private.validate_nfse_service_cancellation_scope(j,c,l,true);
    IF c.gateway_provider IS DISTINCT FROM 'banese_card' OR c.gateway_environment IS DISTINCT FROM 'production'
      OR c.gateway_payment_method IS DISTINCT FROM 'BOLETO' OR c.gateway_submission_channel IS DISTINCT FROM 'API'
      OR c.gateway_submission_status NOT IN ('API_AMBIGUOUS','API_REGISTERED')
      OR c.gateway_cnab_file_id IS NOT NULL OR coalesce(c.gateway_boleto_nosso_numero,'') !~ '^[0-9]{9}$'
      OR coalesce(c.gateway_boleto_convenio,'') !~ '^[0-9]{1,20}$'
      OR coalesce(c.gateway_boleto_agencia,'') !~ '^[0-9]{3}$'
      OR c.gateway_issuer_polo_id IS NULL THEN
      RAISE EXCEPTION 'SERVICE_CANCEL_BANK_IDENTITY_INVALID' USING ERRCODE='55000'; END IF;
    IF j.bank_identity IS NOT NULL AND j.bank_identity IS DISTINCT FROM private.nfse_service_cancellation_bank_identity(c) THEN
      RAISE EXCEPTION 'SERVICE_CANCEL_BANK_IDENTITY_CHANGED' USING ERRCODE='40001'; END IF;
    UPDATE private.nfse_service_cancellation_jobs SET bank_identity=private.nfse_service_cancellation_bank_identity(c) WHERE id=j.id;
    SELECT credentials.metadata INTO STRICT metadata FROM public.payment_gateway_credentials credentials
      WHERE provider_code='banese_card' AND environment='production';
    action:=CASE WHEN j.cancel_intent_at IS NULL THEN 'CANCEL_BANK' ELSE 'OBSERVE_BANK' END;
  END IF;
  RETURN jsonb_build_object('jobId',j.id,'leaseToken',j.lease_token,'receivableId',c.id,'action',action,
    'receivable',to_jsonb(c),'payer',(SELECT to_jsonb(p) FROM public.parceiros p WHERE id=c.cliente_id),
    'metadata',coalesce(metadata,'{}'::jsonb),'cancelIntent',j.cancel_intent_at IS NOT NULL,'bankActorId',j.bank_actor_id);
END$$;
REVOKE ALL ON FUNCTION private.lock_nfse_service_cancellation_job(uuid,uuid),
  private.validate_nfse_service_cancellation_scope(private.nfse_service_cancellation_jobs,public.contas_receber,private.nfse_service_receivables,boolean),
  private.nfse_service_cancellation_bank_identity(public.contas_receber),
  private.nfse_service_cancellation_is_local(public.contas_receber,private.nfse_service_bolepix_jobs)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_nfse_service_cancellation_job_internal(),
  public.get_nfse_service_cancellation_material_internal(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_nfse_service_cancellation_job_internal(),
  public.get_nfse_service_cancellation_material_internal(uuid,uuid) TO service_role;
COMMIT;
