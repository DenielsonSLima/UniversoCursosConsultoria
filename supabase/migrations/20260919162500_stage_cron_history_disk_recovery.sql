SET TRANSACTION READ WRITE;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='45s';
SET LOCAL work_mem='64MB';
-- Temporary durable staging is required because VACUUM FULL lacks working disk space.
-- No commands, responses, secrets or personal data leave the database.
CREATE TABLE internal_proesc.cron_history_repack_staging (
  batch bigint PRIMARY KEY,
  payload jsonb NOT NULL,
  row_count integer NOT NULL,
  payload_sha256 text NOT NULL
);
ALTER TABLE internal_proesc.cron_history_repack_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.cron_history_repack_staging FROM PUBLIC,anon,authenticated,service_role;
LOCK TABLE cron.job_run_details IN ACCESS EXCLUSIVE MODE;
DO $copy$
DECLARE v_batch bigint; v_last bigint;
BEGIN
  SELECT min(runid)/250,max(runid)/250 INTO v_batch,v_last FROM cron.job_run_details;
  WHILE v_batch <= v_last LOOP
    INSERT INTO internal_proesc.cron_history_repack_staging
    SELECT v_batch,payload,jsonb_array_length(payload),
      encode(extensions.digest(payload::text,'sha256'),'hex')
    FROM (
      SELECT jsonb_agg(to_jsonb(d) ORDER BY runid) payload FROM cron.job_run_details d
      WHERE runid>=v_batch*250 AND runid<(v_batch+1)*250
    ) grouped WHERE payload IS NOT NULL;
    v_batch:=v_batch+1;
  END LOOP;
END;
$copy$;
DO $check$
BEGIN
  ASSERT (SELECT coalesce(sum(row_count),0) FROM internal_proesc.cron_history_repack_staging)
    = (SELECT count(*) FROM cron.job_run_details), 'Cron staging count mismatch';
  ASSERT NOT EXISTS(
    SELECT 1 FROM internal_proesc.cron_history_repack_staging b
    CROSS JOIN LATERAL jsonb_array_elements(b.payload) item
    LEFT JOIN cron.job_run_details d ON d.runid=(item->>'runid')::bigint
    WHERE d.runid IS NULL OR to_jsonb(d) IS DISTINCT FROM item
  ), 'Cron staging content mismatch';
END;
$check$;
TRUNCATE cron.job_run_details;
-- Active jobs must exist when the lock is released, so their completion update is retained.
INSERT INTO cron.job_run_details
SELECT restored.* FROM internal_proesc.cron_history_repack_staging b
CROSS JOIN LATERAL jsonb_populate_recordset(NULL::cron.job_run_details,b.payload) restored
WHERE restored.status IS NULL OR restored.status NOT IN ('succeeded','failed');
