-- Execute separately, in autocommit. No BEGIN/COMMIT or multi-statement batch.
-- Match the latest completed FULL identity-evidence lookup exactly.
CREATE INDEX CONCURRENTLY proesc_v2_runs_full_complete_latest
  ON internal_proesc.v2_runs (finished_at DESC, id DESC)
  WHERE mode = 'FULL' AND status = 'COMPLETE';
