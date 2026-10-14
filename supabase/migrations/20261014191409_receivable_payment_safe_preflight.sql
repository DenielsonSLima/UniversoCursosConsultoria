BEGIN;
-- A rejected read-only bank preflight must not indefinitely fence reconciliation.
-- Existing attempts are unchanged until their token-owning worker proves safe termination.
ALTER TABLE internal_receivable_payments.attempts DROP CONSTRAINT attempts_state_check;
ALTER TABLE internal_receivable_payments.attempts ADD CONSTRAINT attempts_state_check
 CHECK(state IN ('READY','LEASED','INTENT','REVIEW','COMPLETE','FAILED_SAFE'));
ALTER TABLE internal_receivable_payments.attempts ADD CONSTRAINT attempts_failed_safe_check
 CHECK(state<>'FAILED_SAFE' OR (intent_at IS NULL AND evidence IS NULL AND result IS NULL AND completed_at IS NOT NULL));
DROP INDEX internal_receivable_payments.receivable_payment_active_idx;
CREATE UNIQUE INDEX receivable_payment_active_idx ON internal_receivable_payments.attempts(receivable_id)
 WHERE state NOT IN ('COMPLETE','FAILED_SAFE');
CREATE OR REPLACE FUNCTION public.claim_receivable_payment_service(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a internal_receivable_payments.attempts%ROWTYPE; inspected jsonb; token uuid; mode_value text; preview jsonb;
BEGIN
 a:=internal_receivable_payments.lock_attempt(p_attempt_id);
 IF a.state='COMPLETE' THEN RETURN jsonb_build_object('mode','COMPLETE','result',a.result||'{"replayed":true}'::jsonb); END IF;
 IF a.state='FAILED_SAFE' THEN RETURN jsonb_build_object('mode','FAILED_SAFE'); END IF;
 IF a.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('mode','BUSY'); END IF;
 inspected:=internal_receivable_payments.inspect(a.receivable_id,a.input);
 IF internal_other_credit_cancellation.snapshot(a.receivable_id) IS DISTINCT FROM a.snapshot THEN
   RAISE EXCEPTION 'PAYMENT_SNAPSHOT_CHANGED';
 END IF;
 preview:=internal_financial_payments.preview_for_actor(a.actor_id,'RECEIVABLE',a.receivable_id,a.input);
 IF preview->>'fingerprint' IS DISTINCT FROM a.input->>'fingerprint' THEN RAISE EXCEPTION 'PAYMENT_PREVIEW_CHANGED'; END IF;
 token:=gen_random_uuid();
 mode_value:=CASE WHEN inspected->>'mode'='LOCAL' THEN 'LOCAL'
   WHEN a.intent_at IS NOT NULL THEN 'CONFIRM_ONLY' ELSE 'CANCEL_ALLOWED' END;
 UPDATE internal_receivable_payments.attempts SET state='LEASED',lease_token=token,
   lease_until=clock_timestamp()+interval '3 minutes',review_reason=NULL WHERE id=a.id;
 RETURN inspected||jsonb_build_object('mode',mode_value,'leaseToken',token);
END $$;
CREATE OR REPLACE FUNCTION public.review_receivable_payment_service(p_attempt_id uuid,p_lease_token uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a internal_receivable_payments.attempts%ROWTYPE; rid uuid; safe boolean;
BEGIN
 PERFORM internal_other_credit_cancellation.service_only();
 SELECT receivable_id INTO rid FROM internal_receivable_payments.attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_REVIEW_SCOPE'; END IF;
 -- Same source-before-attempt order as begin/claim/complete and all financial writers.
 PERFORM 1 FROM public.contas_receber WHERE id=rid FOR UPDATE;
 SELECT * INTO a FROM internal_receivable_payments.attempts WHERE id=p_attempt_id FOR UPDATE;
 IF p_lease_token IS NULL OR a.lease_token IS DISTINCT FROM p_lease_token
   OR a.state NOT IN ('LEASED','INTENT','REVIEW','FAILED_SAFE') OR p_reason IS NULL
   OR p_reason NOT IN ('REMOTE_PREFLIGHT_ERROR','REMOTE_AMBIGUOUS','LOCAL_SYNC_AFTER_REMOTE') THEN
   RAISE EXCEPTION 'PAYMENT_REVIEW_SCOPE';
 END IF;
 -- A lost start response may leave durable intent even when the caller believes no PUT began.
 -- Only this request's absence from the ledger matters: earlier partial payments stay intact.
 safe:=p_reason='REMOTE_PREFLIGHT_ERROR' AND a.intent_at IS NULL
   AND a.evidence IS NULL AND a.result IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.financial_payment_events WHERE request_id=a.id);
 IF a.state='FAILED_SAFE' AND NOT safe THEN RAISE EXCEPTION 'PAYMENT_REVIEW_SCOPE'; END IF;
 UPDATE internal_receivable_payments.attempts
 SET state=CASE WHEN safe THEN 'FAILED_SAFE' ELSE 'REVIEW' END,
   review_reason=p_reason,lease_until=NULL,
   completed_at=CASE WHEN safe THEN coalesce(completed_at,clock_timestamp()) ELSE completed_at END
 WHERE id=a.id;
 RETURN jsonb_build_object('reviewed',true,'state',CASE WHEN safe THEN 'FAILED_SAFE' ELSE 'REVIEW' END,'safeToEdit',safe);
END $$;
CREATE OR REPLACE FUNCTION internal_receivable_payments.guard_active_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid; before_value jsonb; after_value jsonb;
BEGIN
 IF TG_TABLE_NAME='contas_receber' THEN rid:=coalesce(NEW.id,OLD.id);
 ELSIF TG_OP='DELETE' THEN rid:=OLD.receivable_id; ELSE rid:=NEW.receivable_id; END IF;
 PERFORM 1 FROM public.contas_receber WHERE id=rid FOR UPDATE;
 IF TG_TABLE_NAME IN ('receivable_manual_settlements','items','banese_cancellation_outbox')
   AND EXISTS(SELECT 1 FROM public.financial_payment_events WHERE source_kind='RECEIVABLE' AND source_id=rid) THEN
   RAISE EXCEPTION 'Esta cobrança tem pagamentos no histórico. Use o fluxo de pagamentos do Financeiro.' USING ERRCODE='PT409';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM internal_receivable_payments.attempts WHERE receivable_id=rid AND state NOT IN ('COMPLETE','FAILED_SAFE')) THEN
   RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='contas_receber' THEN
   before_value:=to_jsonb(OLD)-ARRAY['updated_at','gateway_synced_at','asaas_synced_at','gateway_last_error','asaas_last_error'];
   after_value:=to_jsonb(NEW)-ARRAY['updated_at','gateway_synced_at','asaas_synced_at','gateway_last_error','asaas_last_error'];
   IF before_value IS NOT DISTINCT FROM after_value THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='payment_gateway_transactions' AND TG_OP='UPDATE' THEN
   before_value:=to_jsonb(OLD)-ARRAY['updated_at','synced_at','last_error','raw_payload'];
   after_value:=to_jsonb(NEW)-ARRAY['updated_at','synced_at','last_error','raw_payload'];
   IF before_value IS NOT DISTINCT FROM after_value THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='banese_reconciliation_queue' THEN
   IF NEW.state<>'LEASED' AND NEW.lease_run_id IS NULL AND NEW.lease_until IS NULL THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Recebimento em andamento. Retome a mesma solicitação no Financeiro antes de alterar esta cobrança.' USING ERRCODE='PT409';
END $$;
REVOKE ALL ON FUNCTION public.claim_receivable_payment_service(uuid),public.review_receivable_payment_service(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_receivable_payment_service(uuid),public.review_receivable_payment_service(uuid,uuid,text)
 TO service_role;
REVOKE ALL ON FUNCTION internal_receivable_payments.guard_active_attempt() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
