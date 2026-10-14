BEGIN;
CREATE FUNCTION public.begin_other_credit_cancellation(p_request_id uuid,p_receivable_ids uuid[],p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; rid uuid; r public.contas_receber%ROWTYPE;
 o internal_other_credit_cancellation.operations%ROWTYPE; previous_op uuid;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR p_reason IS NULL
   OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500
   OR cardinality(p_receivable_ids) NOT BETWEEN 1 AND 25 OR p_receivable_ids IS NULL
   OR array_position(p_receivable_ids,NULL) IS NOT NULL THEN
   RAISE EXCEPTION 'CANCELLATION_INVALID_REQUEST';
 END IF;
 SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM unnest(p_receivable_ids) id;
 IF cardinality(ids)<>cardinality(p_receivable_ids) THEN RAISE EXCEPTION 'CANCELLATION_DUPLICATE_ITEMS'; END IF;
 -- Every current permission is checked before request lookup, including replay.
 FOREACH rid IN ARRAY ids LOOP
   SELECT * INTO r FROM public.contas_receber WHERE id=rid;
   IF NOT FOUND THEN RAISE EXCEPTION 'CANCELLATION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
   PERFORM internal_finance.authorize_other_credit_plan(r.polo_id);
   IF internal_other_credit_cancellation.actor_allowed(auth.uid(),r.polo_id) IS NOT TRUE THEN
     RAISE EXCEPTION 'CANCELLATION_SCOPE_DENIED' USING ERRCODE='42501';
   END IF;
 END LOOP;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,321));
 SELECT * INTO o FROM internal_other_credit_cancellation.operations WHERE id=p_request_id;
 IF FOUND THEN
   IF o.actor_id IS DISTINCT FROM auth.uid() OR o.receivable_ids IS DISTINCT FROM ids
     OR o.reason IS DISTINCT FROM btrim(p_reason) THEN RAISE EXCEPTION 'CANCELLATION_REPLAY_CONFLICT'; END IF;
   RETURN jsonb_build_object('operationId',o.id,'receivableIds',o.receivable_ids);
 END IF;
 -- Same titles retain their original durable intent across browser retries/reloads.
 SELECT operation_id INTO previous_op FROM internal_other_credit_cancellation.items
   WHERE receivable_id=ANY(ids) ORDER BY receivable_id LIMIT 1;
 IF FOUND THEN
   SELECT * INTO o FROM internal_other_credit_cancellation.operations WHERE id=previous_op;
   IF o.actor_id IS DISTINCT FROM auth.uid() OR o.receivable_ids IS DISTINCT FROM ids
     OR o.reason IS DISTINCT FROM btrim(p_reason) THEN
     RAISE EXCEPTION 'CANCELLATION_EXISTING_OPERATION';
   END IF;
   RETURN jsonb_build_object('operationId',o.id,'receivableIds',o.receivable_ids);
 END IF;
 -- Ordered row locks serialize overlapping selections; unique(receivable_id) is a final fence.
 PERFORM 1 FROM public.contas_receber WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 INSERT INTO internal_other_credit_cancellation.operations(id,actor_id,receivable_ids,reason)
   VALUES(p_request_id,auth.uid(),ids,btrim(p_reason));
 FOREACH rid IN ARRAY ids LOOP
   SELECT * INTO r FROM public.contas_receber WHERE id=rid;
   -- Recheck authorization after waiting on row locks. Eligibility is checked per item at claim.
   PERFORM internal_finance.authorize_other_credit_plan(r.polo_id);
   IF internal_other_credit_cancellation.actor_allowed(auth.uid(),r.polo_id) IS NOT TRUE THEN
     RAISE EXCEPTION 'CANCELLATION_SCOPE_DENIED' USING ERRCODE='42501';
   END IF;
   INSERT INTO internal_other_credit_cancellation.items(operation_id,receivable_id,polo_id,snapshot)
     VALUES(p_request_id,rid,r.polo_id,internal_other_credit_cancellation.snapshot(rid));
 END LOOP;
 RETURN jsonb_build_object('operationId',p_request_id,'receivableIds',ids);
END $$;
CREATE FUNCTION internal_other_credit_cancellation.lock_item(p_operation_id uuid,p_receivable_id uuid)
RETURNS internal_other_credit_cancellation.items LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o internal_other_credit_cancellation.operations%ROWTYPE;
 i internal_other_credit_cancellation.items%ROWTYPE;
