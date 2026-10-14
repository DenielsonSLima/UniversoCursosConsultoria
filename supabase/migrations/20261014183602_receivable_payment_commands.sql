BEGIN;
CREATE FUNCTION public.begin_receivable_payment_secure(p_source_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a internal_receivable_payments.attempts%ROWTYPE; r jsonb; normalized jsonb; preview jsonb; request_id uuid;
BEGIN
 r:=internal_financial_payments.authorize_source(auth.uid(),'RECEIVABLE',p_source_id);
 normalized:=internal_financial_payments.normalized_input(p_source_id,(r->>'polo_id')::uuid,p_input)
   ||jsonb_build_object('fingerprint',p_input->>'fingerprint');
 request_id:=(normalized->>'requestId')::uuid;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,322));
 SELECT * INTO a FROM internal_receivable_payments.attempts WHERE id=request_id FOR UPDATE;
 IF FOUND THEN
   IF a.actor_id IS DISTINCT FROM auth.uid() OR a.receivable_id IS DISTINCT FROM p_source_id
     OR a.input IS DISTINCT FROM normalized THEN RAISE EXCEPTION 'PAYMENT_REQUEST_CONFLICT'; END IF;
   RETURN jsonb_build_object('attemptId',a.id,'sourceId',a.receivable_id);
 END IF;
 PERFORM internal_receivable_payments.inspect(p_source_id,normalized);
 preview:=internal_financial_payments.preview_for_actor(auth.uid(),'RECEIVABLE',p_source_id,normalized);
 IF preview->>'fingerprint' IS DISTINCT FROM normalized->>'fingerprint' THEN
   RAISE EXCEPTION 'PAYMENT_PREVIEW_CHANGED';
 END IF;
 INSERT INTO internal_receivable_payments.attempts(id,actor_id,receivable_id,input,snapshot)
 VALUES(request_id,auth.uid(),p_source_id,normalized,internal_other_credit_cancellation.snapshot(p_source_id));
 RETURN jsonb_build_object('attemptId',request_id,'sourceId',p_source_id);
END $$;
CREATE FUNCTION public.claim_receivable_payment_service(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a internal_receivable_payments.attempts%ROWTYPE; inspected jsonb; token uuid; mode_value text; preview jsonb;
BEGIN
 a:=internal_receivable_payments.lock_attempt(p_attempt_id);
 IF a.state='COMPLETE' THEN RETURN jsonb_build_object('mode','COMPLETE','result',a.result||'{"replayed":true}'::jsonb); END IF;
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
CREATE FUNCTION public.start_receivable_payment_service(p_attempt_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a internal_receivable_payments.attempts%ROWTYPE; inspected jsonb;
BEGIN
 a:=internal_receivable_payments.lock_attempt(p_attempt_id);
 IF a.state<>'LEASED' OR a.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL
   OR a.lease_until IS NULL OR a.lease_until<=clock_timestamp() OR a.intent_at IS NOT NULL THEN
   RAISE EXCEPTION 'PAYMENT_LEASE_OR_INTENT';
 END IF;
 inspected:=internal_receivable_payments.inspect(a.receivable_id,a.input);
 IF inspected->>'mode'<>'BANK' OR internal_other_credit_cancellation.snapshot(a.receivable_id) IS DISTINCT FROM a.snapshot THEN
   RAISE EXCEPTION 'PAYMENT_SNAPSHOT_CHANGED';
 END IF;
 PERFORM internal_financial_payments.preview_for_actor(a.actor_id,'RECEIVABLE',a.receivable_id,a.input);
 UPDATE internal_receivable_payments.attempts SET state='INTENT',intent_at=clock_timestamp(),
   lease_until=clock_timestamp()+interval '3 minutes' WHERE id=a.id;
 UPDATE public.banese_reconciliation_queue SET state='DONE',next_check_at=NULL,
   lease_run_id=NULL,lease_until=NULL,last_result='MANUAL_PAYMENT_IN_PROGRESS',updated_at=clock_timestamp()
   WHERE receivable_id=a.receivable_id;
 RETURN jsonb_build_object('started',true);
END $$;
CREATE FUNCTION public.review_receivable_payment_service(p_attempt_id uuid,p_lease_token uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a internal_receivable_payments.attempts%ROWTYPE;
BEGIN
 PERFORM internal_other_credit_cancellation.service_only();
 SELECT * INTO a FROM internal_receivable_payments.attempts WHERE id=p_attempt_id FOR UPDATE;
 IF NOT FOUND OR p_lease_token IS NULL OR a.lease_token IS DISTINCT FROM p_lease_token
   OR a.state NOT IN ('LEASED','INTENT','REVIEW') OR p_reason IS NULL
   OR p_reason NOT IN ('REMOTE_PREFLIGHT_ERROR','REMOTE_AMBIGUOUS','LOCAL_SYNC_AFTER_REMOTE') THEN
   RAISE EXCEPTION 'PAYMENT_REVIEW_SCOPE';
 END IF;
 UPDATE internal_receivable_payments.attempts SET state='REVIEW',review_reason=p_reason,lease_until=NULL WHERE id=a.id;
 RETURN jsonb_build_object('reviewed',true);
END $$;
REVOKE ALL ON FUNCTION public.begin_receivable_payment_secure(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.begin_receivable_payment_secure(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_receivable_payment_service(uuid),public.start_receivable_payment_service(uuid,uuid),
 public.review_receivable_payment_service(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_receivable_payment_service(uuid),public.start_receivable_payment_service(uuid,uuid),
 public.review_receivable_payment_service(uuid,uuid,text) TO service_role;
COMMIT;
