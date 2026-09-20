-- All retained terminal cron rows were restored and compared byte-for-byte.
-- Rows that aged out under the seven-day success policy may already be gone.
DO $verify$
DECLARE b internal_proesc.cron_history_repack_staging;
BEGIN
  FOR b IN SELECT * FROM internal_proesc.cron_history_repack_staging LOOP
    IF encode(extensions.digest(b.payload::text,'sha256'),'hex')<>b.payload_sha256 THEN
      RAISE EXCEPTION 'Cron staging integrity mismatch';
    END IF;
    -- Idempotent recovery also makes the versioned migration chain self-contained.
    INSERT INTO cron.job_run_details
    SELECT restored.* FROM jsonb_populate_recordset(NULL::cron.job_run_details,b.payload) restored
    WHERE restored.status='failed' OR
      (restored.status='succeeded' AND restored.end_time>=now()-interval '7 days')
    ON CONFLICT(runid) DO NOTHING;
    IF EXISTS(
      SELECT 1 FROM jsonb_array_elements(b.payload) item
      LEFT JOIN cron.job_run_details d ON d.runid=(item->>'runid')::bigint
      WHERE (item->>'status'='failed' OR
        (item->>'status'='succeeded' AND (item->>'end_time')::timestamptz>=now()-interval '7 days'))
        AND (d.runid IS NULL OR to_jsonb(d) IS DISTINCT FROM item)
    ) THEN RAISE EXCEPTION 'Retained cron history was not restored'; END IF;
  END LOOP;
END;
$verify$;
DROP TABLE internal_proesc.cron_history_repack_staging;
-- Offset from the financial worker's even minutes; small batches bound production contention.
SELECT cron.schedule('compact-proesc-observation-history','1-59/2 * * * *',
  'set statement_timeout=''15s''; select internal_proesc.compact_snapshot_observations(10)');
