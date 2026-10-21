BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';

-- Caixa positions each receipt using the latest snapshot and both existing
-- tie-breakers. Match the complete ordering so LIMIT 1 can stop after one
-- snapshot, without sorting a timestamp group or reading the next group.
CREATE INDEX proesc_snapshots_latest_order_idx
  ON internal_proesc.financial_snapshots
    (link_id,observed_at DESC,recorded_at DESC,id DESC);

COMMIT;
