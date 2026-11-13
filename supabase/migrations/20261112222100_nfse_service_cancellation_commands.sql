BEGIN;
CREATE FUNCTION private.nfse_service_cancellation_queue_fence(p_receivable uuid,p_stop boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.banese_reconciliation_queue WHERE receivable_id=p_receivable FOR UPDATE NOWAIT;
  IF EXISTS(SELECT 1 FROM public.banese_reconciliation_queue WHERE receivable_id=p_receivable
    AND (state='LEASED' OR lease_run_id IS NOT NULL OR lease_until>clock_timestamp())) THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_RECONCILIATION_BUSY' USING ERRCODE='55P03'; END IF;
  IF p_stop THEN
    UPDATE public.banese_reconciliation_queue SET state='DONE',next_check_at=NULL,
      lease_run_id=NULL,lease_until=NULL,last_result='CANCELLATION_IN_PROGRESS',updated_at=clock_timestamp()
      WHERE receivable_id=p_receivable;
  END IF;
END$$;

CREATE FUNCTION public.begin_nfse_service_cancellation_bank_internal(p_job_id uuid,p_lease_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE j private.nfse_service_cancellation_jobs%ROWTYPE;c public.contas_receber%ROWTYPE;
  l private.nfse_service_receivables%ROWTYPE;
BEGIN
  j:=private.lock_nfse_service_cancellation_job(p_job_id,p_lease_token);
  SELECT * INTO STRICT c FROM public.contas_receber WHERE id=j.receivable_id FOR UPDATE NOWAIT;
  SELECT * INTO STRICT l FROM private.nfse_service_receivables WHERE receivable_id=c.id FOR SHARE NOWAIT;
  -- The current actor, profile and payer cannot change between authorization
  -- and the commit that grants this one bank mutation.
  PERFORM 1 FROM public.parceiros WHERE id=c.cliente_id FOR SHARE NOWAIT;
  PERFORM 1 FROM public.usuarios_sistema WHERE auth_user_id IN (j.fiscal_actor_id,j.bank_actor_id) FOR SHARE NOWAIT;
  PERFORM 1 FROM public.perfis_acesso WHERE id IN (SELECT perfil_acesso_id FROM public.usuarios_sistema
    WHERE auth_user_id IN (j.fiscal_actor_id,j.bank_actor_id)) FOR SHARE NOWAIT;
  PERFORM private.validate_nfse_service_cancellation_scope(j,c,l,true);
  IF j.cancel_intent_at IS NOT NULL OR j.bank_identity IS NULL
    OR j.bank_identity IS DISTINCT FROM private.nfse_service_cancellation_bank_identity(c)
    OR private.nfse_service_cancellation_has_payment(c) OR c.status NOT IN ('PENDENTE','VENCIDO')
    OR EXISTS(SELECT 1 FROM internal_other_credit_cancellation.items WHERE receivable_id=c.id) THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_INTENT_CHANGED' USING ERRCODE='40001'; END IF;
  PERFORM private.nfse_service_cancellation_queue_fence(c.id,true);
  UPDATE private.nfse_service_cancellation_jobs SET cancel_intent_at=clock_timestamp(),
    cancel_attempt_token=p_lease_token,updated_at=clock_timestamp() WHERE id=j.id;
  RETURN jsonb_build_object('started',true);
END$$;

CREATE FUNCTION public.fail_nfse_service_cancellation_job_internal(p_job_id uuid,p_lease_token uuid,
  p_transient boolean,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j private.nfse_service_cancellation_jobs%ROWTYPE;age interval;delay interval;
BEGIN
  j:=private.lock_nfse_service_cancellation_job(p_job_id,p_lease_token);
  IF p_code IS NULL OR p_code NOT IN ('TRANSPORT','AUTH_BLOCKED','INVALID_EVIDENCE','PAYMENT_HISTORY','LOCAL_CONFLICT') THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_INVALID_DIAGNOSTIC' USING ERRCODE='22023'; END IF;
  age:=clock_timestamp()-j.created_at;
  delay:=CASE WHEN age<interval '6 hours' THEN interval '1 minute' WHEN age<interval '24 hours' THEN interval '5 minutes' ELSE interval '1 hour' END;
  UPDATE private.nfse_service_cancellation_jobs SET state=CASE WHEN p_transient AND age<interval '7 days' THEN 'READY' ELSE 'REVIEW' END,
    lease_token=NULL,lease_until=NULL,next_check_at=clock_timestamp()+delay,diagnostic_code=p_code,updated_at=clock_timestamp()
    WHERE id=j.id;
END$$;

CREATE FUNCTION private.guard_other_credit_cancellation_service() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM private.nfse_service_receivables WHERE receivable_id=NEW.receivable_id) THEN
    RAISE EXCEPTION 'SERVICE_CANCEL_CANONICAL_ONLY' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END$$;
-- Two independent mutation ledgers must never grant a PUT for the same title.
-- Ordinary Outros Créditos retain their existing cancellation contract.
CREATE TRIGGER nfse_service_cancellation_exclusive BEFORE INSERT ON internal_other_credit_cancellation.items
  FOR EACH ROW EXECUTE FUNCTION private.guard_other_credit_cancellation_service();
REVOKE ALL ON FUNCTION private.nfse_service_cancellation_queue_fence(uuid,boolean),
  private.guard_other_credit_cancellation_service() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.begin_nfse_service_cancellation_bank_internal(uuid,uuid),
  public.fail_nfse_service_cancellation_job_internal(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_nfse_service_cancellation_bank_internal(uuid,uuid),
  public.fail_nfse_service_cancellation_job_internal(uuid,uuid,boolean,text) TO service_role;
COMMIT;
