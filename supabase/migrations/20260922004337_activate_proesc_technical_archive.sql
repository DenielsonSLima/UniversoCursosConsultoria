-- Enable only after an actual private upload, authorized cold read, and exact restoration.
-- This guard consumes the real worker response; no synthetic Storage or commit evidence.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='5s';
SET LOCAL timezone='UTC';
DO $activation$
DECLARE
  v_pilot jsonb; v_batch internal_proesc.technical_archive_batches;
  v_run_id uuid; v_source text; v_function regprocedure; v_signature text; v_job_id bigint;
  v_command text:='set statement_timeout=''10s''; select internal_proesc.enqueue_technical_archive(25,1,false,false)';
BEGIN
  SELECT h.content::jsonb INTO STRICT v_pilot
  FROM internal_proesc.technical_archive_runtime r JOIN net._http_response h ON h.id=r.last_request_id
  WHERE r.singleton AND r.readers_ready AND h.status_code=200 AND NOT coalesce(h.timed_out,true);
  IF v_pilot->>'lastStatus' IS DISTINCT FROM 'COMMITTED'
    OR v_pilot->'batches' IS DISTINCT FROM '1'::jsonb
    OR v_pilot->'readerVerified' IS DISTINCT FROM 'true'::jsonb
    OR v_pilot->'restored' IS DISTINCT FROM 'true'::jsonb
    OR NOT coalesce(v_pilot->>'pilotBatchId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
    OR NOT coalesce(v_pilot->>'pilotRunId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) THEN
    RAISE EXCEPTION 'Real one-run technical archive pilot is not verified';
  END IF;
  v_run_id:=(v_pilot->>'pilotRunId')::uuid;
  SELECT * INTO STRICT v_batch FROM internal_proesc.technical_archive_batches
    WHERE id=(v_pilot->>'pilotBatchId')::uuid AND status='COMMITTED' AND run_count=1 AND payload_text IS NULL;
  IF NOT EXISTS(SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id
    WHERE o.bucket_id=v_batch.bucket AND o.name=v_batch.object_path AND NOT b.public
      AND (o.metadata->>'size')::bigint=v_batch.compressed_bytes)
    OR EXISTS(SELECT 1 FROM internal_proesc.archived_technical_runs WHERE run_id=v_run_id OR batch_id=v_batch.id)
    OR EXISTS(SELECT 1 FROM internal_proesc.technical_archive_batches WHERE status='PREPARED') THEN
    RAISE EXCEPTION 'Pilot object/restoration is incomplete or an archive is still in flight';
  END IF;
  SELECT jsonb_build_object('formatVersion',1,'kind','proesc-technical-history','runs',jsonb_build_array(
    jsonb_build_object('runId',v_run_id,
      'items',(SELECT to_jsonb(i) FROM internal_proesc.packed_run_items i WHERE i.run_id=v_run_id),
      'http',(SELECT to_jsonb(h) FROM internal_proesc.packed_run_http h WHERE h.run_id=v_run_id),
      'reusedCounts',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.polo_id,c.class_id),'[]'::jsonb)
        FROM internal_proesc.run_reused_observation_counts c WHERE c.run_id=v_run_id))
  ))::text INTO v_source;
  IF encode(extensions.digest(v_source,'sha256'),'hex') IS DISTINCT FROM v_batch.payload_sha256 THEN
    RAISE EXCEPTION 'Restored pilot source does not match the verified archive';
  END IF;
  -- All public archive RPCs remain private to service_role; enqueue is database-owner only.
  FOR v_signature IN SELECT signature FROM (VALUES
    ('public.proesc_prepare_technical_archive_service(integer)'),
    ('public.proesc_commit_technical_archive_service(uuid,uuid,text,text,integer)'),
    ('public.proesc_restore_technical_archive_service(uuid,text)'),
    ('public.proesc_technical_archive_state_service(uuid,uuid,boolean)'),
    ('public.proesc_technical_history_service(uuid,uuid,uuid,text)')
  ) expected(signature)
  LOOP
    v_function:=to_regprocedure(v_signature);
    IF v_function IS NULL OR has_function_privilege('anon',v_function,'EXECUTE')
      OR has_function_privilege('authenticated',v_function,'EXECUTE')
      OR NOT has_function_privilege('service_role',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'Technical archive RPC grants differ from the reviewed contract';
    END IF;
  END LOOP;
  IF to_regprocedure('public.proesc_technical_history_service(uuid,uuid,uuid,text)') IS NULL
    OR has_function_privilege('service_role','internal_proesc.enqueue_technical_archive(integer,integer,boolean,boolean)','EXECUTE')
    OR has_function_privilege('anon','internal_proesc.enqueue_technical_archive(integer,integer,boolean,boolean)','EXECUTE')
    OR has_function_privilege('authenticated','internal_proesc.enqueue_technical_archive(integer,integer,boolean,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'Technical archive reader or enqueue privilege contract differs';
  END IF;
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='archive-proesc-technical-history'
    AND (command IS DISTINCT FROM v_command OR username IS DISTINCT FROM current_user)) THEN
    RAISE EXCEPTION 'Technical archive cron has an unexpected owner or command';
  END IF;
  UPDATE internal_proesc.technical_archive_runtime SET enabled=true WHERE singleton;
  -- Odd minutes avoid the every-two-minute financial dispatcher; one bounded batch per tick.
  SELECT cron.schedule('archive-proesc-technical-history','9,29,49 * * * *',v_command) INTO v_job_id;
  PERFORM cron.alter_job(v_job_id,active:=true);
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobid=v_job_id AND active AND schedule='9,29,49 * * * *'
    AND command=v_command) THEN RAISE EXCEPTION 'Technical archive cron activation did not match'; END IF;
END;
$activation$;
