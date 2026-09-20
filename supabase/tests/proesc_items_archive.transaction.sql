-- A cloned terminal run exercises packing and append without modifying real telemetry.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $test$
DECLARE
  v_source internal_proesc.sync_runs; v_fixture uuid:=gen_random_uuid(); v_actor_auth uuid; v_polo uuid;
  v_error_link uuid; v_deferred_link uuid; v_missing_link uuid; v_original uuid; v_lookup uuid;
  v_from timestamptz; v_to timestamptz; v_before text; v_after text; v_finance_before text; v_finance_after text;
  v_feed_before jsonb; v_feed_after jsonb; v_scoped_before jsonb; v_scoped_after jsonb;
  v_observations_before jsonb; v_observations_after jsonb; v_errors_before jsonb; v_errors_after jsonb;
  v_settlements_before jsonb; v_settlements_after jsonb; v_dashboard_before jsonb; v_dashboard_after jsonb;
  v_counts_before jsonb; v_counts_after jsonb; v_result jsonb; v_count integer; v_snapshot internal_proesc.financial_snapshots;
BEGIN
  SELECT r.* INTO STRICT v_source FROM internal_proesc.sync_runs r
    WHERE r.status='SUCCEEDED' AND r.finished_at<now()-interval '24 hours'
      AND (SELECT count(*) FROM internal_proesc.sync_run_item_history i WHERE i.run_id=r.id
        AND i.result='UNCHANGED' AND internal_proesc.packed_item_eligible(ROW(i.*)::internal_proesc.sync_run_items))>=4
    ORDER BY r.started_at,r.id LIMIT 1;
  SELECT min(started_at)-interval '1 second' INTO v_from FROM internal_proesc.sync_runs;
  INSERT INTO internal_proesc.sync_runs SELECT r.* FROM jsonb_populate_record(NULL::internal_proesc.sync_runs,
    to_jsonb(v_source)||jsonb_build_object('id',v_fixture,'started_at',v_from,'status','PARTIAL',
      'consulted',v_source.consulted-2,'unchanged',v_source.unchanged-2,'failed',v_source.failed+1)) r;
  INSERT INTO internal_proesc.sync_run_items SELECT r.* FROM internal_proesc.sync_run_item_history i
    CROSS JOIN LATERAL jsonb_populate_record(NULL::internal_proesc.sync_run_items,
      to_jsonb(i)||jsonb_build_object('run_id',v_fixture)) r WHERE i.run_id=v_source.id;
  SELECT link_id INTO STRICT v_error_link FROM internal_proesc.sync_run_items i WHERE run_id=v_fixture
    AND i.result='UNCHANGED' AND internal_proesc.packed_item_eligible(i) ORDER BY position LIMIT 1;
  SELECT link_id,original_snapshot_id INTO STRICT v_deferred_link,v_original FROM internal_proesc.sync_run_items i
    WHERE run_id=v_fixture AND link_id<>v_error_link AND i.result='UNCHANGED'
      AND internal_proesc.packed_item_eligible(i) ORDER BY position LIMIT 1;
  UPDATE internal_proesc.sync_run_items SET result='FAILED',snapshot_id=NULL,original_snapshot_id=NULL,
    error_code=internal_proesc.sync_safe_error_code('HTTP_TIMEOUT') WHERE run_id=v_fixture AND link_id=v_error_link;
  UPDATE internal_proesc.sync_run_items SET original_snapshot_id=NULL WHERE run_id=v_fixture AND link_id=v_deferred_link;
  SELECT link_id INTO STRICT v_missing_link FROM internal_proesc.sync_run_items i
    WHERE run_id=v_fixture AND i.result='UNCHANGED' AND internal_proesc.packed_item_eligible(i) ORDER BY position LIMIT 1;
  UPDATE internal_proesc.sync_run_items SET result='NOT_RECORDED',snapshot_id=NULL,original_snapshot_id=NULL,
    recorded_at=NULL,error_code=NULL WHERE run_id=v_fixture AND link_id=v_missing_link;
  SELECT original_snapshot_id INTO STRICT v_lookup FROM internal_proesc.sync_run_items i
    WHERE run_id=v_fixture AND i.result='UNCHANGED' AND internal_proesc.packed_item_eligible(i) ORDER BY position LIMIT 1;
  SELECT polo_id INTO STRICT v_polo FROM internal_proesc.sync_run_items WHERE run_id=v_fixture AND link_id=v_error_link;
  SELECT u.auth_user_id INTO STRICT v_actor_auth FROM internal_proesc.connection c
    JOIN public.usuarios_sistema u ON u.id=c.updated_by WHERE c.id;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor_auth)::text,true);
  v_from:=v_from-interval '1 second'; v_to:=v_source.finished_at+interval '1 minute';
  SELECT md5(string_agg(md5(to_jsonb(c)::text),'' ORDER BY id)) INTO v_finance_before FROM public.contas_receber c;
  SELECT md5(string_agg(to_jsonb(i)::text,'' ORDER BY position,link_id)),count(*) INTO v_before,v_count
    FROM internal_proesc.sync_run_item_history i WHERE run_id=v_fixture;
  v_feed_before:=public.get_proesc_reconciliation_feed_page('runs',NULL,v_fixture,v_from,v_to,1,100);
  v_scoped_before:=public.get_proesc_reconciliation_feed_page('runs',v_polo,v_fixture,v_from,v_to,1,100);
  v_observations_before:=public.get_proesc_reconciliation_feed_page('observations',NULL,v_fixture,v_from,v_to,1,100);
  v_errors_before:=public.get_proesc_reconciliation_feed_page('errors',NULL,v_fixture,v_from,v_to,1,100);
  v_settlements_before:=public.get_proesc_reconciliation_feed_page('settlements',NULL,v_fixture,v_from,v_to,1,100);
  v_dashboard_before:=public.get_proesc_reconciliation_dashboard(NULL,v_from,v_to)->'totals';
  SELECT to_jsonb(c) INTO v_counts_before FROM internal_proesc.run_item_counts(v_fixture,ARRAY[v_polo]) c;

  v_result:=internal_proesc.compact_sync_items(1);
  IF v_result->>'packedRuns'<>'1' OR v_result->>'historyVerified'<>'true'
    OR NOT EXISTS(SELECT 1 FROM internal_proesc.packed_run_items WHERE run_id=v_fixture) THEN
    RAISE EXCEPTION 'Run de ensaio não consolidado.';
  END IF;
  SELECT md5(string_agg(to_jsonb(i)::text,'' ORDER BY position,link_id)) INTO v_after
    FROM internal_proesc.sync_run_item_history i WHERE run_id=v_fixture;
  IF v_before IS DISTINCT FROM v_after OR (SELECT count(*) FROM internal_proesc.sync_run_item_history WHERE run_id=v_fixture)<>v_count THEN
    RAISE EXCEPTION 'Conteúdo integral ou contagem dos itens alterados.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.sync_run_items WHERE run_id=v_fixture AND link_id=v_deferred_link)
    OR EXISTS(SELECT 1 FROM internal_proesc.sync_run_items WHERE run_id=v_fixture AND link_id=v_error_link)
    OR EXISTS(SELECT 1 FROM internal_proesc.sync_run_items WHERE run_id=v_fixture AND link_id=v_missing_link)
    OR NOT EXISTS(SELECT 1 FROM internal_proesc.sync_run_item_history WHERE run_id=v_fixture AND link_id=v_missing_link
      AND result='NOT_RECORDED' AND recorded_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM internal_proesc.sync_run_item_errors WHERE run_id=v_fixture AND link_id=v_error_link AND error_code IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM internal_proesc.runs_for_observation(v_lookup) WHERE run_id=v_fixture) THEN
    RAISE EXCEPTION 'Elegibilidade, erros ou busca por observação divergentes.';
  END IF;
  v_feed_after:=public.get_proesc_reconciliation_feed_page('runs',NULL,v_fixture,v_from,v_to,1,100);
  v_scoped_after:=public.get_proesc_reconciliation_feed_page('runs',v_polo,v_fixture,v_from,v_to,1,100);
  v_observations_after:=public.get_proesc_reconciliation_feed_page('observations',NULL,v_fixture,v_from,v_to,1,100);
  v_errors_after:=public.get_proesc_reconciliation_feed_page('errors',NULL,v_fixture,v_from,v_to,1,100);
  v_settlements_after:=public.get_proesc_reconciliation_feed_page('settlements',NULL,v_fixture,v_from,v_to,1,100);
  v_dashboard_after:=public.get_proesc_reconciliation_dashboard(NULL,v_from,v_to)->'totals';
  SELECT to_jsonb(c) INTO v_counts_after FROM internal_proesc.run_item_counts(v_fixture,ARRAY[v_polo]) c;
  IF v_feed_before IS DISTINCT FROM v_feed_after OR v_scoped_before IS DISTINCT FROM v_scoped_after
    OR v_observations_before IS DISTINCT FROM v_observations_after OR v_errors_before IS DISTINCT FROM v_errors_after
    OR v_settlements_before IS DISTINCT FROM v_settlements_after OR v_dashboard_before IS DISTINCT FROM v_dashboard_after
    OR v_counts_before IS DISTINCT FROM v_counts_after THEN
    RAISE EXCEPTION 'Monitor, polo, observação, erro ou conciliação alterado.';
  END IF;

  -- Later eligibility appends to the same run without replacing earlier archived entries.
  UPDATE internal_proesc.sync_run_items SET original_snapshot_id=v_original WHERE run_id=v_fixture AND link_id=v_deferred_link;
  SELECT md5(string_agg(to_jsonb(i)::text,'' ORDER BY position,link_id)) INTO v_before
    FROM internal_proesc.sync_run_item_history i WHERE run_id=v_fixture;
  PERFORM internal_proesc.compact_sync_items(1);
  SELECT md5(string_agg(to_jsonb(i)::text,'' ORDER BY position,link_id)) INTO v_after
    FROM internal_proesc.sync_run_item_history i WHERE run_id=v_fixture;
  IF v_before IS DISTINCT FROM v_after OR EXISTS(SELECT 1 FROM internal_proesc.sync_run_items WHERE run_id=v_fixture AND link_id=v_deferred_link)
    OR NOT EXISTS(SELECT 1 FROM internal_proesc.runs_for_observation(v_original) WHERE run_id=v_fixture) THEN
    RAISE EXCEPTION 'Append parcial alterou histórico ou duplicou item.';
  END IF;
  IF EXISTS(SELECT 1 FROM internal_proesc.packed_run_items a
    CROSS JOIN LATERAL jsonb_populate_recordset(NULL::internal_proesc.sync_run_items,a.records) i
    WHERE a.run_id=v_fixture AND i.snapshot_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM internal_proesc.packed_item_snapshot_refs r WHERE r.snapshot_id=i.snapshot_id)) THEN
    RAISE EXCEPTION 'Keeper arquivado sem referência física protegida.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='internal_proesc.packed_item_snapshot_refs'::regclass
    AND confrelid='internal_proesc.financial_snapshots'::regclass AND contype='f' AND confdeltype='a') THEN
    RAISE EXCEPTION 'Proteção FK de keeper ausente.';
  END IF;
  SELECT s.* INTO STRICT v_snapshot FROM internal_proesc.financial_observation_history s WHERE id=v_lookup;
  PERFORM internal_proesc.rehydrate_financial_snapshot(v_snapshot);
  IF NOT EXISTS(SELECT 1 FROM internal_proesc.runs_for_observation(v_lookup) WHERE run_id=v_fixture)
    OR EXISTS(SELECT 1 FROM internal_proesc.sync_run_item_history i WHERE i.run_id=v_fixture AND i.snapshot_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots s WHERE s.id=i.snapshot_id)) THEN
    RAISE EXCEPTION 'Reidratação de observação perdeu run ou keeper.';
  END IF;
  SELECT md5(string_agg(md5(to_jsonb(c)::text),'' ORDER BY id)) INTO v_finance_after FROM public.contas_receber c;
  IF v_finance_before IS DISTINCT FROM v_finance_after THEN RAISE EXCEPTION 'Financeiro alterado.'; END IF;
  IF has_table_privilege('authenticated','internal_proesc.packed_run_items','SELECT')
    OR has_function_privilege('authenticated','internal_proesc.compact_sync_items(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Telemetria privada exposta.';
  END IF;
END;
$test$;
ROLLBACK;
