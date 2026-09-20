BEGIN;
SET TRANSACTION READ WRITE;
SET LOCAL statement_timeout='30s';
DO $restore$
DECLARE b internal_proesc.cron_history_repack_staging;
BEGIN
  FOR b IN SELECT * FROM internal_proesc.cron_history_repack_staging ORDER BY batch LOOP
    ASSERT encode(extensions.digest(b.payload::text,'sha256'),'hex')=b.payload_sha256,
      'Backup integrity mismatch';
    ASSERT jsonb_array_length(b.payload)=b.row_count,'Backup count mismatch';
    INSERT INTO cron.job_run_details
    SELECT restored.* FROM jsonb_populate_recordset(NULL::cron.job_run_details,b.payload) restored
    WHERE restored.status IN ('succeeded','failed')
    ON CONFLICT(runid) DO NOTHING;
    ASSERT NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(b.payload) item
      LEFT JOIN cron.job_run_details d ON d.runid=(item->>'runid')::bigint
      WHERE d.runid IS NULL OR (item->>'status' IN ('succeeded','failed') AND to_jsonb(d) IS DISTINCT FROM item)
    ), 'Restored log differs from backup';
  END LOOP;
END;
$restore$;
COMMIT;
