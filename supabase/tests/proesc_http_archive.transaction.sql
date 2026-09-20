BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
DO $test$
DECLARE
  v_run internal_proesc.sync_runs; v_actor_auth uuid; v_polo uuid;
  v_from timestamptz; v_to timestamptz; v_rows_before text; v_rows_after text;
  v_errors_before text; v_errors_after text; v_count_before bigint; v_count_after bigint;
  v_feed_before jsonb; v_feed_after jsonb; v_scoped_before jsonb; v_scoped_after jsonb;
  v_error_feed_before jsonb; v_error_feed_after jsonb; v_dashboard_before jsonb; v_dashboard_after jsonb;
  v_result jsonb;
BEGIN
  SELECT r.* INTO STRICT v_run FROM internal_proesc.sync_runs r
    WHERE r.status IN ('SUCCEEDED','PARTIAL','FAILED','ABANDONED')
      AND coalesce(r.finished_at,r.abandoned_at)<now()-interval '24 hours'
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.packed_run_http a WHERE a.run_id=r.id)
      AND EXISTS(SELECT 1 FROM internal_proesc.sync_run_http h WHERE h.run_id=r.id AND h.error_code IS NULL)
    ORDER BY r.started_at,r.id LIMIT 1 FOR UPDATE OF r;
  v_from:=v_run.started_at-interval '1 second';
  v_to:=coalesce(v_run.finished_at,v_run.abandoned_at)+interval '1 minute';
  SELECT u.auth_user_id INTO STRICT v_actor_auth FROM internal_proesc.connection c
    JOIN public.usuarios_sistema u ON u.id=c.updated_by WHERE c.id;
  SELECT polo_id INTO STRICT v_polo FROM internal_proesc.sync_run_items WHERE run_id=v_run.id ORDER BY polo_id LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor_auth)::text,true);
  SELECT md5(string_agg(to_jsonb(h)::text,'' ORDER BY source_unit_id,source_year,source_month)),count(*)
    INTO v_rows_before,v_count_before FROM internal_proesc.sync_run_http_history h WHERE run_id=v_run.id;
  SELECT md5(coalesce(string_agg(to_jsonb(h)::text,'' ORDER BY run_id,source_unit_id,source_year,source_month),''))
    INTO v_errors_before FROM internal_proesc.sync_run_http h WHERE error_code IS NOT NULL;
  v_feed_before:=public.get_proesc_reconciliation_feed_page('runs',NULL,v_run.id,v_from,v_to,1,100);
  v_scoped_before:=public.get_proesc_reconciliation_feed_page('runs',v_polo,v_run.id,v_from,v_to,1,100);
  v_error_feed_before:=public.get_proesc_reconciliation_feed_page('errors',NULL,v_run.id,v_from,v_to,1,100);
  v_dashboard_before:=public.get_proesc_reconciliation_dashboard(NULL,v_from,v_to)->'totals';

  v_result:=internal_proesc.compact_http_telemetry(1);
  IF v_result->>'packedRuns'<>'1' OR v_result->>'historyVerified'<>'true' THEN
    RAISE EXCEPTION 'Execução HTTP não consolidada.';
  END IF;
  SELECT md5(string_agg(to_jsonb(h)::text,'' ORDER BY source_unit_id,source_year,source_month)),count(*)
    INTO v_rows_after,v_count_after FROM internal_proesc.sync_run_http_history h WHERE run_id=v_run.id;
  IF v_rows_before IS DISTINCT FROM v_rows_after OR v_count_before<>v_count_after THEN
    RAISE EXCEPTION 'Identidades, tempos, status ou conteúdo HTTP alterados.';
  END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(h)::text,'' ORDER BY run_id,source_unit_id,source_year,source_month),''))
    INTO v_errors_after FROM internal_proesc.sync_run_http h WHERE error_code IS NOT NULL;
  IF v_errors_before IS DISTINCT FROM v_errors_after THEN RAISE EXCEPTION 'Erro HTTP removido da tabela física.'; END IF;
  IF (SELECT coalesce(sum(total),0) FROM internal_proesc.sync_run_http_counts WHERE run_id=v_run.id)<>v_count_before THEN
    RAISE EXCEPTION 'Manifesto de contadores HTTP divergente.';
  END IF;
  v_feed_after:=public.get_proesc_reconciliation_feed_page('runs',NULL,v_run.id,v_from,v_to,1,100);
  v_scoped_after:=public.get_proesc_reconciliation_feed_page('runs',v_polo,v_run.id,v_from,v_to,1,100);
  v_error_feed_after:=public.get_proesc_reconciliation_feed_page('errors',NULL,v_run.id,v_from,v_to,1,100);
  v_dashboard_after:=public.get_proesc_reconciliation_dashboard(NULL,v_from,v_to)->'totals';
  IF v_feed_before IS DISTINCT FROM v_feed_after OR v_scoped_before IS DISTINCT FROM v_scoped_after
    OR v_error_feed_before IS DISTINCT FROM v_error_feed_after OR v_dashboard_before IS DISTINCT FROM v_dashboard_after THEN
    RAISE EXCEPTION 'Contrato global, por polo, erros ou dashboard HTTP alterado.';
  END IF;
  IF has_table_privilege('authenticated','internal_proesc.packed_run_http','SELECT')
    OR has_function_privilege('authenticated','internal_proesc.compact_http_telemetry(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Histórico privado HTTP exposto.';
  END IF;
END;
$test$;
ROLLBACK;
