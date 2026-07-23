import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAccessFinanceiroTab,
  getEffectiveFinanceiroTabs,
  type GestorPermissions,
} from './access-control.ts';

const permissions = (overrides: Partial<GestorPermissions> = {}): GestorPermissions => ({
  modules: ['inicio', 'financeiro'],
  financeiroTabs: ['resumo', 'receber', 'conciliacao-bancaria'],
  allPolos: true,
  ...overrides,
});

test('usa financeiroTabs legado quando não existe escopo novo para o Financeiro', () => {
  const result = getEffectiveFinanceiroTabs(permissions());
  assert.deepEqual(result, ['resumo', 'receber', 'conciliacao-bancaria']);
  assert.equal(canAccessFinanceiroTab(permissions(), 'conciliacao-bancaria'), true);
});

test('respeita tabs.financeiro como escopo efetivo e não amplia com o campo legado', () => {
  const scoped = permissions({
    financeiroTabs: ['resumo'],
    tabs: { financeiro: ['resumo', 'receber'] },
  });
  assert.deepEqual(getEffectiveFinanceiroTabs(scoped), ['resumo', 'receber']);
  assert.equal(canAccessFinanceiroTab(scoped, 'conciliacao-bancaria'), false);
});

test('injeta conciliação por compatibilidade quando legado ainda usava receber', () => {
  const scopedCompat = permissions({
    financeiroTabs: ['resumo', 'receber', 'despesas'],
    tabs: { financeiro: ['resumo', 'receber', 'despesas'] },
  });
  assert.deepEqual(
    getEffectiveFinanceiroTabs(scopedCompat),
    ['resumo', 'receber', 'despesas', 'conciliacao-bancaria'],
  );
  assert.equal(canAccessFinanceiroTab(scopedCompat, 'conciliacao-bancaria'), true);
});

test('um escopo financeiro novo vazio permanece sem abas', () => {
  const denied = permissions({ financeiroTabs: [], tabs: { financeiro: [] } });
  assert.deepEqual(getEffectiveFinanceiroTabs(denied), []);
});

test('se não houver escopo financeiro no novo formato, usa tabs legado', () => {
  const fallback = permissions({
    tabs: { secretaria: ['dashboard'] },
  });
  assert.deepEqual(getEffectiveFinanceiroTabs(fallback), ['resumo', 'receber', 'conciliacao-bancaria']);
  assert.equal(canAccessFinanceiroTab(fallback, 'conciliacao-bancaria'), true);
});
