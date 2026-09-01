import assert from 'node:assert/strict';

const migration = await Deno.readTextFile(new URL(
  '../migrations/20260901120500_index_manual_technical_cycle_foreign_keys.sql',
  import.meta.url,
));

Deno.test('índices cobrem as chaves estrangeiras novas do ciclo manual', () => {
  assert.match(
    migration,
    /technical_manual_cycle_policies_created_by_idx[\s\S]*?technical_manual_cycle_policies\s*\(created_by\)/i,
  );
  assert.match(
    migration,
    /technical_manual_cycle_runs_created_by_idx[\s\S]*?technical_manual_cycle_runs\s*\(created_by\)/i,
  );
  assert.match(
    migration,
    /technical_manual_receivable_authorizations_run_idx[\s\S]*?technical_manual_receivable_issuance_authorizations\s*\(\s*matricula_id,\s*cycle_number\s*\)/i,
  );
  assert.match(
    migration,
    /technical_manual_receivable_authorizations_actor_idx[\s\S]*?technical_manual_receivable_issuance_authorizations\s*\(\s*authorized_by\s*\)/i,
  );
});

Deno.test('migration de índices não altera dados nem políticas financeiras', () => {
  assert.doesNotMatch(migration, /\b(insert|update|delete|truncate)\b/i);
  assert.doesNotMatch(migration, /create\s+(or\s+replace\s+)?function/i);
  assert.doesNotMatch(migration, /payment_gateway|gateway_creation_token|webhook/i);
});
