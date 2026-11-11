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
  const pending = new Map<string, readonly unknown[]>();
  const refresh = (keys: readonly (readonly unknown[])[]) => {
    if (disposed) return;
    keys.forEach(key => pending.set(JSON.stringify(key), key));
    if (!pending.size || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed) return;
      const keys = [...pending.values()]; pending.clear();
      for (const queryKey of keys) void client.invalidateQueries({ queryKey });
    }, 150);
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
