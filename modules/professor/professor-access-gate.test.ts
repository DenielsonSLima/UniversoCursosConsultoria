import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/query-core';
import {
  professorActivePolosFreshnessOptions,
  resolveProfessorAccessGate,
} from './professor-access-gate.ts';

const POLO = { id: 'polo-atual', nome: 'Polo atual' };

const flushQueryNotifications = async () => {
  await Promise.resolve();
  await new Promise<void>((resolve) => globalThis.setImmediate(resolve));
};

const runAuthoritativeMount = async (cached: boolean) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1_000 } },
  });
  const queryKey = ['professor-active-polos', 'professor-atual', ['polo-atual']];
  if (cached) queryClient.setQueryData(queryKey, [POLO]);

  let queryCalls = 0;
  let releaseQuery!: (polos: typeof POLO[]) => void;
  const queryResult = new Promise<typeof POLO[]>((resolve) => {
    releaseQuery = resolve;
  });
  const observer = new QueryObserver(queryClient, {
    queryKey,
    queryFn: () => {
      queryCalls += 1;
      return queryResult;
    },
    ...professorActivePolosFreshnessOptions,
  });

  let protectedRenders = 0;
  let latestGate = resolveProfessorAccessGate({
    hasCurrentPolo: true,
    isError: observer.getCurrentResult().isError,
    isFetchedAfterMount: observer.getCurrentResult().isFetchedAfterMount,
    isSuccess: observer.getCurrentResult().isSuccess,
  });
  const unsubscribe = observer.subscribe((result) => {
    latestGate = resolveProfessorAccessGate({
      hasCurrentPolo: true,
      isError: result.isError,
      isFetchedAfterMount: result.isFetchedAfterMount,
      isSuccess: result.isSuccess,
    });
    if (latestGate === 'authorized') protectedRenders += 1;
  });

  assert.equal(queryCalls, 1, 'a montagem deve iniciar uma consulta autoritativa');
  assert.equal(latestGate, 'checking');
  assert.equal(protectedRenders, 0, 'cache não pode liberar o conteúdo protegido');

  releaseQuery([POLO]);
  await flushQueryNotifications();

  assert.equal(latestGate, 'authorized');
  assert.equal(protectedRenders, 1);
  assert.equal(queryCalls, 1);
  unsubscribe();
  queryClient.clear();
};

test('cache vazio consulta o backend e não renderiza antes da resposta atual', async () => {
  await runAuthoritativeMount(false);
});

test('cache preenchido força nova consulta e não autoriza com isSuccess herdado', async () => {
  await runAuthoritativeMount(true);
});

test('sucesso atual sem polo permanece fechado para o redirecionamento', () => {
  assert.equal(resolveProfessorAccessGate({
    hasCurrentPolo: false,
    isError: false,
    isFetchedAfterMount: true,
    isSuccess: true,
  }), 'checking');
});

test('erro só é exibido quando pertence a uma tentativa desta montagem', () => {
  assert.equal(resolveProfessorAccessGate({
    hasCurrentPolo: true,
    isError: true,
    isFetchedAfterMount: false,
    isSuccess: false,
  }), 'checking');
  assert.equal(resolveProfessorAccessGate({
    hasCurrentPolo: true,
    isError: true,
    isFetchedAfterMount: true,
    isSuccess: false,
  }), 'connection-error');
});
