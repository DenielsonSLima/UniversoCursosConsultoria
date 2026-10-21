import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { createCaixaReadQueue } from './caixa-read-queue';
import { caixaDashboardQueryOptions, caixaFinanciamentoResumoQueryOptions } from './caixa.service';
import { caixaComposicaoQueryOptions } from './caixa-composicao.queries';
import { caixaReceivablesPositionQueryOptions } from './review-pending/caixa-receivables-position.service';
import { caixaReviewQueryOptions } from './review-pending/caixa-review-pending.service';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const abortError = (error: unknown) => error instanceof globalThis.DOMException && error.name === 'AbortError';
const request = { poloId: null, competencia: '2026-10-01', context: 'MONTHLY' as const, page: 1, pageSize: 20 };

test('a fila não inicia rede antes da vaga; revisão passa à frente e falha libera sem repetição', async () => {
  const queue = createCaixaReadQueue();
  const signal = new AbortController().signal;
  const order: string[] = [];
  let finish!: () => void;
  const first = queue(signal, () => { order.push('position'); return new Promise<void>(resolve => { finish = resolve; }); });
  const composition = queue(signal, async () => { order.push('composition'); return 'composition'; });
  const failure = new Error('Falha real');
  const review = queue(signal, async () => { order.push('review'); throw failure; }, 'interactive');
  const rejected = assert.rejects(review, error => error === failure);
  await tick();
  assert.deepEqual(order, ['position']);
  finish();
  await Promise.all([first, composition, rejected]);
  assert.deepEqual(order, ['position', 'review', 'composition']);
});

test('cancelar a espera remove a consulta sem chamar getter; sinal já cancelado também não envia', async () => {
  const queue = createCaixaReadQueue();
  const waiting = new AbortController();
  let finish!: () => void;
  let calls = 0;
  const first = queue(new AbortController().signal, () => new Promise<void>(resolve => { finish = resolve; }));
  const second = queue(waiting.signal, async () => { calls++; });
  const rejected = assert.rejects(second, abortError);
  waiting.abort();
  await rejected;
  await assert.rejects(queue(waiting.signal, async () => { calls++; }), abortError);
  await tick(); finish(); await first; await tick();
  assert.equal(calls, 0);
});

test('cancelamento em execução mantém a vaga até o transporte encerrar e então libera a próxima', async () => {
  const queue = createCaixaReadQueue();
  const running = new AbortController();
  let finishTransport!: () => void;
  let nextStarted = false;
  const first = queue(running.signal, () => new Promise<void>(resolve => { finishTransport = resolve; }));
  const next = queue(new AbortController().signal, async () => { nextStarted = true; });
  const rejected = assert.rejects(first, abortError);
  await tick(); running.abort(); await tick();
  assert.equal(nextStarted, false, 'abort não inicia outra consulta sobre transporte ainda ativo');
  finishTransport(); await rejected; await next;
  assert.equal(nextStarted, true);
});

test('QueryObservers reais limitam as quatro leituras; cartões independentes continuam paralelos', async t => {
  const calls: Array<{ name: string; args: unknown; signal?: AbortSignal; finish: () => void }> = [];
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(supabase, 'rpc', (name: string, args: unknown) => {
    let resolve!: (response: unknown) => void;
    const promise = new Promise(done => { resolve = done; });
    const call = { name, args, signal: undefined as AbortSignal | undefined,
      finish: () => resolve({ data: null, error: { code: '57014', message: 'Statement timeout' } }) };
    calls.push(call);
    return { abortSignal(signal: AbortSignal) { call.signal = signal; return this; }, then: promise.then.bind(promise) };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } });
  const observers = [
    caixaReceivablesPositionQueryOptions(null, request.competencia),
    caixaDashboardQueryOptions(null, request.competencia),
    caixaComposicaoQueryOptions(null, request.competencia),
    caixaReviewQueryOptions(request),
    caixaFinanciamentoResumoQueryOptions(null, request.competencia),
  ].map(options => new QueryObserver(client, options as ReturnType<typeof caixaDashboardQueryOptions>));
  const unsubscribe = observers.map(observer => observer.subscribe(() => undefined));
  try {
    await tick();
    assert.deepEqual(calls.map(call => call.name).sort(), [
      'get_caixa_financiamento_resumo_secure', 'get_caixa_receivables_position_secure',
    ]);
    assert.equal(observers[3].getCurrentResult().isPending, true, 'revisão mostra carregamento enquanto espera');
    calls.find(call => call.name === 'get_caixa_receivables_position_secure')!.finish();
    await tick();
    assert.equal(calls[2].name, 'get_caixa_review_pending_page_secure');
    assert.deepEqual(calls[2].args, { p_polo_id: null, p_competencia: request.competencia,
      p_context: 'MONTHLY', p_page: 1, p_page_size: 20 });
    calls[2].finish(); await tick();
    assert.equal(calls[3].name, 'get_caixa_prestacao_mensal_secure');
    calls[3].finish(); await tick();
    assert.equal(calls[4].name, 'get_caixa_composicao_mensal_v2_secure');
    calls[4].finish();
    calls.find(call => call.name === 'get_caixa_financiamento_resumo_secure')!.finish();
    await tick(); await tick();
    assert.equal(calls.length, 5, 'timeout SQL não é repetido pela fila ou pelas queries');
    assert.ok(calls.every(call => call.signal instanceof AbortSignal));
  } finally {
    unsubscribe.forEach(stop => stop()); calls.forEach(call => call.finish());
    await tick(); client.clear();
  }
});

