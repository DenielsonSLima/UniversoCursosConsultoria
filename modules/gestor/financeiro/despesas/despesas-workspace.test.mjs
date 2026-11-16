import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const project = fileURLToPath(new URL('../../../../', import.meta.url));
class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => queueMicrotask(() => this.port1.onmessage?.({})) };
  }
}
const payload = (suffix = '') => ({
  items: [{ id: `expense${suffix}`, polo_id: 'polo-1', tipo: 'DESPESA_VARIAVEL',
    descricao: 'SERVIÇO SINTÉTICO', status: 'PENDENTE', data_vencimento: '2026-12-10',
    valor: '117.60', valor_base: '117.60', valor_estimado: true,
    valor_estimado_original: '117.60', valor_estimado_versao: 1,
    fornecedor_nome: 'Fornecedor', fornecedor_nome_fantasia: 'Nome comercial',
    created_at: '2026-11-16T12:00:00Z' }],
  summary: { total_value: '117.60', paid_value: '0.00', pending_value: '117.60',
    confirmed_pending_value: '0.00', vencidos_count: 0, estimated_value: '117.60', estimated_count: 1 },
  groups: [{ grupo_chave: 'cat-1', grupo_nome: 'SOFTWARE', categoria_id: 'cat-1',
    categoria_nome: 'SOFTWARE', total_value: '117.60', paid_value: '0.00', item_count: 1,
    estimated_value: '117.60', estimated_count: 1 }],
});

