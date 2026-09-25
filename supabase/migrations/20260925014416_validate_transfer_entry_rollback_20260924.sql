-- Audit marker for the MCP validation recorded under this version.
-- The original operation wrapped entry migrations and controlled fixtures in
-- BEGIN ... ROLLBACK. All assertions passed; no product schema or data persisted.
-- The provider nevertheless recorded a migration ledger entry after rollback.
-- Rebuilding an environment must not replay production-dependent test fixtures.
-- Sources: transfer_entry_plan.transaction.sql and external_transfer_entry.rollback.sql.
-- Receivables before/after: 6837; identity/status hash unchanged.
select 1;
