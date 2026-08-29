import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../migrations/20260829194500_exclude_legacy_banese_imports_from_automatic_reconciliation.sql',
    import.meta.url,
  ),
  'utf8',
);

test('imports legados do Banese não entram na reserva automática', () => {
  assert.match(
    migration,
    /pg_get_functiondef\([\s\S]*?prepare_banese_reconciliation_batch_v3/i,
  );
  assert.match(
    migration,
    /payment_gateway_transactions AS gateway_transaction/i,
  );
  assert.match(
    migration,
    /gateway_transaction\.receivable_id = receivable\.id/i,
  );
  assert.match(
    migration,
    /gateway_transaction\.provider_code = 'banese_card'/i,
  );
  assert.match(
    migration,
    /gateway_transaction\.environment = v_environment/i,
  );
  assert.match(
    migration,
    /gateway_transaction\.payment_method = 'BOLETO'/i,
  );
  assert.match(
    migration,
    /raw_payload\s*->>\s*'importSource'[\s\S]*?BANESE_API_LEGACY_DISCOVERY/i,
  );
  assert.match(
    migration,
    /pg_catalog\.pg_advisory_xact_lock/i,
  );
  assert.match(migration, /FOR UPDATE OF locked_queue SKIP LOCKED/i);
});

test('a migração mantém a RPC privada e não altera títulos nem transações', () => {
  assert.match(
    migration,
    /alter function public\.prepare_banese_reconciliation_batch_v3\(\)\s+security invoker/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.prepare_banese_reconciliation_batch_v3\(\)[\s\S]*?to service_role/i,
  );
  assert.doesNotMatch(migration, /\b(?:update|delete|insert into)\s+public\.(?:contas_receber|banese_reconciliation_queue|payment_gateway_transactions)\b/i);
});
