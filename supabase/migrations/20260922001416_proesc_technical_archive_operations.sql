-- Enqueue only. Activation belongs to the independently verified pilot and readers gate.
CREATE FUNCTION internal_proesc.enqueue_technical_archive(
  p_limit integer DEFAULT 25,p_max_batches integer DEFAULT 1,
  p_force boolean DEFAULT false,p_verify_restore boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='10s' AS $function$
DECLARE v_state internal_proesc.technical_archive_runtime; v_secret text; v_request bigint;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 OR p_max_batches IS NULL OR p_max_batches NOT BETWEEN 1 AND 5
    OR p_force IS NULL OR p_verify_restore IS NULL OR (p_verify_restore AND (p_limit<>1 OR p_max_batches<>1)) THEN
    RAISE EXCEPTION 'Invalid technical archive invocation' USING ERRCODE='22023';
  END IF;
  SELECT * INTO STRICT v_state FROM internal_proesc.technical_archive_runtime WHERE singleton FOR UPDATE;
  IF NOT v_state.readers_ready THEN RAISE EXCEPTION 'Technical readers unavailable' USING ERRCODE='55000'; END IF;
  IF NOT v_state.enabled AND NOT p_force THEN RETURN jsonb_build_object('scheduled',false,'reason','DISABLED'); END IF;
  IF v_state.last_request_id IS NOT NULL AND v_state.last_enqueued_at>now()-interval '3 minutes'
    AND NOT EXISTS(SELECT 1 FROM net._http_response WHERE id=v_state.last_request_id) THEN
    RETURN jsonb_build_object('scheduled',false,'reason','IN_FLIGHT');
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='proesc_sync_worker_secret';
  IF v_secret IS NULL THEN RAISE EXCEPTION 'Technical archive authorization unavailable' USING ERRCODE='42501'; END IF;
  v_request:=net.http_post(
    url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/proesc-technical-history-archive',
    body:=jsonb_build_object('limit',p_limit,'maxBatches',p_max_batches,'verifyRestore',p_verify_restore),
    headers:=jsonb_build_object('Content-Type','application/json','X-Proesc-Sync-Secret',v_secret),
    timeout_milliseconds:=120000
  );
  UPDATE internal_proesc.technical_archive_runtime SET last_request_id=v_request,last_enqueued_at=now() WHERE singleton;
  RETURN jsonb_build_object('scheduled',true,'requestId',v_request);
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.enqueue_technical_archive(integer,integer,boolean,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
-- No cron is created and enabled stays false until the real upload/read/restore pilot passes.
