import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { selectBaneseAttemptFeed } from './banese-attempt-feed.ts';
import type { BanesePollingDashboard } from './consulta-api-banese.types.ts';

const [page, table, tabs, types] = await Promise.all([
  readFile(new URL('./ConsultaApiBaneseConfig.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./BaneseAttemptsTable.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./BaneseTabsNav.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./consulta-api-banese.types.ts', import.meta.url), 'utf8'),
]);

test('Baixas e Erros usam séries próprias do backend', () => {
  assert.match(page, /selectBaneseAttemptFeed/);
  assert.doesNotMatch(page, /\.filter\(.*current_receivable_status/);
  assert.doesNotMatch(page, /\.filter\(.*THROTTLED/);
  assert.match(types, /lastSettlements\?: BanesePollingAttempt\[\]/);
  assert.match(types, /lastErrorAttempts\?: BanesePollingAttempt\[\]/);
  assert.match(page, /canViewReceivableDetails=\{dashboard\.canViewReceivableDetails === true\}/);
  assert.doesNotMatch(page, /canViewReceivableDetails !== false/);
});

test('cada evento mostra aluno, Nosso Número e os dois estados sem duplicar linha semântica', () => {
  assert.match(table, /Aluno \/ boleto/);
  assert.match(table, /Nosso Número \{attempt\.nosso_numero/);
  assert.match(table, />Tentativa</);
  assert.match(table, />Título agora</);
  assert.doesNotMatch(table, /min-w-\[980px\]/);
  assert.match(table, /xl:hidden/);
  assert.match(table, /xl:block/);
  assert.match(table, /A tentativa falhou; o título está pago atualmente\./);
  assert.match(tabs, /aria-pressed=\{activeTab === tab\.id\}/);
});

test('contrato tipado recebe somente a identidade financeira necessária', () => {
  for (const field of [
    'partner_name',
    'nosso_numero',
    'installment_number',
    'current_receivable_status',
    'current_gateway_status',
    'paid_at',
    'amount_paid',
  ]) {
    assert.match(types, new RegExp(`\\b${field}\\?`));
  }
  assert.doesNotMatch(types, /cpf|email|telefone|linha_digitavel|codigo_barras/i);
});

test('seletor não reclassifica nem duplica tentativas antigas em Baixas', () => {
  const dashboard = {
    available: true,
    environment: 'production',
    lastAttempts: [
      { id: 1, receivable_id: 'titulo-1', result: 'PENDING', created_at: '2026-08-26T17:00:00Z' },
      { id: 2, receivable_id: 'titulo-1', result: 'PAID', created_at: '2026-08-26T17:01:00Z' },
    ],
    lastSettlements: [
      { id: 'settlement:titulo-1', receivable_id: 'titulo-1', result: 'PAID', created_at: '2026-08-26T17:01:00Z' },
    ],
    lastErrorAttempts: [
      { id: 3, receivable_id: 'titulo-2', result: 'ERROR', created_at: '2026-08-26T17:02:00Z' },
    ],
  } satisfies BanesePollingDashboard;

  assert.deepEqual(selectBaneseAttemptFeed(dashboard, 'queries').map((item) => item.id), [1, 2]);
  assert.deepEqual(selectBaneseAttemptFeed(dashboard, 'settlements').map((item) => item.id), ['settlement:titulo-1']);
  assert.deepEqual(selectBaneseAttemptFeed(dashboard, 'errors').map((item) => item.id), [3]);
});
