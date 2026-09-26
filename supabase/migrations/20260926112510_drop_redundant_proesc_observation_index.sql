-- Remove only the narrow index whose ordered keys are covered by the retained
-- index. No rows, RLS policies, functions, grants or financial states are changed.
-- Both representative plans are validated before COMMIT; a failure restores DDL.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
SET LOCAL row_security = off;

DO $index_maintenance$
DECLARE
  v_table constant regclass := 'internal_proesc.financial_snapshots'::regclass;
  v_small constant regclass := 'internal_proesc.proesc_observations_feed_time_idx'::regclass;
  v_cover constant regclass := 'internal_proesc.proesc_monitor_observations_cover_idx'::regclass;
  v_small_metadata pg_index%ROWTYPE;
  v_cover_metadata pg_index%ROWTYPE;
  v_cover_before jsonb;
  v_table_before jsonb;
  v_columns_before jsonb;
  v_policies_before jsonb;
  v_index_definition constant text := 'CREATE INDEX proesc_observations_feed_time_idx ON internal_proesc.financial_snapshots USING btree (observed_at DESC, id DESC)';
  v_cover_definition constant text := 'CREATE INDEX proesc_monitor_observations_cover_idx ON internal_proesc.financial_snapshots USING btree (observed_at DESC, id DESC) INCLUDE (link_id, verification)';
  v_feed constant text := $query$
    SELECT id, observed_at, link_id, verification
    FROM internal_proesc.financial_snapshots
    WHERE observed_at >= timestamptz '2026-09-19 00:00:00Z'
      AND observed_at < timestamptz '2026-09-27 00:00:00Z'
    ORDER BY observed_at DESC, id DESC LIMIT 20
  $query$;
  v_count constant text := $query$
    SELECT count(*) FROM internal_proesc.financial_snapshots
    WHERE observed_at >= timestamptz '2026-09-19 00:00:00Z'
      AND observed_at < timestamptz '2026-09-27 00:00:00Z'
  $query$;
  v_query text;
  v_before_plan jsonb;
  v_after_plan jsonb;
  v_before_plans jsonb[] := ARRAY[]::jsonb[];
  v_position integer := 0;
  v_bytes bigint;
