-- Audit marker for a successful MCP validation wrapped in BEGIN ... ROLLBACK.
-- Twelve product migrations and seven regression fixtures were exercised together.
-- No product schema/data persisted. The provider recorded this ledger entry only.
-- All 454 existing cycle states and all 6837 receivables remained unchanged.
-- Rebuilds must not replay production-dependent validation fixtures.
select 1;
