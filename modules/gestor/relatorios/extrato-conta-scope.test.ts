import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveExtratoPoloId, extratoScopeLabel } from './extrato-conta-scope.ts';
import { relatoriosKeys } from './relatorios.query-keys.ts';
test('global can explicitly consolidate only the selected account statement', () => {
  assert.equal(resolveExtratoPoloId('EXTRATO_CONTA', true, true, 'polo-a'), null);
  assert.equal(resolveExtratoPoloId('EXTRATO_CONTA', true, false, 'polo-a'), 'polo-a');
});
test('local permission or other report cannot widen scope', () => {
  assert.equal(resolveExtratoPoloId('EXTRATO_CONTA', false, true, 'polo-a'), 'polo-a');
  for (const tipo of ['SAIDAS','ENTRADAS','RECEITAS','DESPESAS']) assert.equal(resolveExtratoPoloId(tipo, true, true, 'polo-a'), 'polo-a');
});
test('account and scope remain distinct in cache', () => {
  const key = (poloId: string | null, contaBancariaId = 'account-a') => relatoriosKeys.financeiro.report({ tipo: 'EXTRATO_CONTA', poloId, contaBancariaId });
  assert.notDeepEqual(key(null), key('polo-a'));
  assert.notDeepEqual(key(null), key(null, 'account-b'));
  assert.match(extratoScopeLabel(null), /todos os polos/);
});
test('production SQL guard preserves server-side global authorization', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/20260812010242_create_separated_financial_reports.sql', import.meta.url), 'utf8');
  assert.match(sql, /p_polo_id IS NULL\s+AND public.is_gestor_global\(\)\s+AND public.gestor_has_module\('relatorios'\)/);
  assert.match(sql, /recebimento.conta_bancaria_id = p_conta_bancaria_id/);
});
test('preview/export show polo and snapshots reset on scope/account changes', () => {
  const component = readFileSync(new URL('./components/RelatorioMovimentacaoFinanceira.tsx', import.meta.url), 'utf8');
  assert.match(component, /poloId: effectivePoloId/);
  assert.match(component, /setPdfData\(null\); setPdfError\(''\); }, \[filterKey\]/);
  assert.match(component, /filterKey !== latestFilterKey.current/);
  assert.equal((component.match(/Polo relacionado/g) || []).length, 2);
  assert.match(component, /polo=\{effectivePoloId \? polo : null\}/);
});

test('loading a new account/scope does not clear selected account', () => {
  const component = readFileSync(new URL('./components/RelatorioMovimentacaoFinanceira.tsx', import.meta.url), 'utf8');
  assert.match(component, /if \(!data \|\| reportQuery.isFetching \|\| !contaBancariaId/);
});

test('explicit consolidated PDF scope cannot fall back to session polo', () => {
  const preview = readFileSync(new URL('../financeiro/components/FinancialReportPreview.tsx', import.meta.url), 'utf8');
  assert.match(preview, /poloId === undefined \? currentSessionPoloId\(\) : poloId/);
  const component = readFileSync(new URL('./components/RelatorioMovimentacaoFinanceira.tsx', import.meta.url), 'utf8');
  assert.match(component, /poloId=\{effectivePoloId\}/);
});
