-- Run via MCP after the actual upload/download/commit/restore pilot.
-- Zero violations are required; keeper/scope hashes must match the pre-pilot baseline.
-- Bounded observation checks use only the latest 25 archived runs.
WITH latest AS MATERIALIZED (
  SELECT * FROM internal_proesc.archived_technical_runs ORDER BY archived_at DESC,run_id LIMIT 25
), original_ids AS MATERIALIZED (
  SELECT DISTINCT unnest(original_snapshot_ids) AS id FROM latest
), storage_checks AS (
  SELECT count(*) FILTER(WHERE o.id IS NULL OR b.public IS DISTINCT FROM false
    OR (o.metadata->>'size')::bigint IS DISTINCT FROM a.compressed_bytes) AS invalid_objects
  FROM internal_proesc.technical_archive_batches a
  LEFT JOIN storage.objects o ON o.bucket_id=a.bucket AND o.name=a.object_path
  LEFT JOIN storage.buckets b ON b.id=a.bucket
  WHERE a.status='COMMITTED'
), overlap AS (
  SELECT count(*) AS invalid_overlap FROM internal_proesc.archived_technical_runs a
  WHERE EXISTS(SELECT 1 FROM internal_proesc.packed_run_items i WHERE i.run_id=a.run_id)
    OR EXISTS(SELECT 1 FROM internal_proesc.packed_run_http h WHERE h.run_id=a.run_id)
    OR EXISTS(SELECT 1 FROM internal_proesc.run_reused_observation_counts c WHERE c.run_id=a.run_id)
), refs AS (
  SELECT count(*) AS missing_observations FROM original_ids o
  WHERE NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots s WHERE s.id=o.id)
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.compacted_snapshot_observations c WHERE c.id=o.id)
), manifest_checks AS (
  SELECT count(*) AS invalid_manifests FROM internal_proesc.archived_technical_runs a
  JOIN internal_proesc.technical_archive_batches b ON b.id=a.batch_id
  WHERE b.status<>'COMMITTED'
    OR (a.item_row_count=0) IS DISTINCT FROM (a.item_content_sha256 IS NULL)
    OR (a.http_row_count=0) IS DISTINCT FROM (a.http_content_sha256 IS NULL)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(a.reused_counts) c
      WHERE c->>'run_id'<>a.run_id::text OR NOT ((c->>'polo_id')::uuid=ANY(a.polo_ids)))
), count_checks AS (
  SELECT count(*) AS invalid_scoped_totals FROM latest a
  JOIN internal_proesc.sync_runs r ON r.id=a.run_id
  CROSS JOIN LATERAL internal_proesc.run_item_counts(r.id,ARRAY(SELECT id FROM public.polos)) c
  WHERE r.telemetry_complete AND (c.claimed<>r.claimed OR c.consulted<>r.consulted
    OR c.applied<>r.applied OR c.unchanged<>r.unchanged OR c.review<>r.review OR c.failed<>r.failed)
)
SELECT now() AS observed_at,
  (SELECT invalid_objects FROM storage_checks),
  (SELECT invalid_overlap FROM overlap),
  (SELECT missing_observations FROM refs),
  (SELECT invalid_manifests FROM manifest_checks),
  (SELECT invalid_scoped_totals FROM count_checks),
  (SELECT count(*) FROM internal_proesc.technical_archive_batches WHERE status='PREPARED') AS prepared_batches,
  (SELECT count(*) FROM internal_proesc.technical_archive_batches WHERE status='COMMITTED') AS committed_batches,
  (SELECT count(*) FROM internal_proesc.archived_technical_runs) AS archived_runs,
  (SELECT md5(coalesce(string_agg(snapshot_id::text,',' ORDER BY snapshot_id),''))
    FROM internal_proesc.packed_item_snapshot_refs) AS keeper_references_hash,
  (SELECT md5(coalesce(string_agg(concat_ws(':',link_id,polo_id,class_id),',' ORDER BY link_id,polo_id,class_id),''))
    FROM internal_proesc.packed_item_scope_refs) AS scope_references_hash;
