SET TRANSACTION READ WRITE;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='25s';
-- One-time removal of redundant no-op events; observations, telemetry and request responses remain.
WITH batch AS (
  SELECT e.id FROM internal_proesc.reconciliation_events e
  WHERE e.mode='AUTO' AND e.result='UNCHANGED'
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.mutation_claims m WHERE m.request_id=e.request_id)
  LIMIT 2000 FOR UPDATE OF e SKIP LOCKED
), removed AS (
  DELETE FROM internal_proesc.reconciliation_events e USING batch b WHERE e.id=b.id RETURNING 1
) SELECT count(*) deleted FROM removed;
