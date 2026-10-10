-- PREPARATION ONLY. Execute only after explicit installation/deploy/pilot approval.
-- Replace this placeholder with the ONE approved, already-prepared batch UUID.
-- No secret value is returned. Do not print the queue, request headers or Vault.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='5s';
SET LOCAL proesc.copy_batch='REPLACE_WITH_APPROVED_BATCH_UUID';

DO $pilot_preflight$
DECLARE v_batch uuid;
BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'Database operator required'; END IF;
  v_batch:=current_setting('proesc.copy_batch')::uuid;
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.v2_copy_archive_plans
    WHERE id=v_batch AND cardinality(observation_ids)=1) THEN
    RAISE EXCEPTION 'Approved copy plan with exactly one observation required';
  END IF;
  IF EXISTS(SELECT 1 FROM internal_proesc.v2_copy_archive_receipts WHERE batch_id=v_batch) THEN
    RAISE EXCEPTION 'Receipt already exists: reconcile before another invocation';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.proesc_v2_worker_service(text,jsonb)'::regprocedure)
    IS DISTINCT FROM '27e224bb4306865752b2b611fad456a3' THEN
    RAISE EXCEPTION 'Existing worker authorization changed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets
    WHERE name='proesc_sync_worker_secret' AND decrypted_secret ~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'Existing worker identity unavailable';
  END IF;
END;
$pilot_preflight$;

SELECT net.http_post(
  url:='https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/proesc-v2-copy-archive',
  body:=jsonb_build_object('batchId',current_setting('proesc.copy_batch')),
  headers:=jsonb_build_object('Content-Type','application/json','X-Proesc-Sync-Secret',
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='proesc_sync_worker_secret')),
  timeout_milliseconds:=90000
) AS request_id;
COMMIT;
