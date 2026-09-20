-- Completed HTTP telemetry stays queryable in SQL, packed by run with native TOAST compression.
-- Error records remain in the indexed source table; no HTTP evidence is discarded.
CREATE TABLE internal_proesc.packed_run_http (
  run_id uuid PRIMARY KEY REFERENCES internal_proesc.sync_runs(id),
  records jsonb NOT NULL CHECK (jsonb_typeof(records)='array'),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 256),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  packed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_array_length(records)=row_count)
);
ALTER TABLE internal_proesc.packed_run_http ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.packed_run_http FROM PUBLIC,anon,authenticated,service_role;

CREATE VIEW internal_proesc.sync_run_http_history WITH (security_invoker=true) AS
SELECT * FROM internal_proesc.sync_run_http
UNION ALL
SELECT a.run_id,h.source_unit_id,h.source_year,h.source_month,h.http_status,h.duration_ms,
  NULL::text AS error_code,h.recorded_at
FROM internal_proesc.packed_run_http a
CROSS JOIN LATERAL jsonb_populate_recordset(NULL::internal_proesc.sync_run_http,a.records) h;

-- One or two count rows per run; consumers sum them before rendering.
CREATE VIEW internal_proesc.sync_run_http_counts WITH (security_invoker=true) AS
SELECT run_id,count(*) AS total,count(*) FILTER(WHERE error_code IS NOT NULL) AS failed
FROM internal_proesc.sync_run_http GROUP BY run_id
UNION ALL
SELECT run_id,row_count::bigint,0::bigint FROM internal_proesc.packed_run_http;
REVOKE ALL ON internal_proesc.sync_run_http_history,internal_proesc.sync_run_http_counts
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal_proesc.compact_http_telemetry(p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='15s' AS $function$
DECLARE
  v_run uuid; v_records jsonb; v_before text; v_after text;
  v_count integer; v_deleted integer; v_runs integer:=0; v_total integer:=0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Tamanho do lote HTTP inválido.' USING ERRCODE='22023';
  END IF;
  FOR v_run IN
    SELECT r.id FROM internal_proesc.sync_runs r
    WHERE r.status IN ('SUCCEEDED','PARTIAL','FAILED','ABANDONED')
      AND coalesce(r.finished_at,r.abandoned_at)<now()-interval '24 hours'
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.packed_run_http a WHERE a.run_id=r.id)
      AND EXISTS(SELECT 1 FROM internal_proesc.sync_run_http h WHERE h.run_id=r.id AND h.error_code IS NULL)
    ORDER BY r.started_at,r.id LIMIT p_limit FOR UPDATE OF r SKIP LOCKED
  LOOP
    -- The locked, terminal run cannot be finalized by the live worker a second time.
    SELECT jsonb_agg(to_jsonb(h)-ARRAY['run_id','error_code'] ORDER BY source_unit_id,source_year,source_month),
      encode(extensions.digest(coalesce(string_agg(to_jsonb(h)::text,'' ORDER BY source_unit_id,source_year,source_month),''),'sha256'),'hex'),
      count(*) INTO v_records,v_before,v_count
    FROM internal_proesc.sync_run_http h WHERE run_id=v_run AND error_code IS NULL;
    IF v_count NOT BETWEEN 1 AND 256 THEN RAISE EXCEPTION 'Contagem HTTP fora do contrato.'; END IF;
    INSERT INTO internal_proesc.packed_run_http(run_id,records,row_count,content_sha256)
      VALUES(v_run,v_records,v_count,v_before);
    DELETE FROM internal_proesc.sync_run_http WHERE run_id=v_run AND error_code IS NULL;
    GET DIAGNOSTICS v_deleted=ROW_COUNT;
    IF v_deleted<>v_count THEN RAISE EXCEPTION 'Contagem HTTP alterada durante consolidação.'; END IF;
    SELECT encode(extensions.digest(coalesce(string_agg(to_jsonb(h)::text,'' ORDER BY source_unit_id,source_year,source_month),''),'sha256'),'hex')
      INTO v_after FROM internal_proesc.sync_run_http_history h WHERE run_id=v_run AND error_code IS NULL;
    IF v_before IS DISTINCT FROM v_after THEN
      RAISE EXCEPTION 'Identidade, horários ou conteúdo HTTP alterados.';
    END IF;
    v_runs:=v_runs+1; v_total:=v_total+v_count;
  END LOOP;
  RETURN jsonb_build_object('packedRuns',v_runs,'packedRows',v_total,'historyVerified',true);
END;
$function$;
REVOKE ALL ON FUNCTION internal_proesc.compact_http_telemetry(integer) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the complete public monitor contract, scope authorization and pagination.
-- Abort on remote drift instead of accidentally overwriting a concurrent monitor change.
DO $migration$
DECLARE v_definition text; v_old text; v_new text;
BEGIN
  v_definition:=pg_get_functiondef('public.get_proesc_reconciliation_dashboard(uuid,timestamptz,timestamptz)'::regprocedure);
  IF md5(v_definition)<>'9aea84b22b107207e6b3392a08b63b0f' THEN
    RAISE EXCEPTION 'Dashboard remoto mudou; revisar antes de aplicar arquivo HTTP.';
  END IF;
  v_old:='(select count(*) from internal_proesc.sync_run_http h join runs r on r.id=h.run_id)';
  v_new:='(select coalesce(sum(h.total),0) from internal_proesc.sync_run_http_counts h join runs r on r.id=h.run_id)';
  IF strpos(v_definition,v_old)=0 THEN RAISE EXCEPTION 'Contador HTTP do dashboard não localizado.'; END IF;
  EXECUTE replace(v_definition,v_old,v_new);

  v_definition:=pg_get_functiondef('public.get_proesc_reconciliation_feed_page(text,uuid,uuid,timestamptz,timestamptz,integer,integer)'::regprocedure);
  IF md5(v_definition)<>'fc9448bab2b973c399032ab3450c9683' THEN
    RAISE EXCEPTION 'Feed remoto mudou; revisar antes de aplicar arquivo HTTP.';
  END IF;
  v_definition:=replace(v_definition,'internal_proesc.sync_run_http','internal_proesc.sync_run_http_history');
  v_old:='select count(*) total,count(*) filter(where error_code is not null) failed'
    ||E'\n      from internal_proesc.sync_run_http_history h where h.run_id=r.id';
  v_new:='select coalesce(sum(total),0) total,coalesce(sum(failed),0) failed'
    ||E'\n      from internal_proesc.sync_run_http_counts h where h.run_id=r.id';
  IF strpos(v_definition,v_old)=0 THEN RAISE EXCEPTION 'Contador HTTP do feed não localizado.'; END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$migration$;
