BEGIN;
CREATE FUNCTION public.complete_other_credit_cancellation(
 p_operation_id uuid,p_receivable_id uuid,p_lease_token uuid,p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i internal_other_credit_cancellation.items%ROWTYPE; inspected jsonb; confirmed_at timestamptz;
BEGIN
 i:=internal_other_credit_cancellation.lock_item(p_operation_id,p_receivable_id);
 IF p_lease_token IS NULL OR i.lease_token IS DISTINCT FROM p_lease_token THEN
   RAISE EXCEPTION 'CANCELLATION_LEASE_MISMATCH';
 END IF;
 IF i.state='COMPLETE' THEN
   IF i.evidence IS DISTINCT FROM p_evidence THEN RAISE EXCEPTION 'CANCELLATION_EVIDENCE_CONFLICT'; END IF;
   RETURN jsonb_build_object('completed',true);
 END IF;
 IF i.state NOT IN ('LEASED','INTENT') OR i.lease_until IS NULL OR i.lease_until<=clock_timestamp() THEN
   RAISE EXCEPTION 'CANCELLATION_LEASE_EXPIRED';
 END IF;
 inspected:=internal_other_credit_cancellation.inspect(p_receivable_id);
 IF internal_other_credit_cancellation.snapshot(p_receivable_id) IS DISTINCT FROM i.snapshot THEN
   RAISE EXCEPTION 'CANCELLATION_SNAPSHOT_CHANGED';
 END IF;
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
   OR coalesce(p_evidence->>'evidenceFingerprint','') !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'CANCELLATION_EVIDENCE_MISSING';
 END IF;
 confirmed_at:=(p_evidence->>'confirmedAt')::timestamptz;
 IF confirmed_at IS NULL OR confirmed_at<clock_timestamp()-interval '2 minutes'
   OR confirmed_at>clock_timestamp()+interval '30 seconds' THEN RAISE EXCEPTION 'CANCELLATION_STALE_PROOF'; END IF;
 IF inspected->>'mode'='LOCAL' THEN
   IF p_evidence->>'remoteStatus' IS DISTINCT FROM 'LOCAL' OR i.intent_at IS NOT NULL
     OR p_evidence->>'convenio' IS NOT NULL OR p_evidence->>'nossoNumero' IS NOT NULL
     OR p_evidence->'mutationAttempted' IS DISTINCT FROM 'false'::jsonb THEN
     RAISE EXCEPTION 'CANCELLATION_LOCAL_PROOF_INVALID';
   END IF;
 ELSE
   IF p_evidence->>'remoteStatus' IS DISTINCT FROM 'CANCELED'
     OR p_evidence->>'convenio' IS DISTINCT FROM i.snapshot#>>'{receivable,gateway_boleto_convenio}'
     OR p_evidence->>'nossoNumero' IS DISTINCT FROM i.snapshot#>>'{receivable,gateway_boleto_nosso_numero}'
     OR p_evidence->'situationCode' IS DISTINCT FROM '5'::jsonb
     OR p_evidence->'strictEffectivePayments' IS DISTINCT FROM 'true'::jsonb
     OR p_evidence->'identityValidated' IS DISTINCT FROM 'true'::jsonb
     OR p_evidence->'termsValidated' IS DISTINCT FROM 'true'::jsonb
     OR p_evidence->'paymentsCount' IS DISTINCT FROM '0'::jsonb
     OR jsonb_typeof(p_evidence->'mutationAttempted') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_evidence->'alreadyCanceled') IS DISTINCT FROM 'boolean'
     OR p_evidence->'mutationAttempted'=p_evidence->'alreadyCanceled'
     OR (p_evidence->'mutationAttempted'='true'::jsonb AND i.intent_at IS NULL) THEN
     RAISE EXCEPTION 'CANCELLATION_BANK_PROOF_INVALID';
   END IF;
   UPDATE public.payment_gateway_transactions SET remote_status='CANCELED',last_error=NULL,
     synced_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=(inspected->>'transactionId')::uuid AND receivable_id=p_receivable_id;
 END IF;
 UPDATE public.contas_receber SET status='CANCELADO',
   gateway_status=CASE WHEN inspected->>'mode'='BANK' THEN 'CANCELED' ELSE gateway_status END,
   gateway_synced_at=CASE WHEN inspected->>'mode'='BANK' THEN clock_timestamp() ELSE gateway_synced_at END,
   gateway_last_error=NULL,updated_at=clock_timestamp()
   WHERE id=p_receivable_id;
 UPDATE public.banese_reconciliation_queue SET state='DONE',next_check_at=NULL,
   lease_run_id=NULL,lease_until=NULL,last_result='CANCELED',updated_at=clock_timestamp()
   WHERE receivable_id=p_receivable_id;
 UPDATE internal_other_credit_cancellation.items SET state='COMPLETE',evidence=p_evidence,
   completed_at=clock_timestamp(),lease_until=NULL,review_reason=NULL
   WHERE operation_id=p_operation_id AND receivable_id=p_receivable_id;
 RETURN jsonb_build_object('completed',true);
END $$;
CREATE FUNCTION public.review_other_credit_cancellation(
 p_operation_id uuid,p_receivable_id uuid,p_lease_token uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i internal_other_credit_cancellation.items%ROWTYPE;
BEGIN
 PERFORM internal_other_credit_cancellation.service_only();
 -- Audit-only recovery remains possible after permission revocation or payment.
 SELECT * INTO i FROM internal_other_credit_cancellation.items
   WHERE operation_id=p_operation_id AND receivable_id=p_receivable_id FOR UPDATE;
 IF NOT FOUND OR p_lease_token IS NULL OR i.lease_token IS DISTINCT FROM p_lease_token
   OR i.state NOT IN ('LEASED','INTENT','REVIEW')
   OR p_reason IS NULL OR p_reason NOT IN ('REMOTE_PREFLIGHT_ERROR','REMOTE_AMBIGUOUS','LOCAL_SYNC_AFTER_REMOTE') THEN
   RAISE EXCEPTION 'CANCELLATION_REVIEW_SCOPE';
 END IF;
 UPDATE internal_other_credit_cancellation.items SET state='REVIEW',review_reason=p_reason,lease_until=NULL
   WHERE operation_id=p_operation_id AND receivable_id=p_receivable_id;
 RETURN jsonb_build_object('reviewed',true);
END $$;
REVOKE ALL ON FUNCTION public.complete_other_credit_cancellation(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.review_other_credit_cancellation(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_other_credit_cancellation(uuid,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_other_credit_cancellation(uuid,uuid,uuid,text) TO service_role;
COMMIT;
