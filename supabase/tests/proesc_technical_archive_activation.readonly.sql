-- SELECT-only post-activation check. No secrets or cron command text are returned.
WITH job AS (
  SELECT jobid,active,schedule,
    command='set statement_timeout=''10s''; select internal_proesc.enqueue_technical_archive(25,1,false,false)' AS bounded_command
  FROM cron.job WHERE jobname='archive-proesc-technical-history'
), invalid_objects AS (
  SELECT count(*) AS violations FROM internal_proesc.technical_archive_batches a
  LEFT JOIN storage.objects o ON o.bucket_id=a.bucket AND o.name=a.object_path
  LEFT JOIN storage.buckets b ON b.id=a.bucket
  WHERE a.status='COMMITTED' AND (o.id IS NULL OR b.public IS DISTINCT FROM false
    OR (o.metadata->>'size')::bigint IS DISTINCT FROM a.compressed_bytes OR a.payload_text IS NOT NULL)
), overlap AS (
  SELECT count(*) AS violations FROM internal_proesc.archived_technical_runs a
  WHERE EXISTS(SELECT 1 FROM internal_proesc.packed_run_items i WHERE i.run_id=a.run_id)
    OR EXISTS(SELECT 1 FROM internal_proesc.packed_run_http h WHERE h.run_id=a.run_id)
    OR EXISTS(SELECT 1 FROM internal_proesc.run_reused_observation_counts c WHERE c.run_id=a.run_id)
)
SELECT now() AS observed_at,r.enabled,r.readers_ready,
  (SELECT count(*) FROM job) AS registered_jobs,
  (SELECT bool_and(active AND schedule='9,29,49 * * * *' AND bounded_command) FROM job) AS job_contract_valid,
  (SELECT violations FROM invalid_objects) AS invalid_objects,
  (SELECT violations FROM overlap) AS source_archive_overlaps,
  (SELECT count(*) FROM internal_proesc.technical_archive_batches WHERE status='PREPARED') AS prepared_batches,
  (SELECT count(*) FROM internal_proesc.technical_archive_batches WHERE status='COMMITTED') AS committed_batches,
  (SELECT count(*) FROM internal_proesc.archived_technical_runs) AS archived_runs,
  r.last_enqueued_at,h.status_code AS latest_http_status,h.timed_out AS latest_http_timed_out,
  (SELECT count(*) FROM cron.job_run_details d JOIN job j USING(jobid)
    WHERE d.start_time>now()-interval '24 hours' AND d.status='failed') AS failed_cron_executions
FROM internal_proesc.technical_archive_runtime r LEFT JOIN net._http_response h ON h.id=r.last_request_id
WHERE r.singleton;
