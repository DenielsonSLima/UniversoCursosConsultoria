import type { QueryClient } from '@tanstack/react-query';

const queryKeyContainsPolo = (value: unknown, poloId: string): boolean => {
  if (value === poloId) return true;
  if (Array.isArray(value)) return value.some((item) => queryKeyContainsPolo(item, poloId));
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => queryKeyContainsPolo(item, poloId));
  }
  return false;
};

export const waitForNextPaint = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

export const waitForActivePoloQueries = async (
  queryClient: QueryClient,
  poloId: string,
  startedAt: number,
  timeoutMs = 15_000,
  quietWindowMs = 300,
) => {
  await waitForNextPaint();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};
    let timeoutId = 0;
    let quietTimerId = 0;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.clearTimeout(quietTimerId);
      unsubscribe();
      callback();
    };

    const check = () => {
      const scopedQueries = queryClient.getQueryCache().findAll({
        predicate: (query) =>
          query.getObserversCount() > 0
          && queryKeyContainsPolo(query.queryKey, poloId),
      });
      const failedQuery = scopedQueries.find(
        (query) => query.state.status === 'error' && query.state.errorUpdatedAt >= startedAt,
      );

      if (failedQuery) {
        finish(() => reject(failedQuery.state.error));
        return;
      }

      window.clearTimeout(quietTimerId);
      if (scopedQueries.some((query) => query.state.fetchStatus === 'fetching')) {
        return;
      }

      // Queries críticas são preparadas explicitamente antes do commit. Esta
      // janela absorve registros/refetches feitos pelo módulo após a renderização,
      // sem considerar uma lista momentaneamente vazia como sucesso imediato.
      quietTimerId = window.setTimeout(() => finish(resolve), quietWindowMs);
    };

    timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error('A atualização do polo excedeu o tempo esperado.')));
    }, timeoutMs);

    unsubscribe = queryClient.getQueryCache().subscribe(check);
    check();
  });
};
