import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../migrations/20260829234500_requeue_banese_quarantine_after_normalized_recheck.sql',
    import.meta.url,
  ),
  'utf8',
);

test('normaliza somente zeros à esquerda e exige a evidência bancária completa', () => {
  assert.match(migration, /lpad\(\s*regexp_replace\(/is);
  assert.match(migration, /\^\[0-9\]\{1,9\}\$/);
  assert.match(migration, /bank_slip_digitable_line =\s*receivable\.gateway_boleto_linha_digitavel/is);
  assert.match(migration, /bank_slip_barcode =\s*receivable\.gateway_boleto_codigo_barras/is);
  assert.match(migration, /gateway_financial_terms is not null/i);
});

test('reabre exclusivamente os 19 de Radiologia e os 13 T42 comprovados', () => {
  assert.match(migration, /v_radiology_count <> 19 or v_t42_count <> 13/i);
  assert.match(migration, /v_released_count <> 32/i);
  assert.match(migration, /target\.state = 'EXHAUSTED'/i);
  assert.match(migration, /set state = 'READY'/i);
  assert.doesNotMatch(migration, /set status\s*=\s*'PAGO'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(?:contas_receber|payment_gateway_transactions)/i);
});
