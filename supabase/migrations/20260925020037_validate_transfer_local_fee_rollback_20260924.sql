-- Audit marker for successful MCP validation wrapped in BEGIN ... ROLLBACK.
-- Real admission, preparation, audited LOCAL settlement and transfer RPCs were
-- exercised with controlled fixtures: future cancellation/replay, stale movement,
-- preserved paid future fee, blocked future reversal and allowed same-day reversal.
-- No product schema/data persisted and no bank call was executed.
-- Provider recorded this ledger entry only; do not replay the runtime fixtures.
select 1;
