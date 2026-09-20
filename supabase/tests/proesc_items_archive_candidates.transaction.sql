BEGIN;
SET LOCAL statement_timeout='15s';
DO $test$
DECLARE v_plan jsonb; v_nodes jsonb; v_definition text;
BEGIN
  SELECT pg_get_indexdef('internal_proesc.proesc_items_pack_candidates_idx'::regclass) INTO v_definition;
  IF strpos(v_definition,'run_id')=0 OR strpos(v_definition,'original_snapshot_id')=0
    OR strpos(v_definition,'now()')>0 THEN RAISE EXCEPTION 'Índice candidato contém condição temporal ou incompleta.'; END IF;
  EXECUTE $query$EXPLAIN (FORMAT JSON)
    SELECT i.run_id FROM internal_proesc.sync_run_items i
    WHERE (i.result='UNCHANGED' AND i.error_code IS NULL AND i.original_snapshot_id IS NOT NULL)
      OR (i.result IN ('NOT_RECORDED','FAILED') AND i.snapshot_id IS NULL AND i.original_snapshot_id IS NULL)
  $query$ INTO v_plan;
  WITH RECURSIVE nodes(node) AS (
    SELECT v_plan->0->'Plan'
    UNION ALL SELECT p FROM nodes n CROSS JOIN LATERAL jsonb_array_elements(coalesce(n.node->'Plans','[]'::jsonb)) p
  ) SELECT jsonb_agg(node->>'Index Name') FILTER(WHERE node ? 'Index Name') INTO v_nodes FROM nodes;
  IF NOT coalesce(v_nodes ? 'proesc_items_pack_candidates_idx',false) THEN
    RAISE EXCEPTION 'Plano não utiliza o índice parcial de candidatos.';
  END IF;
END;
$test$;
ROLLBACK;
