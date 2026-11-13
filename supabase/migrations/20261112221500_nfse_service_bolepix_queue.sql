BEGIN;
CREATE TABLE private.nfse_service_bolepix_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
  last_kick_at timestamptz
);
INSERT INTO private.nfse_service_bolepix_control(singleton) VALUES(true);
CREATE TABLE private.nfse_service_bolepix_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL UNIQUE REFERENCES public.contas_receber(id),
  service_id uuid NOT NULL REFERENCES private.nfse_partner_services(id),
  operation_id uuid NOT NULL REFERENCES private.nfse_individual_operations(id),
  actor_auth_user_id uuid NOT NULL, context_key uuid NOT NULL,
  credential_id uuid,issuer_polo_id uuid,
  api_attempt_token uuid,bank_our_number text,
  payer_document text,
  intent jsonb NOT NULL,
  creation_evidence jsonb,
  state text NOT NULL DEFAULT 'READY' CHECK(state IN ('READY','LEASED','DONE','REVIEW')),
  lease_token uuid,lease_until timestamptz,next_check_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,diagnostic_code text,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nfse_service_bolepix_due ON private.nfse_service_bolepix_jobs(next_check_at)
  WHERE state IN ('READY','LEASED');
ALTER TABLE private.nfse_service_bolepix_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_service_bolepix_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfse_service_bolepix_jobs,private.nfse_service_bolepix_control FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.nfse_service_bolepix_intent(c public.contas_receber,l private.nfse_service_receivables)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT jsonb_build_object('poloId',c.polo_id,'payerId',c.cliente_id,'amount',c.valor,'dueDate',c.data_vencimento,
    'description',c.descricao,'financialTerms',c.gateway_financial_terms,'serviceId',l.service_id,
    'operationId',l.operation_id,'installment',l.installment_number,'installments',l.installment_count,
    'fiscalNumber',l.fiscal_number,'fiscalDescription',l.fiscal_description);
$$;
REVOKE ALL ON FUNCTION private.nfse_service_bolepix_intent(public.contas_receber,private.nfse_service_receivables)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.enqueue_nfse_service_bolepix() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan private.nfse_service_financial_plans%ROWTYPE;c public.contas_receber%ROWTYPE;
BEGIN
  SELECT * INTO plan FROM private.nfse_service_financial_plans WHERE service_id=NEW.service_id;
  IF plan.issue_bolepix IS DISTINCT FROM true OR plan.requested_by IS NULL OR plan.context_key IS NULL
    OR NEW.origin<>'CREATED' OR NEW.fiscal_cancelled_at IS NOT NULL OR NOT EXISTS(
      SELECT 1 FROM private.nfse_individual_operations WHERE id=NEW.operation_id AND state='AUTHORIZED'
        AND environment='PRODUCAO') THEN RETURN NEW; END IF;
  SELECT * INTO STRICT c FROM public.contas_receber WHERE id=NEW.receivable_id;
  INSERT INTO private.nfse_service_bolepix_jobs(receivable_id,service_id,operation_id,actor_auth_user_id,context_key,intent,payer_document)
    SELECT c.id,NEW.service_id,NEW.operation_id,plan.requested_by,plan.context_key,private.nfse_service_bolepix_intent(c,NEW),
      regexp_replace(coalesce(s.partner_snapshot->>'document',''),'[^0-9]','','g')
    FROM private.nfse_partner_services s WHERE s.id=NEW.service_id
    ON CONFLICT(receivable_id) DO NOTHING;
  RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.enqueue_nfse_service_bolepix() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfse_service_bolepix_enqueue AFTER INSERT ON private.nfse_service_receivables
  FOR EACH ROW EXECUTE FUNCTION private.enqueue_nfse_service_bolepix();

CREATE FUNCTION public.claim_nfse_service_bolepix_job_internal() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE job private.nfse_service_bolepix_jobs%ROWTYPE;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BOLEPIX_WORKER_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.nfse_service_bolepix_control WHERE singleton AND enabled) THEN RETURN NULL; END IF;
  SELECT * INTO job FROM private.nfse_service_bolepix_jobs
    WHERE (state='READY' AND next_check_at<=clock_timestamp()) OR (state='LEASED' AND lease_until<=clock_timestamp())
    ORDER BY next_check_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE private.nfse_service_bolepix_jobs SET state='LEASED',lease_token=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '180 seconds',attempt_count=attempt_count+1,updated_at=clock_timestamp()
    WHERE id=job.id RETURNING * INTO job;
  RETURN jsonb_build_object('jobId',job.id,'leaseToken',job.lease_token,'receivableId',job.receivable_id);
END$$;
REVOKE ALL ON FUNCTION public.claim_nfse_service_bolepix_job_internal() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_nfse_service_bolepix_job_internal() TO service_role;
COMMIT;
