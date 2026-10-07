-- The net-discount guard looks up the latest observation by source identity,
-- not by run or local link. Include every result/status: a newer UNLINKED or
-- REVIEW observation must still invalidate older compatible evidence.
-- No INCLUDE(normalized): keep the index narrow and avoid duplicating JSON.
-- MUST run as a single top-level statement in autocommit; never wrap in BEGIN.
-- The production transport must support nontransactional migrations.
CREATE INDEX CONCURRENTLY proesc_v2_invoice_source_latest
  ON internal_proesc.v2_invoice_observations
  (unit_id, invoice_id, observed_at DESC, recorded_at DESC, id DESC);

-- Index-only change: financial rows, source evidence, RPC bodies, RLS and
-- grants are untouched. Existing same-name indexes intentionally fail closed;
-- inspect actual definitions, sizes and lock budget before production apply.
