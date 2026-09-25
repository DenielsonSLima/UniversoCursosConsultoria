-- Audit marker for MCP validation wrapped in BEGIN ... ROLLBACK.
-- The real internal cycle helpers/state wrappers were tested with pg_temp fixtures.
-- C1 without history, complete source C1 to target C2, partial/imported blocking,
-- ancestral visibility and terminal C2 were asserted without real bank identities.
-- No product schema/data persisted. Provider recorded this ledger entry only.
select 1;