test('desmontar observer em espera cancela seu envio e não interfere no recorte ativo', async t => {
  const calls: Array<{ name: string; signal?: AbortSignal; finish: () => void }> = [];
  t.mock.method(supabase, 'rpc', (name: string) => {
    let resolve!: (response: unknown) => void;
    const promise = new Promise(done => { resolve = done; });
    const call = { name, signal: undefined as AbortSignal | undefined,
      finish: () => resolve({ data: null, error: { code: '57014' } }) };
    calls.push(call);
    return { abortSignal(signal: AbortSignal) { call.signal = signal; return this; }, then: promise.then.bind(promise) };
  });
  const client = new QueryClient();
  const position = new QueryObserver(client, caixaReceivablesPositionQueryOptions(null, request.competencia));
  const review = new QueryObserver(client, caixaReviewQueryOptions(request));
  const stopPosition = position.subscribe(() => undefined);
  const stopReview = review.subscribe(() => undefined);
  try {
    await tick(); assert.equal(calls.length, 1);
    stopReview(); calls[0].finish(); await tick(); await tick();
    assert.equal(calls.length, 1, 'lista fechada não dispara consulta após liberar a vaga');
    assert.equal(calls[0].signal?.aborted, false);
  } finally {
    stopReview(); stopPosition(); calls.forEach(call => call.finish());
    await tick(); client.clear();
  }
});

test('trocar competência cancela leitura ativa e resposta tardia não atravessa o novo recorte', async t => {
  const calls: Array<{ month: string; signal?: AbortSignal; finish: () => void }> = [];
  t.mock.method(supabase, 'rpc', (_name: string, args: { p_competencia: string }) => {
    let resolve!: (response: unknown) => void;
    const promise = new Promise(done => { resolve = done; });
    const month = args.p_competencia;
    const call = { month, signal: undefined as AbortSignal | undefined,
      finish: () => resolve({ error: null, data: { success: true, data: {
        ...request, competencia: month, dataCorte: `${month.slice(0, 7)}-20`,
        geradoEm: '2026-10-21T03:00:00Z', totalPages: 1, totalCount: 0, totalNominal: '0.00', items: [],
      } } }) };
    calls.push(call);
    return { abortSignal(signal: AbortSignal) { call.signal = signal; return this; }, then: promise.then.bind(promise) };
  });
  const client = new QueryClient();
  const observer = new QueryObserver(client, caixaReviewQueryOptions(request));
  const seen: string[] = [];
  const stop = observer.subscribe(result => { if (result.data) seen.push(result.data.competencia); });
  try {
    await tick(); assert.equal(calls.length, 1);
    observer.setOptions(caixaReviewQueryOptions({ ...request, competencia: '2026-09-01' }));
    await tick(); assert.equal(calls[0].signal?.aborted, true);
    assert.equal(calls.length, 1, 'novo recorte espera transporte anterior encerrar');
    calls[0].finish(); await tick();
    assert.equal(calls[1].month, '2026-09-01');
    calls[1].finish(); await tick();
    assert.deepEqual([...new Set(seen)], ['2026-09-01']);
  } finally {
    stop(); calls.forEach(call => call.finish()); await tick(); client.clear();
  }
});
