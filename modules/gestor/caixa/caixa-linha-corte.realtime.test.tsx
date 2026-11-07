import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setImmediate } from 'node:timers';
import React, { act } from 'react';
import { QueryClient, QueryClientProvider, QueryObserver, type QueryKey } from '@tanstack/react-query';
import type { Root } from 'react-dom/client';
import { supabase } from '../../../lib/supabase';
import { useCaixaRealtime } from './useCaixaRealtime';
import { caixaQueryKeys } from './caixa.service';
import { caixaLinhaCorteQueryOptions } from './caixa-linha-corte.service';

const requireForTest = createRequire(resolve(process.cwd(), 'package.json'));
const { JSDOM } = requireForTest(process.env.CAIXA_JSDOM_PATH || process.env.INSTITUTIONAL_SELECT_JSDOM_PATH || 'jsdom');
const poloA = '00000000-0000-0000-0000-000000000001';
const poloB = '00000000-0000-0000-0000-000000000002';
const currentMonth = '2026-10-01';
const previousMonth = '2026-09-01';
const tick = () => new Promise<void>(done => setImmediate(done));
const serialize = (key: QueryKey) => JSON.stringify(key);
const lineKey = (polo: string, month = currentMonth) => caixaLinhaCorteQueryOptions(polo, month).queryKey;

class TestMessageChannel {
  port1 = { onmessage: null as null | ((event: { data: undefined }) => void) };
  port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
}

function Harness() {
  useCaixaRealtime();
  return null;
}

