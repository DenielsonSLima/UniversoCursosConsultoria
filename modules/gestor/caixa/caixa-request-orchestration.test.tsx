import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useGestorPoloTransition } from '../hooks/useGestorPoloTransition';
import {
  caixaDashboardQueryOptions, caixaFinanciamentoResumoQueryOptions,
  caixaPatrimonioResumoQueryOptions, caixaPosicaoLiquidaResumoQueryOptions,
  caixaPosicaoTotalResumoQueryOptions, mapCaixaPosicaoTotalResumo, caixaService,
} from './caixa.service';
import { caixaLinhaCorteQueryOptions } from './caixa-linha-corte.service';
import CaixaPage from './CaixaPage';
import { CaixaStatementSection } from './components/CaixaStatementSection';

const polo = (id: string) => ({
  id, nome: id, cnpj: null, cidade: null, estado: null, is_matriz: false, status: 'ativo',
});

const factories = [
  caixaDashboardQueryOptions, caixaFinanciamentoResumoQueryOptions,
  caixaPatrimonioResumoQueryOptions, caixaPosicaoLiquidaResumoQueryOptions,
  caixaPosicaoTotalResumoQueryOptions, caixaLinhaCorteQueryOptions,
];
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('cancelamento esperado das sete leituras mantém rejeição sem ruído e preserva erros reais', async t => {
  const logged = t.mock.method(console, 'error', () => undefined);
  const controller = new AbortController();
  const aborted = { message: 'AbortError: This operation was aborted', code: '', details: '',
    hint: 'Request was aborted (timeout or manual cancellation)' };
  let responseError = aborted;
  let seenSignal: AbortSignal | undefined;
  const request = {
    select() { return this; }, eq() { return this; }, order() { return this; },
    abortSignal(signal: AbortSignal) { seenSignal = signal; return this; },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data: null, error: responseError }).then(resolve);
    },
  };
  t.mock.method(supabase, 'rpc', () => request);
  t.mock.method(supabase, 'from', () => request);
  const reads = [
    (signal: AbortSignal) => caixaService.getPolos(signal),
    ...[caixaService.getMonthlyStatement, caixaService.getFinanciamentoResumo,
      caixaService.getCustosOperacionais, caixaService.getPatrimonioResumo,
      caixaService.getPosicaoLiquidaResumo, caixaService.getPosicaoTotalResumo]
      .map(read => (signal: AbortSignal) => read('polo-a', '2026-09-01', signal)),
  ];
  controller.abort();
  for (const read of reads) {
    await assert.rejects(read(controller.signal), error => error === aborted);
    assert.equal(seenSignal, controller.signal);
  }
  assert.equal(logged.mock.callCount(), 0, 'cancelamento solicitado não é falha operacional');

  for (const code of ['42501', '57014']) {
    responseError = { ...aborted, message: 'Falha real do banco', code, hint: '' };
    await assert.rejects(reads[1](controller.signal), error => error === responseError);
  }
  responseError = { ...aborted, message: 'TypeError: Failed to fetch', hint: '' };
  await assert.rejects(reads[1](controller.signal), error => error === responseError);
  responseError = aborted;
  await assert.rejects(reads[1](new AbortController().signal), error => error === aborted);
  assert.equal(logged.mock.callCount(), 4, 'falha real ou cancelamento sem sinal permanece visível');
});

const unavailable = (poloId: string, competencia: string) => ({
  versao: 1, competencia, data_corte: '2026-07-31', escopo_tipo: 'POLO',
  polo_id: poloId, disponivel: false, motivo: 'HISTORICO_INSUFICIENTE',
  observacao: 'Histórico insuficiente para o fechamento solicitado.',
});

test('seis resumos recebem o mês visível e AbortSignal, sem repetir timeout SQL', async t => {
  const calls: Array<{ name: string; args: Record<string, unknown>; signal?: AbortSignal }> = [];
  const timeout = { code: '57014', message: 'Statement timeout' };
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(supabase, 'rpc', (name: string, args: Record<string, unknown>) => {
    const call = { name, args, signal: undefined as AbortSignal | undefined };
    calls.push(call);
    return {
      abortSignal(signal: AbortSignal) { call.signal = signal; return this; },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: null, error: timeout }).then(resolve);
      },
    };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 0 } } });
  try {
    for (const options of factories.map(factory => factory('polo-b', '2026-07-01'))) {
      await assert.rejects(client.fetchQuery(options as ReturnType<typeof caixaDashboardQueryOptions>), timeout);
    }
    assert.equal(calls.length, 6);
    assert.equal(new Set(calls.map(call => call.name)).size, 6);
    for (const call of calls) {
      assert.equal(call.args.p_polo_id, 'polo-b');
      assert.equal(call.args.p_competencia, '2026-07-01');
      assert.ok(call.signal instanceof AbortSignal);
    }
    assert.equal(calls.find(call => call.name === 'get_caixa_prestacao_mensal_secure')?.args.p_meses_historico, 3);
  } finally { client.clear(); }
});

