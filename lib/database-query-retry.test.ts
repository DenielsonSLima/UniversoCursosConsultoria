import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { retryDatabaseRead } from './database-query-retry.ts';

const timeout = { code: '57014', message: 'canceling statement due to statement timeout' };

test('timeout SQL deixa o carregamento na primeira resposta e preserva o erro', async () => {
  for (const [retry, expectedCalls] of [[1, 2], [retryDatabaseRead, 1]] as const) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
    let calls = 0;
    const observer = new QueryObserver(client, {
      queryKey: ['timeout'], enabled: false, retry, retryDelay: 0,
      queryFn: async () => { calls += 1; throw timeout; },
    });
    const states: { isLoading: boolean; isError: boolean }[] = [];
    const unsubscribe = observer.subscribe((state) => states.push(state));
    try {
      const result = await observer.refetch();
      assert.equal(calls, expectedCalls);
      assert.equal(result.error, timeout);
      assert.equal(result.isError, true);
      assert.equal(result.isLoading, false);
      assert.equal(result.fetchStatus, 'idle');
      assert.equal(result.data, undefined, 'falha não é convertida em indicadores zero');
      assert.ok(states.some((state) => state.isLoading));
      assert.equal(states.at(-1)?.isError, true);
    } finally {
      unsubscribe();
      client.clear();
    }
  }
});

test('falha transitória de rede mantém uma repetição e pode recuperar', async () => {
  const client = new QueryClient();
  let calls = 0;
  try {
    const data = await client.fetchQuery({
      queryKey: ['network'], retry: retryDatabaseRead, retryDelay: 0,
      queryFn: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError('Failed to fetch');
        return { total: 12 };
      },
    });
    assert.equal(calls, 2);
    assert.deepEqual(data, { total: 12 });
    assert.equal(retryDatabaseRead(1, new Error('Network unavailable')), false);
  } finally {
    client.clear();
  }
});

test('nova consulta explícita continua permitida após timeout sem repetição automática', async () => {
  const client = new QueryClient();
  let calls = 0;
  const observer = new QueryObserver(client, {
    queryKey: ['manual-refetch'], enabled: false, retry: retryDatabaseRead, retryDelay: 0,
    queryFn: async () => {
      calls += 1;
      if (calls === 1) throw timeout;
      return { total: 17 };
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    assert.equal((await observer.refetch()).isError, true);
    const recovered = await observer.refetch();
    assert.equal(calls, 2);
    assert.equal(recovered.isSuccess, true);
    assert.deepEqual(recovered.data, { total: 17 });
  } finally {
    unsubscribe();
    client.clear();
  }
});
