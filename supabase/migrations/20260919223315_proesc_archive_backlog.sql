-- Private bounded drain for the existing archive backlog. Normal cron stays at one batch.
CREATE FUNCTION internal_proesc.enqueue_receipt_archive_backlog(p_max_batches integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='10s'
AS $function$
DECLARE v_state internal_proesc.receipt_archive_runtime; v_secret text; v_request bigint;
BEGIN
  IF p_max_batches IS NULL OR p_max_batches NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Invalid archive batch count' USING ERRCODE='22023';
  END IF;
  SELECT * INTO STRICT v_state FROM internal_proesc.receipt_archive_runtime WHERE singleton FOR UPDATE;
  IF v_state.last_request_id IS NOT NULL AND v_state.last_enqueued_at>now()-interval '3 minutes'
    AND NOT EXISTS(SELECT 1 FROM net._http_response WHERE id=v_state.last_request_id) THEN
    RETURN jsonb_build_object('scheduled',false,'reason','IN_FLIGHT');
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='proesc_sync_worker_secret';
  IF v_secret IS NULL THEN RAISE EXCEPTION 'Archive worker unavailable' USING ERRCODE='42501'; END IF;
  v_request:=net.http_post(
    url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/proesc-history-archive',
    body:=jsonb_build_object('limit',500,'maxBatches',p_max_batches),
    headers:=jsonb_build_object('Content-Type','application/json','X-Proesc-Sync-Secret',v_secret),
    timeout_milliseconds:=120000
  );
  UPDATE internal_proesc.receipt_archive_runtime SET last_request_id=v_request,last_enqueued_at=now()
    WHERE singleton;
  RETURN jsonb_build_object('scheduled',true,'requestId',v_request);
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.enqueue_receipt_archive_backlog(integer)
  FROM PUBLIC,anon,authenticated,service_role;
