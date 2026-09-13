export const proescConsolePollingInterval = (
  query: { state: { status: 'pending' | 'error' | 'success' } },
): number | false => query.state.status === 'error' ? false : 30_000;

export const proescConsoleQueryPolicy = {
  retry: false,
  retryOnMount: false,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: 15_000,
  refetchInterval: proescConsolePollingInterval,
} as const;
