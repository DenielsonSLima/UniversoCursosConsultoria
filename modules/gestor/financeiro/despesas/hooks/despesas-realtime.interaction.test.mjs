import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const repo = fileURLToPath(new URL('../../../../../', import.meta.url));
class TestMessageChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => queueMicrotask(() => this.port1.onmessage?.({})) };
  }
}

test('despesas recuperam eventos perdidos ao reconectar somente no polo ativo', async () => {
  const { JSDOM } = require(process.env.FINANCIAL_PAYMENT_JSDOM_PATH
    ? resolve(process.env.FINANCIAL_PAYMENT_JSDOM_PATH) : 'jsdom');
  const temporary = await mkdtemp(join(tmpdir(), 'expense-realtime-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://universo.test' });
  const globals = { window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
    MessageChannel: TestMessageChannel, IS_REACT_ACT_ENVIRONMENT: true, __expenseRealtimeClient: undefined };
  const originals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const listeners = [];
  let subscribed, removed = false, root, client, act;
  const channel = {
    on(event, filter, callback) { listeners.push({ event, filter, callback }); return this; },
    subscribe(callback) { subscribed = callback; return this; },
  };
  globalThis.__expenseRealtimeClient = { channel: () => channel, removeChannel: () => { removed = true; } };
  try {
    const output = join(temporary, 'realtime.cjs');
    await build({ stdin: { contents: `
      export { default as React, act } from 'react';
      export { createRoot } from 'react-dom/client';
      export { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
      export { useDespesasRealtime } from './modules/gestor/financeiro/despesas/hooks/useDespesasRealtime';
      export { despesasQueryKeys } from './modules/gestor/financeiro/despesas/despesas.queryKeys';
    `, resolveDir: repo, loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs',
    logLevel: 'silent', plugins: [{ name: 'realtime-client', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export const supabase = globalThis.__expenseRealtimeClient;', loader: 'js',
      }));
    } }] });
    const module = require(output);
    const { React, createRoot, QueryClient, QueryClientProvider, useQuery, useDespesasRealtime, despesasQueryKeys } = module;
    act = module.act;
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
    const filters = poloId => ({ tipo: 'DESPESA_VARIAVEL', poloId, statusScope: 'mes_atual',
      situacao: 'todas', ordem: 'vencimento_asc' });
    const key = poloId => [...despesasQueryKeys.lancamentosList(filters(poloId)), 'workspace', 'nenhum'];
    for (const polo of ['polo-1', 'polo-2']) {
      client.setQueryData(key(polo), { label: 'antes' });
      client.setQueryData(despesasQueryKeys.summaryList(filters(polo)), { totalValue: 100 });
      client.setQueryData(despesasQueryKeys.groupSummaryList(filters(polo)), []);
    }
    let value = 'primeira assinatura', fetches = 0;
    function Probe() {
      useDespesasRealtime('polo-1');
      const result = useQuery({ queryKey: key('polo-1'), queryFn: async () => {
        fetches++; return { label: value };
      } });
      return React.createElement('p', null, result.data.label);
    }
    const tick = ms => new Promise(done => setTimeout(done, ms));
    const settle = async ms => { await act(async () => { await tick(ms); }); await act(async () => { await tick(10); }); };
    root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Probe))); });
    assert.equal(fetches, 0, 'cache está fresco antes da confirmação da assinatura');
    assert.equal(typeof subscribed, 'function');
    assert.deepEqual(listeners.map(item => item.filter.filter), ['polo_id=eq.polo-1', 'polo_id=eq.polo-1']);

    await act(async () => { subscribed('SUBSCRIBED'); });
    await settle(300);
    assert.equal(fetches, 1);
    assert.match(document.body.textContent, /primeira assinatura/);
    value = 'alterada enquanto estava offline';
    await act(async () => { subscribed('CHANNEL_ERROR'); });
    await settle(300);
    assert.equal(fetches, 1);
    await act(async () => { subscribed('SUBSCRIBED'); });
    await settle(300);
    assert.equal(fetches, 2, 'reconexão recupera dados mesmo sem evento de alteração recebido');
    assert.match(document.body.textContent, /alterada enquanto estava offline/);
    assert.equal(client.getQueryState(despesasQueryKeys.summaryList(filters('polo-1'))).isInvalidated, true);
    assert.equal(client.getQueryState(despesasQueryKeys.groupSummaryList(filters('polo-1'))).isInvalidated, true);
    for (const other of [key('polo-2'), despesasQueryKeys.summaryList(filters('polo-2')),
      despesasQueryKeys.groupSummaryList(filters('polo-2'))]) {
      assert.equal(client.getQueryState(other).isInvalidated, false, 'outro polo mantém seu cache');
    }
    await act(async () => { listeners[1].callback({}); listeners[0].callback({}); });
    await settle(300);
    assert.equal(fetches, 3, 'eventos físicos/econômicos no mesmo intervalo são agrupados');
    await act(async () => { subscribed('SUBSCRIBED'); root.unmount(); });
    root = null;
    await act(async () => { subscribed('SUBSCRIBED'); });
    await settle(300);
    assert.equal(removed, true);
    assert.equal(client.getQueryState(key('polo-1')).isInvalidated, false, 'limpeza cancela timer e ignora callback tardio');
  } finally {
    if (root) await act(async () => root.unmount());
    client?.clear(); dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});