test('workspace preserva filtros canônicos e invalida lista/totais juntos', async t => {
  const { JSDOM } = require(process.env.FINANCIAL_PAYMENT_JSDOM_PATH
    ? resolve(process.env.FINANCIAL_PAYMENT_JSDOM_PATH) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'expense-workspace-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://universo.test' });
  const globals = { window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
    MessageChannel: TestMessageChannel, IS_REACT_ACT_ENVIRONMENT: true,
    __expenseWorkspaceClient: undefined };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let root, client, act;
  const calls = [];
  let response = { data: payload(), error: null };
  globalThis.__expenseWorkspaceClient = { rpc: async (name, params) => {
    calls.push({ name, params });
    assert.equal(name, 'get_despesas_workspace_secure', 'um bundle, sem RPCs legadas ou enriquecimentos separados');
    return response;
  } };
  try {
    const output = join(temporary, 'workspace.cjs');
    await build({ stdin: { contents: `
      export { default as React, act } from 'react';
      export { createRoot } from 'react-dom/client';
      export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      export { getDespesasWorkspace } from './modules/gestor/financeiro/despesas/despesas-workspace.service';
      export { useDespesasQueries } from './modules/gestor/financeiro/despesas/hooks/useDespesasQueries';
      export { despesasQueryKeys } from './modules/gestor/financeiro/despesas/despesas.queryKeys';
    `, resolveDir: project, loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs',
    logLevel: 'silent', plugins: [{ name: 'workspace-client', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'workspace' }));
      builder.onLoad({ filter: /.*/, namespace: 'workspace' }, () => ({
        contents: 'export const supabase = new Proxy({}, { get: (_, key) => globalThis.__expenseWorkspaceClient[key] });',
        loader: 'js',
      }));
    } }] });
    const module = require(output);
    act = module.act;
    const { getDespesasWorkspace, React, createRoot, QueryClient, QueryClientProvider,
      useDespesasQueries, despesasQueryKeys } = module;
    const filters = { tipo: 'DESPESA_VARIAVEL', poloId: 'polo-1', statusScope: 'mes_atual' };

    await t.test('serviço usa mês/situação/ordem independentes e recebe valores prontos', async () => {
      calls.length = 0;
      const bundle = await getDespesasWorkspace({ ...filters, situacao: 'vencidas', ordem: 'vencimento_desc',
        search: ' serasa ', categoriaId: 'cat-1', turmaId: 'turma-1',
        dataInicio: '2026-12-01', dataFim: '2026-12-31' }, 'categoria');
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].params, { p_tipo: 'DESPESA_VARIAVEL', p_polo_id: 'polo-1',
        p_categoria_id: 'cat-1', p_search: 'serasa', p_due_start: '2026-12-01', p_due_end: '2026-12-31',
        p_turma_id: 'turma-1', p_status_scope: 'mes_atual', p_situacao: 'vencidas',
        p_ordem: 'vencimento_desc', p_agrupamento: 'categoria' });
      assert.equal(bundle.summary.confirmedPendingValue, 0);
      assert.equal(bundle.summary.estimatedValue, 117.6);
      assert.equal(bundle.items[0].valorEstimado, true);
      assert.equal(bundle.items[0].valorEstimadoOriginal, 117.6);
      assert.equal(bundle.groups[0].estimatedValue, 117.6);
      const empty = payload(); empty.items = []; empty.groups = [];
      response = { data: empty, error: null };
      await getDespesasWorkspace(filters);
      assert.equal(calls[1].params.p_situacao, 'todas');
      assert.equal(calls[1].params.p_ordem, 'vencimento_asc');
      assert.equal(calls[1].params.p_agrupamento, 'nenhum');
    });

    await t.test('falha ou resumo incompleto não produz sucesso vazio nem fallback sem filtro', async () => {
      response = { data: null, error: { message: 'indisponível' } };
      await assert.rejects(getDespesasWorkspace(filters), error => error.message === 'indisponível');
      response = { data: { items: [], groups: [] }, error: null };
      await assert.rejects(getDespesasWorkspace(filters), /lista de despesas/);
      const invalid = payload(); delete invalid.summary.estimated_value;
      response = { data: invalid, error: null };
      await assert.rejects(getDespesasWorkspace(filters), /resumo de despesas/);
      await assert.rejects(getDespesasWorkspace({ ...filters, poloId: 'todos' }), /Selecione um polo/);
    });

    await t.test('React Query mantém um snapshot para as duas modalidades e reage à invalidação existente', async () => {
      calls.length = 0;
      response = { data: payload(), error: null };
      client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      root = createRoot(document.getElementById('root'));
      let latest;
      const Probe = ({ filters: selected, grouped = false }) => {
        latest = useDespesasQueries(selected, { groupSummary: grouped, groupBy: 'categoria' });
        return React.createElement('div', null, latest.lancamentosQuery.data?.[0]?.id || 'aguardando');
      };
      const pause = () => new Promise(done => setTimeout(done, 20));
      const render = async (selected, grouped) => {
        await act(async () => { root.render(React.createElement(QueryClientProvider, { client },
          React.createElement(Probe, { filters: selected, grouped }))); await pause(); });
        await act(pause);
      };
      await render(filters, false);
      assert.equal(calls.length, 1);
      assert.equal(latest.lancamentosQuery.data[0].id, 'expense');
      assert.equal(latest.summaryQuery.data.estimatedValue, 117.6);
      await render({ ...filters, tipo: 'DESPESA_FIXA', situacao: 'pagas', ordem: 'vencimento_desc' }, true);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].params.p_tipo, 'DESPESA_FIXA');
      assert.equal(calls[1].params.p_situacao, 'pagas');
      assert.equal(calls[1].params.p_agrupamento, 'categoria');
      response = { data: payload('-atualizada'), error: null };
      await act(async () => { await client.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot }); await pause(); });
      await act(pause);
      assert.equal(calls.length, 3);
      assert.equal(latest.lancamentosQuery.data[0].id, 'expense-atualizada');
      assert.equal(latest.summaryQuery.data.estimatedCount, 1);
      assert.equal(latest.groupSummaryQuery.data[0].itemCount, 1);
    });
  } finally {
    if (root) await act(async () => root.unmount());
    client?.clear(); dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});
