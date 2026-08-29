import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../migrations/20260829203000_restore_verified_banese_imports_to_reconciliation.sql',
    import.meta.url,
  ),
  'utf8',
);

test('importado Banese só volta à fila com prova local completa', () => {
  assert.match(
    migration,
    /gateway_submission_channel = 'API'/i,
  );
  assert.match(
    migration,
    /gateway_submission_status = 'API_REGISTERED'/i,
  );
  assert.match(migration, /gateway_financial_terms IS NOT NULL/i);
  assert.match(
    migration,
    /gateway_financial_terms_confirmed_at IS NOT NULL/i,
  );
  assert.match(migration, /gateway_transaction.remote_payment_id =/i);
  assert.match(migration, /gateway_transaction.bank_slip_our_number =/i);
  assert.match(migration, /gateway_transaction.bank_slip_digitable_line =/i);
  assert.match(migration, /gateway_transaction.bank_slip_barcode =/i);
});

test('a migração remove só a exclusão por origem e preserva reserva atômica', () => {
  assert.match(migration, /BANESE_API_LEGACY_DISCOVERY/i);
  assert.match(migration, /v_definition := replace/i);
  assert.match(migration, /pg_catalog.pg_advisory_xact_lock/i);
  assert.match(migration, /FOR UPDATE OF locked_queue SKIP LOCKED/i);
  assert.doesNotMatch(
    migration,
    /\b(?:update|delete|insert into)\s+public\.(?:contas_receber|banese_reconciliation_queue|payment_gateway_transactions)\b/i,
  );
});
