import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setImmediate, setTimeout } from 'node:timers/promises';
import test from 'node:test';
import React, { act } from 'react';
import { build } from 'esbuild';
import { makeCaixaReportFixture } from './report/caixa-report.fixture.ts';

const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { JSDOM } = require(process.env.CAIXA_UI_JSDOM_PATH || process.env.INSTITUTIONAL_SELECT_JSDOM_PATH || 'jsdom');
const POLO = '11111111-1111-4111-8111-111111111111';
const STATEMENT = 'get_caixa_prestacao_mensal_secure';
const POSITION = 'get_caixa_receivables_position_secure';
const COMPOSITION = 'get_caixa_composicao_mensal_v2_secure';
const INDEPENDENT = [
  'get_caixa_financiamento_resumo_secure', 'get_caixa_linha_corte_secure',
  'get_caixa_patrimonio_resumo_secure', 'get_caixa_posicao_liquida_resumo_secure',
  'get_caixa_posicao_total_resumo_secure', 'get_caixa_convenios_resumo_secure',
  'get_caixa_contas_pagar_resumo_secure',
];

const toRpcFields = (value) => {
  if (Array.isArray(value)) return value.map(toRpcFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), toRpcFields(item),
  ]));
};

function responseFixtures(competencia) {
  const report = makeCaixaReportFixture();
  const [year, month] = competencia.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const cut = competencia.slice(0, 7) + '-06';
  const common = { versao: 1, competencia, escopo_tipo: 'POLO', polo_id: POLO };
  const statement = toRpcFields(report.resumo);
  Object.assign(statement.meta, { competencia, periodo_inicio: competencia, periodo_fim_exclusivo: nextMonth,
    polo_id: POLO, escopo_tipo: 'POLO', escopo_rotulo: 'Polo sintético' });
  Object.assign(statement.compromissos.inadimplencia_mensal, {
    periodo_inicio: competencia, periodo_fim_exclusivo: nextMonth, data_corte: cut,
  });
  const money = { valor: '0.00', quantidade: 0 };
  const section = { disponivel: true, completo: true, motivo: null, observacao: null, dados: {
    total: '0.00', quantidade: 0, base: '0.00', juros: '0.00', multa: '0.00', acrescimo: '0.00', desconto: '0.00',
    diferenca_a_conferir: '0.00', quantidade_a_conferir: 0, quantidade_sem_detalhamento: 0, quantidade_com_diferenca: 0,
  } };
  const positionGroup = { openConfirmed: '0.00', overdue: '0.00', toDue: '0.00', count: 0, reviewCount: 0, reviewNominal: '0.00' };
  return {
    [STATEMENT]: statement,
    [POSITION]: { success: true, data: { poloId: POLO, competencia, dataCorte: cut,
      geradoEm: cut + 'T12:00:00Z', monthly: positionGroup, portfolio: positionGroup } },
    [COMPOSITION]: { ...common, versao: 2, periodo_inicio: competencia, periodo_fim_exclusivo: nextMonth,
      gerado_em: cut + 'T12:00:00Z', recebimentos: section, despesas: section },
    get_caixa_financiamento_resumo_secure: { ...toRpcFields(report.financiamento.dados), competencia },
    get_caixa_patrimonio_resumo_secure: { ...toRpcFields(report.patrimonio.dados), ...common },
    get_caixa_posicao_liquida_resumo_secure: { ...toRpcFields(report.posicaoLiquida.dados), ...common },
    get_caixa_posicao_total_resumo_secure: { ...common, data_corte: cut, disponivel: true,
      dados: toRpcFields(report.posicaoTotal.dados) },
    get_caixa_convenios_resumo_secure: { ...toRpcFields(report.convenios.dados), ...common,
      itens: [{ ...toRpcFields(report.convenios.dados.itens[0]), competencia }] },
    get_caixa_linha_corte_secure: { competencia, polo_id: POLO },
    get_caixa_contas_pagar_resumo_secure: { ...common, periodo_inicio: competencia, periodo_fim_exclusivo: nextMonth,
      data_corte: cut, criterio: 'POSICAO_REEXPRESSA_NO_CORTE', contas_competencia: money, pagas_competencia: money,
      a_vencer_competencia: money, em_atraso: { ...money, data_mais_antiga: null },
      agenda_financeira: { hoje: { ...money, data: cut }, proximos_sete_dias: { ...money,
        periodo_inicio: competencia.slice(0, 7) + '-07', periodo_fim_exclusivo: competencia.slice(0, 7) + '-14' },
      dias: Array.from({ length: 8 }, (_, index) => ({ ...money,
        data: competencia.slice(0, 7) + '-' + String(index + 6).padStart(2, '0') })) } },
  };
}

class TestMessageChannel {
  port1 = { onmessage: null };
  port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
}