test('Realtime da linha de corte acompanha o escopo financeiro sem buscar consultas inativas', async context => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const globals = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'MessageChannel', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globals.forEach(key => Object.defineProperty(globalThis, key, {
    configurable: true, writable: true,
    value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : key === 'MessageChannel' ? TestMessageChannel : dom.window[key],
  }));
  const { createRoot } = await import('react-dom/client');
  let financeEvent: (payload: { new?: unknown }) => void = () => { throw new Error('Canal não montado'); };
  const rpc = context.mock.method(supabase, 'rpc', () => { throw new Error('RPC não permitida no teste'); });
  context.mock.method(supabase, 'channel', () => {
    const channel = {
      on(_event: string, filter: { table: string }, callback: typeof financeEvent) {
        if (filter.table === 'finance_realtime_events') financeEvent = callback;
        return this;
      },
      subscribe() { return this; },
    };
    return channel as ReturnType<typeof supabase.channel>;
  });
  const remove = context.mock.method(supabase, 'removeChannel', async () => 'ok' as const);
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let root: Root | undefined;
  let client: QueryClient | undefined;
  let stops: Array<() => void> = [];
  const calls = new Map<string, number>();

  const count = (key: QueryKey) => calls.get(serialize(key)) || 0;
  const invalid = (key: QueryKey) => client!.getQueryState(key)?.isInvalidated;
  const setup = async () => {
    if (root) await act(async () => root?.unmount());
    stops.forEach(stop => stop());
    client?.clear(); stops = []; calls.clear();
    dom.window.document.body.innerHTML = '<div id="root"></div>';
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    const seed = (key: QueryKey, active: boolean) => {
      client!.setQueryData(key, { version: 0 });
      if (!active) return;
      const observer = new QueryObserver(client!, {
        queryKey: key, staleTime: Infinity, gcTime: Infinity,
        queryFn: async () => {
          const version = count(key) + 1; calls.set(serialize(key), version);
          return { version };
        },
      });
      stops.push(observer.subscribe(() => undefined));
    };
    for (const polo of [poloA, poloB, 'todos']) {
      seed(lineKey(polo), true);
      seed(lineKey(polo, previousMonth), false);
      seed(caixaQueryKeys.statement(polo, currentMonth), true);
      seed(caixaQueryKeys.patrimonioResumo(polo, currentMonth), true);
    }
    seed(['other-module', 'unchanged'], true);
    root = createRoot(dom.window.document.getElementById('root')!);
    const currentClient = client;
    await act(async () => root?.render(<QueryClientProvider client={currentClient}><Harness /></QueryClientProvider>));
    assert.equal(calls.size, 0, 'o cache inicial válido não dispara fetch');
  };
  const flush = async (payload: { new?: unknown }) => {
    await act(async () => {
      financeEvent(payload);
      context.mock.timers.tick(500);
      await tick();
    });
  };

  try {
    await context.test('evento do polo atualiza polo e global, preservando outro polo e meses inativos', async () => {
      await setup();
      await flush({ new: { polo_id: poloA, source_table: 'contas_receber' } });
      assert.equal(count(lineKey(poloA)), 1, 'linha de corte do polo precisa refazer sua leitura');
      assert.equal(count(lineKey('todos')), 1, 'movimento do polo altera o consolidado');
      assert.equal(count(lineKey(poloB)), 0);
      assert.equal(invalid(lineKey(poloA, previousMonth)), true);
      assert.equal(invalid(lineKey('todos', previousMonth)), true);
      assert.equal(invalid(lineKey(poloB, previousMonth)), false);
      assert.equal(count(lineKey(poloA, previousMonth)), 0);
      assert.equal(count(caixaQueryKeys.statement(poloA, currentMonth)), 1);
      assert.equal(count(caixaQueryKeys.statement('todos', currentMonth)), 1);
      assert.equal(count(caixaQueryKeys.statement(poloB, currentMonth)), 0);
      assert.equal(count(['other-module', 'unchanged']), 0);
    });
    await context.test('evento com polo nulo refaz somente o consolidado', async () => {
      await setup(); await flush({ new: { polo_id: null, source_table: 'contas_pagar' } });
      assert.equal(count(lineKey('todos')), 1);
      assert.equal(count(lineKey(poloA)), 0); assert.equal(count(lineKey(poloB)), 0);
      assert.equal(invalid(lineKey('todos', previousMonth)), true);
      assert.equal(invalid(lineKey(poloA, previousMonth)), false);
    });
    await context.test('payload sem polo usa fallback amplo sem buscar meses inativos', async () => {
      await setup(); await flush({ new: { source_table: 'despesas_lancamentos' } });
      for (const polo of [poloA, poloB, 'todos']) {
        assert.equal(count(lineKey(polo)), 1);
        assert.equal(invalid(lineKey(polo, previousMonth)), true);
        assert.equal(count(lineKey(polo, previousMonth)), 0);
      }
      assert.equal(count(['other-module', 'unchanged']), 0);
    });
    await context.test('evento patrimonial mantém a invalidação anterior sem ampliar para linha de corte', async () => {
      await setup(); await flush({ new: { polo_id: poloA, source_table: 'patrimonios' } });
      assert.equal(count(caixaQueryKeys.patrimonioResumo(poloA, currentMonth)), 1);
      assert.equal(count(caixaQueryKeys.patrimonioResumo('todos', currentMonth)), 1);
      assert.equal(count(caixaQueryKeys.patrimonioResumo(poloB, currentMonth)), 0);
      for (const polo of [poloA, poloB, 'todos']) assert.equal(count(lineKey(polo)), 0);
    });
    await context.test('desmontagem marca o evento pendente sem refetch e limpa os dois canais', async () => {
      await setup(); const removedBefore = remove.mock.callCount();
      financeEvent({ new: { polo_id: poloA, source_table: 'contas_receber' } });
      await act(async () => root?.unmount()); root = undefined;
      assert.equal(invalid(lineKey(poloA)), true);
      assert.equal(invalid(lineKey('todos')), true);
      assert.equal(invalid(lineKey(poloB)), false);
      assert.equal(calls.size, 0, 'cleanup usa refetchType none mesmo com observers ativos');
      assert.equal(remove.mock.callCount(), removedBefore + 2);
      context.mock.timers.tick(500); await tick(); assert.equal(calls.size, 0);
    });
    assert.equal(rpc.mock.callCount(), 0, 'nenhuma RPC financeira foi invocada');
  } finally {
    if (root) await act(async () => root?.unmount());
    stops.forEach(stop => stop()); client?.clear(); context.mock.timers.reset();
    dom.window.close();
    previous.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
