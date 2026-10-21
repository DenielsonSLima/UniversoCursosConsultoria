BEGIN;
SET LOCAL lock_timeout='2s';
-- Index construction has its own bounded budget; application reads stay at 8s.
SET LOCAL statement_timeout='30s';

-- The review page resolves one status per displayed snapshot/invoice pair.
-- The existing (link_id, observed_at) index cannot serve this lookup. Keep
-- every predicate and the full deterministic ordering of the RPC unchanged.
CREATE INDEX proesc_v2_invoice_snapshot_lookup_idx
  ON internal_proesc.v2_invoice_observations
    (snapshot_id,invoice_id,observed_at DESC,recorded_at DESC,id DESC)
  INCLUDE(source_status)
  WHERE snapshot_id IS NOT NULL;

COMMIT;