test('Caixa real mostra a prestação sem esperar recebíveis e preserva dez leituras, fila e resumos independentes', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  const globals = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent',
    'MutationObserver', 'MessageChannel', 'navigator', 'fetch', 'IS_REACT_ACT_ENVIRONMENT', '__caixaTestSupabase'];
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globals.forEach(key => Object.defineProperty(globalThis, key, {
    configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === 'MessageChannel' ? TestMessageChannel : dom.window[key],
  }));
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  let externalFetches = 0;
  globalThis.fetch = async () => { externalFetches++; throw new Error('Rede não permitida neste teste.'); };
  const calls = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let root;
  const rpc = (name, args) => {
    let complete;
    let fail;
    const promise = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
    const call = { name, args, signal: null, complete };
    calls.push(call);
    return { abortSignal(signal) {
      call.signal = signal;
      signal.addEventListener('abort', () => fail(new globalThis.DOMException('Cancelado', 'AbortError')), { once: true });
      return this;
    }, then: promise.then.bind(promise) };
  };
  globalThis.__caixaTestSupabase = {
    rpc,
    from() { throw new Error('SELECT fora do cenário de polo local.'); },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel() { return Promise.resolve(); },
  };
  const waitForDom = async (condition, message) => {
    const deadline = Date.now() + 2000;
    while (!condition() && Date.now() < deadline) {
      await act(async () => { await setTimeout(0); });
    }
    assert.ok(condition(), message);
  };
  const finish = async (name, payloads) => {
    const call = calls.find(item => item.name === name);
    assert.ok(call, name);
    await act(async () => { call.complete({ data: payloads[name], error: null, status: 200 }); await setImmediate(); });
  };

  try {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL('./CaixaPage.tsx', import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
      external: ['react', 'react-dom', '@tanstack/react-query'], loader: { '.css': 'empty' },
      define: { 'import.meta.env': '{}' },
      plugins: [{ name: 'caixa-controlled-transport', setup(plugin) {
        plugin.onResolve({ filter: /lib\/supabase(?:\.ts)?$/ }, () => ({ path: 'supabase', namespace: 'offline' }));
        plugin.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: 'export const supabase=globalThis.__caixaTestSupabase;' }));
      } }],
    });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(QueryClientProvider, { client }, React.createElement(module.exports.default, {
        poloId: POLO, poloName: 'Polo sintético', isGlobal: false, isMatriz: false,
      })));
      await setImmediate();
    });

    assert.deepEqual(calls.map(item => item.name).sort(), [...INDEPENDENT, STATEMENT].sort());
    assert.equal(calls.some(item => item.name === POSITION), false, 'posição aguarda a vaga da prestação');
    assert.equal(calls.some(item => item.name === COMPOSITION), false);
    const competencia = calls.find(item => item.name === STATEMENT).args.p_competencia;
    const payloads = responseFixtures(competencia);
    for (const name of INDEPENDENT) await finish(name, payloads);
    assert.equal(dom.window.document.getElementById('caixa-flow-hero-title'), null);
    assert.equal(client.getQueryCache().getAll().filter(query => query.state.status === 'success').length, 7);

    await finish(STATEMENT, payloads);
    // TanStack notifies observers on its real timeout scheduler after the RPC resolves.
    await waitForDom(() => dom.window.document.getElementById('caixa-flow-hero-title'),
      'resumo útil aparece enquanto posição ainda não respondeu');
    assert.equal(client.getQueryData(['caixa', 'statement', POLO, competencia]).resumoCompetencia.resultado, 0.9,
      'resultado canônico preservado, sem recomposição no teste ou na tela');
    assert.ok(calls.find(item => item.name === POSITION));
    assert.equal(calls.some(item => item.name === COMPOSITION), false, 'fila continua serial');
    assert.equal(client.getQueryCache().getAll().find(query => query.queryKey.includes('position')).state.status, 'pending');

    await finish(POSITION, payloads);
    assert.ok(calls.find(item => item.name === COMPOSITION));
    await finish(COMPOSITION, payloads);
    assert.equal(calls.length, 10);
    assert.equal(new Set(calls.map(item => item.name)).size, 10);
    assert.equal(client.getQueryCache().getAll().filter(query => query.state.status === 'success').length, 10);
    assert.equal(externalFetches, 0);
    for (const call of calls) {
      assert.equal(call.args.p_polo_id, POLO);
      assert.equal(call.args.p_competencia, competencia);
      assert.ok(call.signal instanceof AbortSignal);
    }
    assert.equal(calls.find(item => item.name === STATEMENT).args.p_meses_historico, 3);
  } finally {
    if (root) await act(async () => { root.unmount(); await setImmediate(); });
    client.clear();
    dom.window.close();
    previous.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
