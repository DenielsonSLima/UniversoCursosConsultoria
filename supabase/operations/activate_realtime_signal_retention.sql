-- Release gate: the four Gestão signal subscribers must already consume INSERT.
-- Runtime operation only, after publication; no schema change or cleanup occurs here.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $activate$
DECLARE
  v_job record;
  v_function oid := pg_catalog.to_regprocedure('internal_realtime.prune_expired_signals(integer)');
  v_expected_hash constant text := '3be868d22f9e7298aa99de8485aae5483824f046702756097b24383a74986441';
  v_command constant text := 'SET statement_timeout = ''5s''; SET lock_timeout = ''1s''; SELECT internal_realtime.prune_expired_signals(5000);';
BEGIN
  IF current_user <> 'postgres' OR v_function IS NULL THEN
    RAISE EXCEPTION 'Realtime activation requires postgres and the installed maintenance function';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace
      WHERE nspname = 'internal_realtime' AND pg_catalog.pg_get_userbyid(nspowner) = 'postgres')
    OR pg_catalog.has_schema_privilege('anon', 'internal_realtime', 'USAGE')
    OR pg_catalog.has_schema_privilege('authenticated', 'internal_realtime', 'USAGE')
    OR pg_catalog.has_schema_privilege('service_role', 'internal_realtime', 'USAGE')
  THEN
    RAISE EXCEPTION 'Realtime maintenance schema owner or permission drift';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = v_function AND NOT p.prosecdef
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex') = v_expected_hash
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p,
      LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
    WHERE p.oid = v_function AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) OR pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
    OR pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Realtime maintenance function or permission drift';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'realtime-expire-signals-hourly') <> 1 THEN
    RAISE EXCEPTION 'Realtime activation requires exactly one reviewed job';
  END IF;
  SELECT * INTO v_job FROM cron.job WHERE jobname = 'realtime-expire-signals-hourly';
  IF v_job.username <> 'postgres' OR v_job.database <> current_database()
    OR v_job.schedule <> '23 * * * *' OR v_job.command <> v_command
  THEN
    RAISE EXCEPTION 'Realtime cron owner, database, schedule or command drift';
  END IF;
  IF NOT v_job.active THEN
    PERFORM cron.alter_job(v_job.jobid, active := true);
  END IF;
END;
$activate$;
COMMIT;
