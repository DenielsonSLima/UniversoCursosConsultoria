-- 6,417 links / 25 per minute: ~4h18 per pass including cursor wrap.
-- A six-hour hot window therefore means ~6-10h18 nominal physical residence,
-- not an absolute deadline: contention, failed attempts and new links extend it.
-- Preserve the operator's temporary pause; activation is a separate final step.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $migration$
DECLARE
  v_job record;
  v_old_command text:='set statement_timeout=''15s''; select internal_proesc.compact_snapshot_observations(10)';
  v_new_command text:='set statement_timeout=''15s''; select internal_proesc.compact_snapshot_observations(25)';
BEGIN
  SELECT jobid,schedule,command,active INTO STRICT v_job FROM cron.job
    WHERE jobname='compact-proesc-observation-history';
  IF v_job.schedule<>'1-59/2 * * * *' OR v_job.command<>v_old_command THEN
    RAISE EXCEPTION 'Observation maintenance schedule/command drift; review before changing cadence.';
  END IF;
  PERFORM cron.alter_job(v_job.jobid,schedule:='* * * * *',command:=v_new_command);
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobid=v_job.jobid
    AND jobname='compact-proesc-observation-history'
    AND schedule='* * * * *' AND command=v_new_command AND active IS NOT DISTINCT FROM v_job.active) THEN
    RAISE EXCEPTION 'Observation cadence, command or activation differs after the scheduling API.';
  END IF;
END;
$migration$;