BEGIN
  IF current_user <> 'postgres' OR current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'Observation index maintenance requires the reviewed writable session.';
  END IF;
  -- Normal DROP INDEX also requires this table lock. Acquire it before metadata
  -- inspection and planning, with a short fail-fast timeout instead of retrying.
  LOCK TABLE ONLY internal_proesc.financial_snapshots IN ACCESS EXCLUSIVE MODE;
  SELECT * INTO STRICT v_small_metadata FROM pg_index WHERE indexrelid = v_small;
  SELECT * INTO STRICT v_cover_metadata FROM pg_index WHERE indexrelid = v_cover;
  IF pg_get_indexdef(v_small) IS DISTINCT FROM v_index_definition
    OR pg_get_indexdef(v_cover) IS DISTINCT FROM v_cover_definition
    OR v_small_metadata.indrelid <> v_table OR v_cover_metadata.indrelid <> v_table
    OR v_small_metadata.indnkeyatts <> 2 OR v_small_metadata.indnatts <> 2
    OR v_cover_metadata.indnkeyatts <> 2 OR v_cover_metadata.indnatts <> 4
    OR v_small_metadata.indkey::text <> '3 1'
    OR v_cover_metadata.indkey::text <> '3 1 2 9'
    OR v_small_metadata.indclass IS DISTINCT FROM v_cover_metadata.indclass
    OR v_small_metadata.indcollation IS DISTINCT FROM v_cover_metadata.indcollation
    OR v_small_metadata.indoption IS DISTINCT FROM v_cover_metadata.indoption
    OR v_small_metadata.indexprs IS NOT NULL OR v_cover_metadata.indexprs IS NOT NULL
    OR v_small_metadata.indpred IS NOT NULL OR v_cover_metadata.indpred IS NOT NULL THEN
    RAISE EXCEPTION 'Observation indexes no longer have the reviewed equivalent keys.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    JOIN pg_am a ON a.oid=c.relam
    WHERE i.indexrelid IN (v_small,v_cover)
      AND (i.indisunique OR i.indisprimary OR i.indisexclusion OR i.indisreplident
        OR i.indisclustered OR NOT i.indisvalid OR NOT i.indisready OR NOT i.indislive
        OR a.amname <> 'btree' OR c.relispartition OR c.relkind <> 'i')
  ) OR EXISTS (SELECT 1 FROM pg_constraint WHERE conindid IN (v_small,v_cover))
    OR EXISTS (SELECT 1 FROM pg_depend
               WHERE refclassid='pg_class'::regclass AND refobjid=v_small)
    OR EXISTS (SELECT 1 FROM pg_depend
               WHERE classid='pg_class'::regclass AND objid IN (v_small,v_cover)
                 AND deptype NOT IN ('a','n')) THEN
    RAISE EXCEPTION 'Observation index dependency, validity or ownership contract changed.';
  END IF;
  v_bytes := pg_relation_size(v_small);
  IF v_bytes NOT BETWEEN 1000000 AND 4000000 THEN
    RAISE EXCEPTION 'Observation index size differs from the reviewed maintenance budget.';
  END IF;
  SELECT to_jsonb(i) INTO v_cover_before FROM pg_index i WHERE indexrelid=v_cover;
  SELECT to_jsonb(c) INTO v_table_before FROM pg_class c WHERE oid=v_table;
  SELECT jsonb_agg(to_jsonb(a) ORDER BY attnum) INTO v_columns_before
    FROM pg_attribute a WHERE attrelid=v_table;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) INTO v_policies_before
    FROM pg_policy p WHERE polrelid=v_table;
  FOREACH v_query IN ARRAY ARRAY[v_feed,v_count] LOOP
    EXECUTE 'EXPLAIN (FORMAT JSON) ' || v_query INTO v_before_plan;
    v_before_plans := array_append(v_before_plans,v_before_plan);
  END LOOP;

  DROP INDEX internal_proesc.proesc_observations_feed_time_idx RESTRICT;

  FOREACH v_query IN ARRAY ARRAY[v_feed,v_count] LOOP
    v_position := v_position + 1;
    EXECUTE 'EXPLAIN (FORMAT JSON) ' || v_query INTO v_after_plan;
    IF NOT jsonb_path_exists(v_after_plan,
      '$.** ? (@."Node Type" == "Index Only Scan" && @."Index Name" == "proesc_monitor_observations_cover_idx")')
      OR jsonb_path_exists(v_after_plan,
        '$.** ? (@."Node Type" == "Seq Scan" || @."Node Type" == "Sort")')
      OR (v_after_plan #>> '{0,Plan,Total Cost}')::numeric >
         (v_before_plans[v_position] #>> '{0,Plan,Total Cost}')::numeric * 1.25
      OR (v_after_plan #>> '{0,Plan,Plan Rows}')::numeric IS DISTINCT FROM
         (v_before_plans[v_position] #>> '{0,Plan,Plan Rows}')::numeric THEN
      RAISE EXCEPTION 'Observation plan regressed after index removal; rolling back.';
    END IF;
  END LOOP;
  IF to_regclass('internal_proesc.proesc_observations_feed_time_idx') IS NOT NULL
    OR pg_get_indexdef(v_cover) IS DISTINCT FROM v_cover_definition
    OR v_cover_before IS DISTINCT FROM (SELECT to_jsonb(i) FROM pg_index i WHERE indexrelid=v_cover)
    OR v_table_before IS DISTINCT FROM (SELECT to_jsonb(c) FROM pg_class c WHERE oid=v_table)
    OR v_columns_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(a) ORDER BY attnum)
        FROM pg_attribute a WHERE attrelid=v_table)
    OR v_policies_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY oid)
        FROM pg_policy p WHERE polrelid=v_table) THEN
    RAISE EXCEPTION 'Observation table or retained index metadata changed; rolling back.';
  END IF;
  RAISE NOTICE 'Removed one redundant observation index; released index bytes=%',v_bytes;
END;
$index_maintenance$;
COMMIT;
