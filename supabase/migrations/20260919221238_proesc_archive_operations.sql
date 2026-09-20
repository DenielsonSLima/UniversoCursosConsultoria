-- Client access remains denied even if a future permissive Storage policy is broad.
CREATE POLICY proesc_history_server_only ON storage.objects AS RESTRICTIVE
FOR ALL TO anon,authenticated
USING (bucket_id<>'proesc-history') WITH CHECK (bucket_id<>'proesc-history');

CREATE TABLE internal_proesc.receipt_archive_runtime (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  last_request_id bigint,
  last_enqueued_at timestamptz
);
ALTER TABLE internal_proesc.receipt_archive_runtime ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.receipt_archive_runtime FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO internal_proesc.receipt_archive_runtime(singleton) VALUES(true);

CREATE FUNCTION internal_proesc.enqueue_receipt_archive(
  p_limit integer DEFAULT 500,p_force boolean DEFAULT false,p_verify_restore boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='10s'
AS $function$
DECLARE v_state internal_proesc.receipt_archive_runtime; v_secret text; v_request bigint;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
    OR p_force IS NULL OR p_verify_restore IS NULL OR (p_verify_restore AND p_limit<>1) THEN
    RAISE EXCEPTION 'Invalid archive invocation limits' USING ERRCODE='22023';
  END IF;
  SELECT * INTO STRICT v_state FROM internal_proesc.receipt_archive_runtime WHERE singleton FOR UPDATE;
  IF NOT v_state.enabled AND NOT p_force THEN
    RETURN jsonb_build_object('scheduled',false,'reason','DISABLED');
  END IF;
  IF v_state.last_request_id IS NOT NULL AND v_state.last_enqueued_at>now()-interval '3 minutes'
    AND NOT EXISTS(SELECT 1 FROM net._http_response WHERE id=v_state.last_request_id) THEN
    RETURN jsonb_build_object('scheduled',false,'reason','IN_FLIGHT');
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='proesc_sync_worker_secret';
  IF v_secret IS NULL THEN RAISE EXCEPTION 'Archive worker unavailable' USING ERRCODE='42501'; END IF;
  v_request:=net.http_post(
    url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/proesc-history-archive',
    body:=jsonb_build_object('limit',p_limit,'verifyRestore',p_verify_restore),
    headers:=jsonb_build_object('Content-Type','application/json','X-Proesc-Sync-Secret',v_secret),
    timeout_milliseconds:=120000
  );
  UPDATE internal_proesc.receipt_archive_runtime SET last_request_id=v_request,last_enqueued_at=now()
    WHERE singleton;
  RETURN jsonb_build_object('scheduled',true,'requestId',v_request);
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.enqueue_receipt_archive(integer,boolean,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
-- The runtime gate stays disabled until the real upload/restore pilot is validated.
SELECT cron.schedule('archive-proesc-receipts','7-59/10 * * * *',
  'select internal_proesc.enqueue_receipt_archive()');