test('trocar escopo cancela a request anterior e uma resposta tardia não substitui o novo polo', async t => {
  const requests: Array<{
    args: Record<string, string>; signal?: AbortSignal;
    resolve: (value: unknown) => void;
  }> = [];
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(supabase, 'rpc', (_name: string, args: Record<string, string>) => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    const request = { args, resolve, signal: undefined as AbortSignal | undefined };
    requests.push(request);
    return {
      abortSignal(signal: AbortSignal) {
        request.signal = signal;
        signal.addEventListener('abort', () => reject(new globalThis.DOMException('Aborted', 'AbortError')), { once: true });
        return this;
      },
      then: promise.then.bind(promise),
    };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const observer = new QueryObserver(client, caixaPosicaoTotalResumoQueryOptions('polo-a', '2026-07-01'));
  const seenScopes: Array<string | null> = [];
  const unsubscribe = observer.subscribe(result => {
    if (result.data) seenScopes.push(result.data.poloId);
  });
  try {
    await tick();
    assert.equal(requests.length, 1);
    observer.setOptions(caixaPosicaoTotalResumoQueryOptions('polo-b', '2026-07-01'));
    await tick();
    assert.equal(requests.length, 2);
    assert.equal(requests[0].signal?.aborted, true);
    assert.equal(requests[1].signal?.aborted, false);
    assert.equal(requests[1].args.p_competencia, '2026-07-01');
    requests[1].resolve({ data: unavailable('polo-b', '2026-07-01'), error: null });
    await tick();
    requests[0].resolve({ data: unavailable('polo-a', '2026-07-01'), error: null });
    await tick();
    assert.equal(observer.getCurrentResult().data?.poloId, 'polo-b');
    assert.deepEqual([...new Set(seenScopes)], ['polo-b']);
    observer.setOptions(caixaPosicaoTotalResumoQueryOptions('polo-b', '2026-06-01'));
    await tick();
    assert.equal(requests[2].args.p_competencia, '2026-06-01');
    unsubscribe();
    assert.equal(requests[2].signal?.aborted, true);
  } finally { unsubscribe(); await tick(); client.clear(); }
});

test('falha ou carregamento mensal não representam zero nem mostram valores antigos', () => {
  const loading = renderToStaticMarkup(<CaixaStatementSection
    isLoading hasError={false} isConsolidated={false} onRetry={() => undefined}
  />);
  assert.match(loading, /role="status"/);
  assert.match(loading, /polo selecionados/);
  assert.doesNotMatch(loading, /R\$/);
  const failed = renderToStaticMarkup(<CaixaStatementSection
    isLoading={false} hasError isConsolidated={false} onRetry={() => undefined}
  />);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Tentar novamente/);
  assert.doesNotMatch(failed, /R\$|Déficit|Superávit/);
});

test('filtros e resumo independente permanecem visíveis enquanto a prestação carrega', () => {
  const client = new QueryClient();
  const today = new Date();
  const competencia = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const options = caixaPosicaoTotalResumoQueryOptions('polo-b', competencia);
  client.setQueryData(options.queryKey, mapCaixaPosicaoTotalResumo(unavailable('polo-b', competencia)));
  try {
    const html = renderToStaticMarkup(<QueryClientProvider client={client}>
      <CaixaPage poloId="polo-b" poloName="Unidade B" />
    </QueryClientProvider>);
    assert.match(html, /Mês anterior/);
    assert.match(html, /Unidade B/);
    assert.match(html, /Carregando prestação de contas/);
    assert.match(html, /histórico disponível não permite apurar/);
    assert.doesNotMatch(html, /Nenhuma receita recebida/);
  } finally { client.clear(); }
});

test('troca autorizada no Caixa confirma o polo sem warmup ou espera de RPC', t => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const setItem = t.mock.fn();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { setItem } });
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'sessionStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  const client = new QueryClient();
  const ensure = t.mock.method(client, 'ensureQueryData', () => { throw new Error('Warmup indevido'); });
  const commit = t.mock.fn();
  let change!: (poloId: string) => void;
  const Harness = () => {
    change = useGestorPoloTransition({
      gestorScope: { isGlobal: false, allowedPoloIds: ['polo-a', 'polo-b'], activePoloId: 'polo-a' },
      visiblePolos: [polo('polo-a'), polo('polo-b')], currentPolo: polo('polo-a'),
      effectivePoloId: 'polo-a', activeModule: 'caixa', dashboardWidgets: [], dashboardAccessKey: '',
      hasUnsavedAutomationDraft: false, setIsPoloSelectorOpen: () => undefined,
      setCurrentPoloId: commit, setActiveModule: () => undefined, setHasUnsavedAutomationDraft: () => undefined,
    }).handlePoloChange;
    return null;
  };
  renderToStaticMarkup(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  change('polo-b');
  assert.equal(commit.mock.callCount(), 1);
  assert.deepEqual(commit.mock.calls[0].arguments, ['polo-b']);
  assert.deepEqual(setItem.mock.calls[0].arguments, ['current_polo_id', 'polo-b']);
  assert.equal(ensure.mock.callCount(), 0);
  client.clear();
});

test('troca rápida do Caixa preserva a negação de polo fora do escopo', t => {
  const client = new QueryClient();
  const commit = t.mock.fn();
  const ensure = t.mock.method(client, 'ensureQueryData', () => { throw new Error('Warmup indevido'); });
  let change!: (poloId: string) => void;
  const Harness = () => {
    change = useGestorPoloTransition({
      gestorScope: { isGlobal: false, allowedPoloIds: ['polo-a'], activePoloId: 'polo-a' },
      visiblePolos: [polo('polo-a'), polo('polo-b')], currentPolo: polo('polo-a'),
      effectivePoloId: 'polo-a', activeModule: 'caixa', dashboardWidgets: [], dashboardAccessKey: '',
      hasUnsavedAutomationDraft: false, setIsPoloSelectorOpen: () => undefined,
      setCurrentPoloId: commit, setActiveModule: () => undefined, setHasUnsavedAutomationDraft: () => undefined,
    }).handlePoloChange;
    return null;
  };
  renderToStaticMarkup(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  change('polo-b');
  change('polo-desconhecido');
  assert.equal(commit.mock.callCount(), 0);
  assert.equal(ensure.mock.callCount(), 0);
  client.clear();
});
