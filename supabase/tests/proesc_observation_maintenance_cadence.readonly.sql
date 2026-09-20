-- Metadata and parsing only: EXPLAIN without ANALYZE never runs the compacting function.
BEGIN READ ONLY;
SET LOCAL statement_timeout='3s';
SET LOCAL plpgsql.check_asserts=on;
DO $test$
DECLARE v_job record; v_plan json;
BEGIN
  SELECT schedule,command INTO STRICT v_job FROM cron.job
    WHERE jobname='compact-proesc-observation-history';
  ASSERT v_job.schedule='* * * * *','Observation maintenance must run every minute';
  ASSERT v_job.command='set statement_timeout=''15s''; select internal_proesc.compact_snapshot_observations(25)',
    'Observation maintenance batch or timeout differs from the reviewed contract';
  EXECUTE 'EXPLAIN (FORMAT JSON) '||split_part(v_job.command,';',2) INTO v_plan;
  ASSERT v_plan IS NOT NULL,'Maintenance invocation failed to parse';
  ASSERT (SELECT prosecdef FROM pg_proc
    WHERE oid='internal_proesc.compact_snapshot_observations(integer)'::regprocedure),
    'Private compactor security contract changed';
END;
$test$;
ROLLBACK;
