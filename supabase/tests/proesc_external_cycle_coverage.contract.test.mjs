import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../migrations/20260912180000_create_technical_external_cycle_coverage.sql');
const service = read('../migrations/20260912180010_import_proesc_contract_with_cycle_coverage.sql');

test('coverage is independent of local cycle runs and identifies Proesc explicitly', () => {
  assert.match(schema, /create table internal_academic\.technical_external_cycle_coverage/);
  assert.match(schema, /'origemEmissao', 'PROESC', 'abrangencia', 'CONTRATO_COMPLETO'/);
  assert.match(schema, /'emitidosBanese', 0, 'pendentesEmissao', 0, 'emRevisao', 0/);
  assert.doesNotMatch(schema + service, /insert into internal_academic\.technical_manual_cycle_runs/i);
});

test('bank protection remains centralized and import claims require transaction plus exact identity', () => {
  assert.match(schema, /is_technical_manual_cycle_protected[\s\S]*?coverage\.state = 'CONFIRMED'/);
  assert.match(schema, /coverage\.import_transaction_id = txid_current\(\)/);
  assert.match(schema, /evidence\.receivable_id = p_receivable\.id and evidence\.imported_now/);
  assert.match(schema, /to_jsonb\(p_receivable\) @> evidence\.expected_receivable/);
  assert.doesNotMatch(schema + service, /disable trigger|session_replication_role/i);
});

test('authorization precedes replay and the service shares the generation lock', () => {
  const authorization = service.indexOf("is distinct from 'service_role'");
  const replay = service.indexOf('where coverage.request_id = p_request_id');
  assert.ok(authorization >= 0 && replay > authorization);
  assert.match(service, /'technical-manual-cycle-enrollment:' \|\| p_matricula_id::text/);
  assert.match(service, /v_coverage\.created_by is distinct from p_actor_id/);
  assert.match(service, /v_coverage\.payload_hash is distinct from v_payload_hash/);
});

test('the import appends exactly five unpaid items and preserves existing rows', () => {
  assert.match(service, /jsonb_array_length\(p_items\) <> 25/);
  assert.match(service, /if v_count <> 20/);
  assert.match(service, /v_ordinal not between 20 and 24/);
  assert.match(service, /v_after_hashes is distinct from v_existing_hashes/);
  assert.match(service, /'PENDENTE', 0, null, 'PARCELA', v_ordinal/);
  assert.doesNotMatch(service, /update public\.(?:contas_receber|matriculas|turmas)\b/i);
  assert.doesNotMatch(service, /insert into public\.payment_gateway_transactions/i);
});

test('source identities have stable uniqueness and protected evidence cannot be silently deleted', () => {
  assert.match(schema, /unique \(source_unit_id, source_class_id, source_key\)/);
  assert.match(schema, /receivable_id uuid not null unique references public\.contas_receber\(id\)/);
  assert.match(schema, /unique \(matricula_id, cycle_number, source_ordinal\)/);
  assert.match(schema, /guard_external_cycle_evidence_identity/);
});
