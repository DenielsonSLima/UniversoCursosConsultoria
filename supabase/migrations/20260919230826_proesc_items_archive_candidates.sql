-- Immutable necessary conditions only; age and evidence/FK checks remain in the compactor.
-- Avoid scanning protected or not-yet-consolidated rows when the backlog is exhausted.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
CREATE INDEX proesc_items_pack_candidates_idx ON internal_proesc.sync_run_items(run_id)
WHERE (result='UNCHANGED' AND error_code IS NULL AND original_snapshot_id IS NOT NULL)
  OR (result IN ('NOT_RECORDED','FAILED') AND snapshot_id IS NULL AND original_snapshot_id IS NULL);
