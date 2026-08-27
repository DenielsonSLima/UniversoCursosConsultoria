import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../migrations/20260826213300_enrich_banese_reconciliation_attempt_identity.sql', import.meta.url),
  'utf8',
);

test('painel Banese mantém histórico e acrescenta identidade operacional atual', () => {
  assert.match(migration, /create or replace function public\.get_banese_reconciliation_dashboard\(\)/i);
  assert.match(migration, /source\.result/);
  assert.match(migration, /source\.remote_status/);
  assert.match(migration, /partner\.nome as partner_name/);
  assert.match(migration, /gateway_boleto_nosso_numero as nosso_numero/);
  assert.match(migration, /receivable\.status as current_receivable_status/);
  assert.match(migration, /receivable\.gateway_status as current_gateway_status/);
  assert.doesNotMatch(migration, /update\s+public\.banese_reconciliation_attempts/i);
});

test('Baixas e Erros têm janelas próprias e Baixas é deduplicada por recebível', () => {
  assert.match(migration, /'lastSettlements'/);
  assert.match(migration, /'settlement:' \|\| receivable\.id::text/);
  assert.match(migration, /gateway_settlement_source = 'API'/);
  assert.match(migration, /'lastErrorAttempts'/);
  assert.match(migration, /source\.result in \('ERROR', 'THROTTLED'\)/);
});

test('payload do histórico não expõe dados bancários ou pessoais excessivos', () => {
  assert.doesNotMatch(migration, /partner\.(cpf|cnpj|email|telefone)/i);
  assert.doesNotMatch(migration, /gateway_boleto_(linha_digitavel|codigo_barras|pix_payload)/i);
  assert.doesNotMatch(migration, /provider_(request|response)|raw_(request|response)/i);
});

test('RPC Banese permanece restrita e corrige o search_path do definer', () => {
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /auth\.uid\(\) is null/i);
  assert.match(migration, /public\.is_gestor_global\(\)/i);
  assert.match(migration, /public\.gestor_has_module\('configuracoes'\)/i);
  assert.match(migration, /public\.gestor_has_module\('financeiro'\)/i);
  assert.match(migration, /public\.gestor_has_financeiro_tab\('receber'\)/i);
  assert.match(migration, /case when v_can_receivable_details then partner\.nome end/);
  assert.doesNotMatch(migration, /receivable\.cliente_id as partner_id/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function[\s\S]*to authenticated, service_role/i);
});
