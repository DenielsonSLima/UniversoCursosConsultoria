-- Existing signal TTL is 24 hours. Install bounded maintenance, initially INACTIVE.
-- Activate only after Gestão subscribers consume INSERT instead of every event.
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

DO $preflight$
DECLARE
  v_source record;
  v_table text;
  v_oid oid;
  v_schema oid := pg_catalog.to_regnamespace('internal_realtime');
  v_function oid := pg_catalog.to_regprocedure('internal_realtime.prune_expired_signals(integer)');
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Realtime retention must be installed by postgres';
  END IF;
  -- Fail closed if an existing producer no longer establishes the reviewed TTL.
  FOR v_source IN SELECT * FROM (VALUES
    ('public.emit_finance_realtime_event()',
     'bfeb958a43876d59b46fcdc6f9726129b52a833f028a85d0280b3ad7d0033274'),
    ('public.emit_caixa_realtime_event()',
     '6d12eb69faf31120552875434a7f5d7cd8573e83e9c4f8e9bf862b7e599b4944'),
    ('public.emit_turma_gestao_realtime_event()',
     '4ea096926acbc937d2fec7c559253a78b8ee3a244c000cc116e76836374ac29a'),
    ('public.insert_portal_realtime_signal(text,text,uuid,uuid)',
     '6350ecd2e03cf6f0f08e837e4357f77dafa1ff71efe8a05ff0a0c74b1d4fda6b')
  ) AS sources(signature, expected_hash)
  LOOP
    v_oid := pg_catalog.to_regprocedure(v_source.signature);
    IF v_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = v_oid
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex') = v_source.expected_hash
    ) THEN
      RAISE EXCEPTION 'Realtime TTL producer drift: review %', v_source.signature;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'finance_realtime_events', 'gestao_realtime_events', 'portal_realtime_signals'
  ] LOOP
    v_oid := pg_catalog.to_regclass('public.' || v_table);
    IF v_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid = v_oid
        AND c.relkind = 'r' AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
    ) OR (SELECT count(*) FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = v_oid AND NOT a.attisdropped AND a.attnotnull
        AND ((a.attname = 'id' AND a.atttypid = 'bigint'::regtype)
          OR (a.attname = 'created_at' AND a.atttypid = 'timestamptz'::regtype))) <> 2
    THEN
      RAISE EXCEPTION 'Realtime signal table/column/owner drift: %', v_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute a
        ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = v_oid AND i.indisprimary AND i.indisvalid
        AND i.indnkeyatts = 1 AND a.attname = 'id'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute a
        ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = v_oid AND i.indisvalid AND i.indisready
        AND i.indpred IS NULL AND a.attname = 'created_at'
    ) THEN
      RAISE EXCEPTION 'Realtime signal index drift: %', v_table;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE contype = 'f' AND (conrelid = v_oid OR confrelid = v_oid))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = v_oid)
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_depend d
        JOIN pg_catalog.pg_rewrite r ON r.oid = d.objid
        WHERE d.classid = 'pg_catalog.pg_rewrite'::regclass
          AND d.refclassid = 'pg_catalog.pg_class'::regclass AND d.refobjid = v_oid)
    THEN
      RAISE EXCEPTION 'Realtime signal dependency drift: %', v_table;
    END IF;
  END LOOP;

  IF v_schema IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace WHERE oid = v_schema
      AND pg_catalog.pg_get_userbyid(nspowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'Realtime maintenance schema owner drift';
  END IF;
  IF v_function IS NOT NULL AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.pg_get_functiondef(v_function), 'UTF8')), 'hex') <>
    '3be868d22f9e7298aa99de8485aae5483824f046702756097b24383a74986441' THEN
    RAISE EXCEPTION 'Realtime maintenance function drift';
  END IF;
END;
$preflight$;

CREATE SCHEMA IF NOT EXISTS internal_realtime AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA internal_realtime FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal_realtime.prune_expired_signals(p_limit integer DEFAULT 5000)
RETURNS TABLE(finance_deleted integer, gestao_deleted integer, portal_deleted integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '5s'
SET lock_timeout = '1s'
AS $function$
DECLARE
  v_cutoff timestamptz := pg_catalog.now() - interval '24 hours';
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Realtime maintenance is private' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'Realtime retention limit must be between 1 and 5000' USING ERRCODE = '22023';
  END IF;
  finance_deleted := 0;
  gestao_deleted := 0;
  portal_deleted := 0;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('internal_realtime.prune_expired_signals', 0)
  ) THEN
    RETURN NEXT;
    RETURN;
  END IF;

  WITH expired AS (
    SELECT s.id FROM public.finance_realtime_events s
    WHERE s.created_at < v_cutoff
    ORDER BY s.created_at, s.id LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.finance_realtime_events s USING expired e
  WHERE s.id = e.id AND s.created_at < v_cutoff;
  GET DIAGNOSTICS finance_deleted = ROW_COUNT;

  WITH expired AS (
    SELECT s.id FROM public.gestao_realtime_events s
    WHERE s.created_at < v_cutoff
    ORDER BY s.created_at, s.id LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.gestao_realtime_events s USING expired e
  WHERE s.id = e.id AND s.created_at < v_cutoff;
  GET DIAGNOSTICS gestao_deleted = ROW_COUNT;

  WITH expired AS (
    SELECT s.id FROM public.portal_realtime_signals s
    WHERE s.created_at < v_cutoff
    ORDER BY s.created_at, s.id LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.portal_realtime_signals s USING expired e
  WHERE s.id = e.id AND s.created_at < v_cutoff;
  GET DIAGNOSTICS portal_deleted = ROW_COUNT;
  RETURN NEXT;
END;
$function$;

ALTER FUNCTION internal_realtime.prune_expired_signals(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal_realtime.prune_expired_signals(integer)
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION internal_realtime.prune_expired_signals(integer) IS
  'Expires only ephemeral Realtime signals under their existing 24-hour TTL; bounded and private.';

DO $schedule$
DECLARE
  v_job record;
  v_job_id bigint;
  v_name constant text := 'realtime-expire-signals-hourly';
  v_schedule constant text := '23 * * * *';
  v_command constant text := 'SET statement_timeout = ''5s''; SET lock_timeout = ''1s''; SELECT internal_realtime.prune_expired_signals(5000);';
BEGIN
  IF (SELECT count(*) FROM cron.job WHERE jobname = v_name) > 1 THEN
    RAISE EXCEPTION 'Realtime cron name is not unique';
  END IF;
  SELECT * INTO v_job FROM cron.job WHERE jobname = v_name;
  IF FOUND THEN
    IF v_job.username <> 'postgres' OR v_job.database <> current_database()
      OR v_job.schedule <> v_schedule OR v_job.command <> v_command OR v_job.active
    THEN
      RAISE EXCEPTION 'Realtime cron drift: installation expects the reviewed inactive job';
    END IF;
  ELSE
    v_job_id := cron.schedule(v_name, v_schedule, v_command);
    PERFORM cron.alter_job(v_job_id, active := false);
  END IF;
END;
$schedule$;
