-- Compare three-valued SQL semantics on bounded real telemetry; never exports receipt data.
BEGIN;
SET LOCAL statement_timeout='15s';
DO $test$
DECLARE v_mismatches integer;
BEGIN
  WITH sample AS MATERIALIZED (
    SELECT i.* FROM internal_proesc.sync_run_items i TABLESAMPLE SYSTEM (0.3) LIMIT 1000
  )
  SELECT count(*) INTO v_mismatches FROM sample i
  WHERE internal_proesc.packed_item_eligible(i::internal_proesc.sync_run_items) IS DISTINCT FROM (
    i.polo_id IS NOT NULL AND i.class_id IS NOT NULL
    AND ((i.result='UNCHANGED' AND i.error_code IS NULL
      AND i.recorded_at<now()-interval '24 hours'
      AND i.original_snapshot_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM internal_proesc.compacted_snapshot_observations a
        JOIN internal_proesc.financial_snapshots s ON s.id=a.keeper_snapshot_id
        WHERE a.id=i.original_snapshot_id AND a.keeper_snapshot_id=i.snapshot_id AND s.link_id=i.link_id
      )) OR (i.result IN ('NOT_RECORDED','FAILED') AND i.snapshot_id IS NULL AND i.original_snapshot_id IS NULL
        AND (i.recorded_at IS NULL OR i.recorded_at<now()-interval '24 hours')))
  );
  IF v_mismatches<>0 THEN RAISE EXCEPTION 'Predicado inline alterou elegibilidade ou comportamento NULL.'; END IF;
END;
$test$;
ROLLBACK;
