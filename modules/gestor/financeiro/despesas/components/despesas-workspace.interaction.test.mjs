import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createExpenseQaClient, expenseQaSharedQueries, EXPENSE_QA_POLO, EXPENSE_QA_REFERENCE } from './despesas-workspace.qa-fixtures.mjs';

const require = createRequire(import.meta.url);
const repo = fileURLToPath(new URL('../../../../../', import.meta.url));
class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
  }
}

test('abas reais: vencimento, situação, ordem e PDF usam o mesmo workspace sem agrupamento implícito', async t => {
  const { JSDOM } = require(process.env.FINANCIAL_PAYMENT_JSDOM_PATH
    ? resolve(process.env.FINANCIAL_PAYMENT_JSDOM_PATH) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'expense-workspace-ui-'));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://universo.test/', pretendToBeVisual: true });
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  const RealDate = globalThis.Date;
  class ReferenceDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [EXPENSE_QA_REFERENCE])); }
    static now() { return new RealDate(EXPENSE_QA_REFERENCE).getTime(); }
  }
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), MessageChannel: TestMessageChannel, Date: ReferenceDate,
    IS_REACT_ACT_ENVIRONMENT: true, __expenseQaClient: undefined, __expenseQaShared: expenseQaSharedQueries,
    __expenseQaReport: undefined };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  let root;
  let act;
  let client;
  try {
    const bundle = join(temporary, 'workspace.cjs');
    await build({ stdin: { contents: `
      export { default as React, act } from 'react';
      export { createRoot } from 'react-dom/client';
      export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      export { default as Fixed } from './modules/gestor/financeiro/despesas/fixas/DespesasFixasTab';
      export { default as Variable } from './modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab';
      export { financialReportValueToText } from './modules/gestor/financeiro/components/financial-report.vector-pdf';
    `, loader: 'ts', resolveDir: repo }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs',
    logLevel: 'silent', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{
      name: 'workspace-ui-fixtures', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'qa' }));
        builder.onLoad({ filter: /^client$/, namespace: 'qa' }, () => ({ loader: 'js', contents:
          'export const supabase = new Proxy({}, {get:(_,key)=>globalThis.__expenseQaClient[key]});' }));
        builder.onResolve({ filter: /useFinanceiroSharedQueries$/ }, () => ({ path: 'shared', namespace: 'qa' }));
        builder.onLoad({ filter: /^shared$/, namespace: 'qa' }, () => ({ loader: 'js', contents:
          'export const useFinanceiroSharedQueries = ()=>globalThis.__expenseQaShared;' }));
        builder.onResolve({ filter: /useDespesasReport$/ }, () => ({ path: 'report', namespace: 'qa' }));
        builder.onLoad({ filter: /^report$/, namespace: 'qa' }, () => ({ loader: 'js', contents: `
          import {useDespesasReport as actual} from ${JSON.stringify(`${repo}modules/gestor/financeiro/despesas/hooks/useDespesasReport.tsx?qa-native`)};
          export function useDespesasReport(params) {
            const result=actual(params); globalThis.__expenseQaReport={params,result}; return result;
          }` }));
        builder.onResolve({ filter: /\?qa-native$/ }, args => ({ path: args.path.replace(/\?qa-native$/, '') }));
      },
    }] });
    const components = require(bundle);
    const { React, createRoot, QueryClient, QueryClientProvider, Fixed, Variable, financialReportValueToText } = components;
    act = components.act;
    const tick = ms => new Promise(done => setTimeout(done, ms));
    const settle = async (ms = 0) => act(async () => { await tick(ms); await tick(0); });
    const mount = async Component => {
      globalThis.__expenseQaClient = createExpenseQaClient();
      globalThis.__expenseQaReport = undefined;
      client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false }, mutations: { retry: false } } });
      root = createRoot(document.getElementById('root'));
      try {
        await act(async () => { root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Component, { poloId: EXPENSE_QA_POLO }))); await tick(0); });
        await settle(20);
      } catch (error) { await close(); throw error; }
    };
    const close = async () => { if (root) await act(async () => root.unmount()); root = null; client?.clear(); };
    const rows = () => [...document.querySelectorAll('table[aria-label="Lançamentos de despesas"] tbody tr')];
    const names = () => rows().map(row => row.querySelector('td p')?.textContent);
    const suffixes = () => names().map(name => name.replace(/^(?:FIXA|VARIAVEL) /, ''));
    const picker = label => document.querySelector(`[role="combobox"][aria-label="${label}"]`);
    const click = async element => { assert.ok(element); await act(async () => { element.click(); await tick(0); }); await settle(20); };
    const choose = async (label, option) => {
      await click(picker(label));
      await click([...document.querySelectorAll('[role="option"]')].find(element => element.textContent.trim() === option));
    };
    const tab = label => [...document.querySelectorAll('[role="tab"]')].find(element => element.textContent.trim() === label);
    const summary = label => [...document.querySelectorAll('p')].find(element => element.textContent.trim() === label)?.parentElement?.textContent.replace(/\s/g, ' ');
    const lastParams = () => globalThis.__expenseQaClient.calls.at(-1).params;
    const report = () => globalThis.__expenseQaReport;
    const text = financialReportValueToText;

    for (const [type, Component, prefix] of [['DESPESA_FIXA', Fixed, 'FIXA'], ['DESPESA_VARIAVEL', Variable, 'VARIAVEL']]) {
      await t.test(`${type}: entrada mensal sem grupo e inversão da ordem recebida`, async () => {
        await mount(Component);
        try {
          assert.equal(picker('Agrupar despesas').value, 'Sem agrupamento');
          assert.equal(picker('Ordenar despesas por vencimento').value, 'Menor data primeiro');
          assert.equal(picker('Filtrar despesas por situação').value, 'Todas');
          assert.equal(tab('Mês atual').getAttribute('aria-selected'), 'true');
          assert.deepEqual(suffixes(), ['E - Estimada atrasada', 'F - Sem cobrança', 'A - Quitada antes do mês', 'C - Parcial vencida', 'G - Cota estimada', 'D - Aberta futura', 'J - Pesquisa comercial']);
          assert.ok(names().every(name => name.startsWith(prefix)));
          assert.equal(lastParams().p_tipo, type);
          assert.equal(lastParams().p_agrupamento, 'nenhum');
          assert.match(summary('Total previsto'), /1\.400,00/);
          assert.match(summary('A pagar confirmado'), /610,00/);
          assert.match(summary('Vencidos confirmados'), /1/);
          const noCharge = rows().find(row => row.textContent.includes('F - Sem cobrança'));
          assert.match(noCharge.querySelectorAll('td')[2].textContent, /0,00/);
          assert.match(noCharge.textContent, /Estimativa original: R\$\s*600,00/);
          assert.match(rows().find(row => row.textContent.includes('G - Cota estimada')).textContent, /Cota estimada original: R\$\s*90,00/);
          assert.doesNotMatch(document.body.textContent, /CONTA FÍSICA SINTÉTICA DA MATRIZ/);
          await choose('Ordenar despesas por vencimento', 'Maior data primeiro');
          assert.equal(lastParams().p_ordem, 'vencimento_desc');
          assert.deepEqual(suffixes(), ['J - Pesquisa comercial', 'D - Aberta futura', 'G - Cota estimada', 'C - Parcial vencida', 'A - Quitada antes do mês', 'F - Sem cobrança', 'E - Estimada atrasada']);
        } finally { await close(); }
      });

      await t.test(`${type}: Pagas e Vencidas respeitam vencimento e saldo, com atalhos históricos explícitos`, async () => {
        await mount(Component);
        try {
          await choose('Filtrar despesas por situação', 'Pagas');
          assert.deepEqual(suffixes(), ['A - Quitada antes do mês']);
          assert.match(summary('Total previsto'), /100,00/);
          assert.match(document.body.textContent, /29\/10\/2026/);
          await choose('Filtrar despesas por situação', 'Vencidas');
          assert.equal(lastParams().p_status_scope, 'mes_atual');
          assert.deepEqual(suffixes(), ['C - Parcial vencida']);
          assert.match(summary('A pagar'), /200,00/);
          await choose('Filtrar despesas por situação', 'Em aberto');
          assert.deepEqual(suffixes(), ['E - Estimada atrasada', 'C - Parcial vencida', 'G - Cota estimada', 'D - Aberta futura', 'J - Pesquisa comercial']);
          assert.match(document.body.textContent, /Fatura a confirmar/);
          await click(tab('Vencidos'));
          assert.equal(picker('Filtrar despesas por situação').disabled, true);
          assert.equal(picker('Filtrar despesas por situação').value, 'Vencidas');
          assert.deepEqual(suffixes(), ['I - Vencida anterior', 'C - Parcial vencida']);
          assert.match(document.body.textContent, /Todos os períodos/);
          await click(tab('Todos'));
          await choose('Filtrar despesas por situação', 'Pagas');
          assert.deepEqual(suffixes(), ['B - Venceu antes do mês', 'A - Quitada antes do mês']);
          assert.match(summary('Total previsto'), /300,00/);
        } finally { await close(); }
      });

      await t.test(`${type}: grupo explícito persiste, busca fantasia não diverge dos totais e Realtime refaz o bundle`, async () => {
        await mount(Component);
        try {
          await choose('Agrupar despesas', 'Por categoria');
          await click(tab('Em aberto'));
          assert.equal(picker('Agrupar despesas').value, 'Por categoria');
          assert.equal(picker('Filtrar despesas por situação').value, 'Em aberto');
          await click(tab('Mês atual'));
          assert.equal(picker('Agrupar despesas').value, 'Por categoria');
          await choose('Agrupar despesas', 'Sem agrupamento');
          const search = document.querySelector('input[placeholder="Buscar lançamentos..."]');
          await act(async () => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'Fantasia Única QA');
            search.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await tick(0);
          });
          await settle(20);
          assert.deepEqual(suffixes(), ['J - Pesquisa comercial']);
          assert.match(summary('Total previsto'), /10,00/);
          const before = globalThis.__expenseQaClient.calls.length;
          await act(async () => { globalThis.__expenseQaClient.emitChange(); await tick(350); });
          await settle(20);
          assert.ok(globalThis.__expenseQaClient.calls.length > before);
          assert.equal(lastParams().p_search, 'Fantasia Única QA');
          assert.equal(picker('Agrupar despesas').value, 'Sem agrupamento');
          assert.deepEqual(suffixes(), ['J - Pesquisa comercial']);
        } finally { await close(); }
      });

      await t.test(`${type}: modelo do PDF mantém dados, situação, período e ordem visível`, async () => {
        await mount(Component);
        try {
          await choose('Ordenar despesas por vencimento', 'Maior data primeiro');
          assert.deepEqual(report().result.rows.map(row => row.id), rows().map(row => {
            const title = row.querySelector('td p').textContent;
            return report().params.filtered.find(item => item.descricao === title).id;
          }));
          const filter = label => text(report().result.filters.find(item => item.label === label).value);
          assert.equal(filter('Situação'), 'Todas');
          assert.equal(filter('Vencimento'), 'Maior data primeiro');
          assert.match(filter('Período'), /Vencimentos de novembro de 2026/);
          const noCharge = report().result.rows.find(row => text(row.cells[1]).includes('F - Sem cobrança'));
          assert.match(text(noCharge.cells[4]), /0,00/);
          assert.match(text(noCharge.cells[1]), /Estimativa original: R\$\s*600,00/);
          assert.equal(text(noCharge.cells[6]), 'Sem cobrança neste mês');
          await choose('Filtrar despesas por situação', 'Vencidas');
          assert.equal(filter('Situação'), 'Vencidas');
          assert.equal(report().result.rows.length, 1);
          assert.match(text(report().result.rows[0].cells[1]), /C - Parcial vencida/);
          assert.ok(report().result.rows[0].cells.some(cell => /100,00/.test(text(cell))), 'o valor parcial pago não desaparece do relatório');
        } finally { await close(); }
      });
    }
  } finally {
    if (root && act) await act(async () => root.unmount());
    client?.clear(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});