BEGIN
 PERFORM internal_other_credit_cancellation.service_only();
 SELECT * INTO o FROM internal_other_credit_cancellation.operations WHERE id=p_operation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CANCELLATION_OPERATION_MISSING'; END IF;
 SELECT * INTO i FROM internal_other_credit_cancellation.items
   WHERE operation_id=p_operation_id AND receivable_id=p_receivable_id FOR UPDATE;
 IF NOT FOUND OR internal_other_credit_cancellation.actor_allowed(o.actor_id,i.polo_id) IS NOT TRUE THEN
   RAISE EXCEPTION 'CANCELLATION_SCOPE_REVOKED' USING ERRCODE='42501';
 END IF;
 RETURN i;
END $$;
CREATE FUNCTION public.claim_other_credit_cancellation(p_operation_id uuid,p_receivable_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i internal_other_credit_cancellation.items%ROWTYPE; inspected jsonb; token uuid; mode_value text;
BEGIN
 i:=internal_other_credit_cancellation.lock_item(p_operation_id,p_receivable_id);
 IF i.state='COMPLETE' THEN RETURN jsonb_build_object('mode','COMPLETE'); END IF;
 IF i.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('mode','BUSY'); END IF;
 inspected:=internal_other_credit_cancellation.inspect(p_receivable_id);
 IF internal_other_credit_cancellation.snapshot(p_receivable_id) IS DISTINCT FROM i.snapshot THEN
   RAISE EXCEPTION 'CANCELLATION_SNAPSHOT_CHANGED';
 END IF;
 token:=gen_random_uuid();
 mode_value:=CASE WHEN inspected->>'mode'='LOCAL' THEN 'LOCAL'
   WHEN i.intent_at IS NOT NULL THEN 'CONFIRM_ONLY' ELSE 'CANCEL_ALLOWED' END;
 UPDATE internal_other_credit_cancellation.items SET state='LEASED',lease_token=token,
   lease_until=clock_timestamp()+interval '3 minutes',review_reason=NULL
   WHERE operation_id=p_operation_id AND receivable_id=p_receivable_id;
 RETURN inspected || jsonb_build_object('mode',mode_value,'leaseToken',token);
END $$;
CREATE FUNCTION public.start_other_credit_cancellation(p_operation_id uuid,p_receivable_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i internal_other_credit_cancellation.items%ROWTYPE; inspected jsonb;
BEGIN
 i:=internal_other_credit_cancellation.lock_item(p_operation_id,p_receivable_id);
 IF i.state<>'LEASED' OR i.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL
   OR i.lease_until IS NULL OR i.lease_until<=clock_timestamp() OR i.intent_at IS NOT NULL THEN
   RAISE EXCEPTION 'CANCELLATION_LEASE_OR_INTENT';
 END IF;
 inspected:=internal_other_credit_cancellation.inspect(p_receivable_id);
 IF inspected->>'mode'<>'BANK' OR internal_other_credit_cancellation.snapshot(p_receivable_id) IS DISTINCT FROM i.snapshot THEN
   RAISE EXCEPTION 'CANCELLATION_SNAPSHOT_CHANGED';
 END IF;
 UPDATE internal_other_credit_cancellation.items SET state='INTENT',intent_at=clock_timestamp(),
   lease_until=clock_timestamp()+interval '3 minutes'
   WHERE operation_id=p_operation_id AND receivable_id=p_receivable_id;
 -- Queue read/claim/update is serialized by the row lock held by inspect.
 UPDATE public.contas_receber SET updated_at=clock_timestamp() WHERE id=p_receivable_id;
 UPDATE public.banese_reconciliation_queue SET state='DONE',next_check_at=NULL,
   lease_run_id=NULL,lease_until=NULL,last_result='CANCELLATION_IN_PROGRESS',updated_at=clock_timestamp()
   WHERE receivable_id=p_receivable_id;
 RETURN jsonb_build_object('started',true);
END $$;
REVOKE ALL ON FUNCTION internal_other_credit_cancellation.lock_item(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.begin_other_credit_cancellation(uuid,uuid[],text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.begin_other_credit_cancellation(uuid,uuid[],text) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_other_credit_cancellation(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.start_other_credit_cancellation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_other_credit_cancellation(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_other_credit_cancellation(uuid,uuid,uuid) TO service_role;
COMMIT;
