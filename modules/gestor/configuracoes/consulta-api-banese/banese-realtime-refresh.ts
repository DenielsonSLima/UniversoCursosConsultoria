import type { QueryClient, QueryKey } from '@tanstack/react-query';

const WINDOW_MS = 750;
const POLL_MS = 30_000;

export function baneseReadInterval(query: { state: { status: string; errorUpdateCount: number } }): number {
  return query.state.status === 'error'
    ? Math.min(60_000, POLL_MS * 2 ** Math.min(1, Math.max(0, query.state.errorUpdateCount - 1)))
    : POLL_MS;
}

/** A fixed window, rather than a trailing debounce: continuous events cannot starve reads. */
export function createBaneseRealtimeRefresh(client: QueryClient) {
  const pending = new Map<string, QueryKey>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scheduledAt = 0;
  let running = false;
  let disposed = false;

  const activeQueries = (keys: QueryKey[]) => [...new Map(keys.flatMap(queryKey =>
    client.getQueryCache().findAll({ queryKey, type: 'active' })
      .map(query => [query.queryHash, query] as const),
  )).values()];
  const waitForError = (query: ReturnType<typeof activeQueries>[number]) => query.state.status === 'error'
    ? Math.max(0, query.state.errorUpdatedAt + baneseReadInterval(query) - Date.now())
    : 0;
  const queue = (key: QueryKey) => pending.set(JSON.stringify(key), key);

  const schedule = () => {
    if (disposed || running || !pending.size) return;
    const queries = activeQueries([...pending.values()]);
    const wait = queries.length ? Math.min(...queries.map(waitForError)) : 0;
    const nextAt = Date.now() + Math.max(WINDOW_MS, wait);
    if (timer !== undefined && scheduledAt <= nextAt) return;
    if (timer !== undefined) clearTimeout(timer);
    scheduledAt = nextAt;
    timer = setTimeout(() => { timer = undefined; void flush(); }, nextAt - Date.now());
  };

  const flush = async () => {
    if (disposed) return;
    const keys = [...pending.values()];
    pending.clear();
    running = true;
    try {
      // Inactive cached pages become stale without starting hidden requests.
      await Promise.all(keys.map(queryKey => client.invalidateQueries(
        { queryKey, refetchType: 'none' }, { cancelRefetch: false },
      )));
      if (disposed) return;
      await Promise.all(activeQueries(keys).map(async query => {
        if (query.state.fetchStatus === 'paused') return;
        if (waitForError(query) > 0) { queue(query.queryKey); return; }
        // A read already in flight may have taken its snapshot BEFORE this event.
        const wasFetching = query.state.fetchStatus === 'fetching';
        await client.refetchQueries(
          { queryKey: query.queryKey, exact: true, type: 'active' },
          { cancelRefetch: false },
        );
        if (disposed || !query.isActive()
          || client.getQueryState(query.queryKey)?.fetchStatus === 'paused') return;
        if (query.state.status === 'error' || wasFetching) queue(query.queryKey);
      }));
    } finally {
      running = false;
      schedule();
    }
  };

  return {
    notify(queryKey: QueryKey) {
      if (disposed) return;
      queue(queryKey);
      schedule();
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      pending.clear();
      // TanStack cancels consumed AbortSignals when the last observer unmounts.
    },
  };
}
