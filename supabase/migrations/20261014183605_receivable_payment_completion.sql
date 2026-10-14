BEGIN;
CREATE FUNCTION public.complete_receivable_payment_service(p_attempt_id uuid,p_lease_token uuid,p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a internal_receivable_payments.attempts%ROWTYPE; inspected jsonb; confirmed_at timestamptz; v_result jsonb;
BEGIN
 a:=internal_receivable_payments.lock_attempt(p_attempt_id);
 IF p_lease_token IS NULL OR a.lease_token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION 'PAYMENT_LEASE_MISMATCH'; END IF;
 IF a.state='COMPLETE' THEN
   IF a.evidence IS DISTINCT FROM p_evidence THEN RAISE EXCEPTION 'PAYMENT_EVIDENCE_CONFLICT'; END IF;
   RETURN a.result||'{"replayed":true}'::jsonb;
 END IF;
 IF a.state NOT IN ('LEASED','INTENT') OR a.lease_until IS NULL OR a.lease_until<=clock_timestamp() THEN
   RAISE EXCEPTION 'PAYMENT_LEASE_EXPIRED';
 END IF;
 inspected:=internal_receivable_payments.inspect(a.receivable_id,a.input);
 IF internal_other_credit_cancellation.snapshot(a.receivable_id) IS DISTINCT FROM a.snapshot THEN
   RAISE EXCEPTION 'PAYMENT_SNAPSHOT_CHANGED';
 END IF;
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
   OR coalesce(p_evidence->>'evidenceFingerprint','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PAYMENT_EVIDENCE_MISSING'; END IF;
 confirmed_at:=(p_evidence->>'confirmedAt')::timestamptz;
 IF confirmed_at IS NULL OR confirmed_at<clock_timestamp()-interval '2 minutes'
   OR confirmed_at>clock_timestamp()+interval '30 seconds' THEN RAISE EXCEPTION 'PAYMENT_STALE_PROOF'; END IF;
 IF inspected->>'mode'='LOCAL' THEN
   IF p_evidence->>'remoteStatus' IS DISTINCT FROM 'LOCAL' OR a.intent_at IS NOT NULL
     OR p_evidence->>'convenio' IS NOT NULL OR p_evidence->>'nossoNumero' IS NOT NULL
     OR p_evidence->'mutationAttempted' IS DISTINCT FROM 'false'::jsonb THEN
     RAISE EXCEPTION 'PAYMENT_LOCAL_PROOF_INVALID';
   END IF;
 ELSE
   IF p_evidence->>'remoteStatus' IS DISTINCT FROM 'CANCELED'
     OR p_evidence->>'convenio' IS DISTINCT FROM a.snapshot#>>'{receivable,gateway_boleto_convenio}'
     OR p_evidence->>'nossoNumero' IS DISTINCT FROM a.snapshot#>>'{receivable,gateway_boleto_nosso_numero}'
     OR p_evidence->'situationCode' IS DISTINCT FROM '5'::jsonb
     OR p_evidence->'strictEffectivePayments' IS DISTINCT FROM 'true'::jsonb
     OR p_evidence->'identityValidated' IS DISTINCT FROM 'true'::jsonb
     OR p_evidence->'termsValidated' IS DISTINCT FROM 'true'::jsonb
     OR p_evidence->'paymentsCount' IS DISTINCT FROM '0'::jsonb
     OR jsonb_typeof(p_evidence->'mutationAttempted') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_evidence->'alreadyCanceled') IS DISTINCT FROM 'boolean'
     OR p_evidence->'mutationAttempted'=p_evidence->'alreadyCanceled'
     OR (p_evidence->'mutationAttempted'='true'::jsonb AND a.intent_at IS NULL) THEN
     RAISE EXCEPTION 'PAYMENT_BANK_PROOF_INVALID';
   END IF;
 END IF;
 -- Release only within this transaction. Any failure rolls the state back; the
 -- source row remains locked through ledger append and remote-state projection.
 UPDATE internal_receivable_payments.attempts SET state='COMPLETE' WHERE id=a.id;
 v_result:=internal_financial_payments.append_payment(a.actor_id,'RECEIVABLE',a.receivable_id,a.input,inspected->>'mode'='BANK');
 IF inspected->>'mode'='BANK' THEN
   UPDATE public.payment_gateway_transactions SET remote_status='CANCELED',last_error=NULL,
     synced_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=(inspected->>'transactionId')::uuid AND receivable_id=a.receivable_id;
   UPDATE public.contas_receber SET gateway_status='CANCELED',gateway_synced_at=clock_timestamp(),
     gateway_last_error=NULL,updated_at=clock_timestamp() WHERE id=a.receivable_id;
 END IF;
 UPDATE public.banese_reconciliation_queue SET state='DONE',next_check_at=NULL,
   lease_run_id=NULL,lease_until=NULL,last_result='MANUAL_PAYMENT_RECORDED',updated_at=clock_timestamp()
   WHERE receivable_id=a.receivable_id;
 UPDATE internal_receivable_payments.attempts SET evidence=p_evidence,result=v_result,
   completed_at=clock_timestamp(),lease_until=NULL,review_reason=NULL WHERE id=a.id;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.complete_receivable_payment_service(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_receivable_payment_service(uuid,uuid,jsonb) TO service_role;
COMMIT;
