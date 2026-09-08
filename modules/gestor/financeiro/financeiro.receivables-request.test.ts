import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  readReceivablesRequest,
  ReceivablesTimeoutError,
  receivablesReadQueryOptions,
} from './financeiro.receivables-request.ts';

test('requisição que não termina sai do carregamento e permite repetir sem mudar filtros', async () => {
  const client = new QueryClient();
  const filters = { dueStart: '2026-09-01', dueEnd: '2026-09-30', poloId: 'test-polo' };
  let available = false;
  let requestSignal: AbortSignal | undefined;
  let attempts = 0;
  const options = {
    ...receivablesReadQueryOptions,
    queryKey: ['receivables-recovery-test', filters],
    queryFn: ({ signal }: { signal: AbortSignal }) => readReceivablesRequest((innerSignal) => {
      attempts += 1;
      requestSignal = innerSignal;
      return available ? Promise.resolve({ total: 520 }) : new Promise<{ total: number }>(() => {});
    }, signal, 20),
  };
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  try {
    assert.equal(observer.getCurrentResult().isLoading, true);
    await assert.rejects(client.fetchQuery(options), ReceivablesTimeoutError);
    assert.equal(requestSignal?.aborted, true);
    assert.equal(observer.getCurrentResult().isLoading, false);
    assert.equal(observer.getCurrentResult().isError, true);
    assert.equal(attempts, 1, 'timeout não causa repetição automática prolongada');
    available = true;
    const recovered = await observer.refetch();
    assert.deepEqual(recovered.data, { total: 520 });
    assert.equal(recovered.isSuccess, true);
    assert.equal(attempts, 2);
    assert.deepEqual(client.getQueryCache().getAll()[0].queryKey, options.queryKey);
  } finally {
    unsubscribe();
    client.clear();
  }
});

test('cancelamento de filtro aborta o transporte mesmo sem resposta do cliente', async () => {
  const parent = new AbortController();
  let requestSignal: AbortSignal | undefined;
  const promise = readReceivablesRequest((signal) => {
    requestSignal = signal;
    return new Promise(() => {});
  }, parent.signal);
  await Promise.resolve();
  parent.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.equal(requestSignal?.aborted, true);
});

test('sinal já cancelado não inicia consulta', async () => {
  const parent = new AbortController();
  parent.abort();
  let called = false;
  await assert.rejects(readReceivablesRequest(() => {
    called = true;
    return Promise.resolve(null);
  }, parent.signal), { name: 'AbortError' });
  assert.equal(called, false);
});

test('sucesso libera timer e falha original é preservada', async () => {
  let requestSignal: AbortSignal | undefined;
  assert.equal(await readReceivablesRequest((signal) => {
    requestSignal = signal;
    return Promise.resolve(520);
  }, undefined, 5), 520);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(requestSignal?.aborted, false);
  const failure = new Error('Servidor indisponível');
  await assert.rejects(readReceivablesRequest(() => Promise.reject(failure)), (error) => error === failure);
});

test('timeout do banco e autorização não repetem; falha transitória permite uma repetição', () => {
  assert.equal(receivablesReadQueryOptions.retry(0, { code: '57014' }), false);
  assert.equal(receivablesReadQueryOptions.retry(0, { code: '42501' }), false);
  assert.equal(receivablesReadQueryOptions.retry(0, { code: 'PGRST002' }), true);
  assert.equal(receivablesReadQueryOptions.retry(1, { code: 'PGRST002' }), false);
});
