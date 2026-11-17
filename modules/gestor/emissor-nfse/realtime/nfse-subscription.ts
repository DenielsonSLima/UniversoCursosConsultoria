import type { QueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Binding {
  table: string;
  filter: string;
  targets: (payload: unknown) => readonly (readonly unknown[])[];
}

/** Coalesces bursts; reconnect refreshes projections once, never a fiscal POST. */
export function subscribeNfseChanges(supabase: Pick<SupabaseClient, 'channel' | 'removeChannel'>,
  client: QueryClient, name: string, bindings: readonly Binding[], recovery: readonly (readonly unknown[])[]) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshing = false;
  const pending = new Map<string, readonly unknown[]>();
  const schedule = () => {
    if (disposed || refreshing || !pending.size || timer) return;
    timer = setTimeout(async () => {
      timer = undefined;
      if (disposed) return;
      refreshing = true;
      const keys = [...pending.values()]; pending.clear();
      try {
        await Promise.all(keys.map(async queryKey => {
          // A read already in flight may predate this event. Let it finish without
          // cancellation, then read once more so the latest event is not lost.
          const alreadyFetching = client.isFetching({ queryKey }) > 0;
          await client.invalidateQueries({ queryKey }, { cancelRefetch: false });
          if (alreadyFetching && !disposed) {
            await client.invalidateQueries({ queryKey }, { cancelRefetch: false });
          }
        }));
      } finally {
        refreshing = false;
        schedule();
      }
    }, 150);
  };
  const refresh = (keys: readonly (readonly unknown[])[]) => {
    if (disposed) return;
    keys.forEach(key => pending.set(JSON.stringify(key), key));
    schedule();
  };
  let channel = supabase.channel(name);
  for (const binding of bindings) channel = channel.on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: binding.table, filter: binding.filter,
  }, payload => refresh(binding.targets(payload)));
  channel.subscribe(status => {
    if (disposed) return;
    if (status === 'SUBSCRIBED') refresh(recovery);
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      // Keep known data, mark it stale, and let focus/reconnect recover without polling.
      for (const queryKey of recovery) void client.invalidateQueries({ queryKey, refetchType: 'none' });
    }
  });
  return () => { disposed = true; if (timer) clearTimeout(timer); pending.clear(); void supabase.removeChannel(channel); };
}
