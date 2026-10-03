import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canOpenFinancialSection,
  financialSectionSearch,
  initialGestorFinancialModule,
  leaveFinancialSection,
  readFinancialSection,
} from './financeiro-sections.ts';

const pageSource = readFileSync(new URL('./FinanceiroPage.tsx', import.meta.url), 'utf8');
const tabsSource = readFileSync(new URL('./components/FinancialUnderlineTabs.tsx', import.meta.url), 'utf8');
const receivablesSource = readFileSync(new URL('./receber/ReceberTab.tsx', import.meta.url), 'utf8');

test('navegação coloca Renegociações após A Pagar e mantém Conciliação por último', () => {
  const ids = [...pageSource.matchAll(/id: '([^']+)' as const/g)].map((match) => match[1]);
  assert.deepEqual(ids, [
    'resumo', 'receber', 'despesas', 'renegociacoes', 'emprestimos',
    'convenios', 'transferencias', 'outros-debitos', 'outros-creditos', 'conciliacao-bancaria',
  ]);
  assert.match(pageSource, /<FinancialUnderlineTabs/);
  assert.match(pageSource, /mobileMode="scroll"/);
  assert.match(pageSource, /showHorizontalScrollbar/);
  assert.doesNotMatch(pageSource, /FinancialSectionSelector/);
  assert.match(pageSource, /role="tabpanel"/);
});

test('barra principal expõe rolagem visível sem alterar as subtabs e sem atalho duplicado', () => {
  assert.match(tabsSource, /showHorizontalScrollbar = false/);
  assert.match(tabsSource, /overflow-x-scroll/);
  assert.match(tabsSource, /\[scrollbar-width:thin\]/);
  assert.match(tabsSource, /\[&::-webkit-scrollbar\]:h-2/);
  assert.match(tabsSource, /\[&::-webkit-scrollbar-track\]:bg-slate-200/);
  assert.match(tabsSource, /\[scrollbar-width:none\]/);
  assert.doesNotMatch(pageSource, /onOpenRenegotiations/);
  assert.doesNotMatch(receivablesSource, /onOpenRenegotiations|Abrir renegociações/);
});

test('propostas herdam somente o acesso a receber e não outras abas', () => {
  assert.equal(canOpenFinancialSection('renegociacoes', ['receber']), true);
  assert.equal(canOpenFinancialSection('renegociacoes', ['resumo', 'despesas']), false);
  assert.equal(canOpenFinancialSection('renegociacoes', []), false);
  assert.equal(canOpenFinancialSection('despesas', ['receber']), false);
});

test('links financeiros preservam outros parâmetros e rejeitam seções desconhecidas', () => {
  assert.equal(readFinancialSection('?financeiroSecao=renegociacoes'), 'renegociacoes');
  assert.equal(readFinancialSection('?financeiroSecao=aprovar'), null);
  const search = financialSectionSearch('?context=1&financeiroSecao=receber', 'renegociacoes');
  assert.equal(new URLSearchParams(search).get('context'), '1');
  assert.equal(readFinancialSection(search), 'renegociacoes');
  assert.equal(financialSectionSearch(search, null), '?context=1');
  assert.equal(financialSectionSearch('?financeiroSecao=receber', null), '');
});

test('destino direto abre Financeiro e sair limpa somente o contexto financeiro', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const location = new URL('https://portal.example/gestor?context=1&financeiroSecao=renegociacoes#aluno');
  const state = { idx: 3 };
  const calls: { state: unknown; url: string }[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location,
      history: {
        state,
        replaceState: (nextState: unknown, _title: string, url: URL) => {
          calls.push({ state: nextState, url: url.toString() });
        },
      },
    },
  });
  try {
    assert.equal(initialGestorFinancialModule(), 'financeiro');
    assert.equal(leaveFinancialSection('financeiro'), 'financeiro');
    assert.equal(calls.length, 0);
    assert.equal(leaveFinancialSection('secretaria'), 'secretaria');
    assert.deepEqual(calls, [{ state, url: 'https://portal.example/gestor?context=1#aluno' }]);
    location.search = '?context=1&financeiroSecao=inexistente';
    assert.equal(initialGestorFinancialModule(), 'inicio');
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
