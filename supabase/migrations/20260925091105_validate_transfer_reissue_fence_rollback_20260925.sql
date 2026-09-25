-- Audit marker: MCP recorded the successful rollback-only verification under
-- this remote version. The product definitions and pg_temp fixtures were
-- rolled back; this marker must not replay environment-dependent test data.
select 1;
