-- Ledger marker only: MCP recorded this dry-run although its transaction ended
-- with ROLLBACK. No schema, authorization, claim or financial row persisted.
-- Regression sources remain versioned in proesc_local_c2_issuance.rollback.sql
-- and imported_banese_c1_continuation.rollback.sql. No bank call was performed.
-- The real DDL is allow_external_proesc_c1_local_c2_issuance, applied separately.
select 1;
