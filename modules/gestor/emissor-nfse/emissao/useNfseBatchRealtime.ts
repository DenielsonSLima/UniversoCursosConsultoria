import { useEffect } from 'react';
import type { NfseScope } from '../types/nfse.types';
import { nfseRealtimeTargets } from '../realtime/nfse.realtime';
import { isNfseQueueEvent } from '../fila/nfse-queue.realtime';

/** Wake a canonical observation, never start or repeat a fiscal command. */
export function useNfseOperationRealtime(scope: NfseScope, changed: (immediate?: boolean) => void, enabled = true) {
  const { poloId, contextKey, environment, month } = scope;
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const recover = () => { if (!disposed) changed(); };
    window.addEventListener('focus', recover);
    window.addEventListener('online', recover);
    const captured = { poloId, contextKey, environment, month };
    void import('../../../../lib/supabase').then(({ supabase }) => {
      if (disposed) return;
      const channel = supabase.channel(`nfse-batch:${poloId}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nfse_queue_change_events', filter: `polo_id=eq.${poloId}` }, payload => {
          if (!disposed && isNfseQueueEvent(payload, captured)) changed(true);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nfse_change_events', filter: `polo_id=eq.${poloId}` }, payload => {
          if (!disposed && nfseRealtimeTargets(payload, captured).length) changed();
        }).subscribe(status => { if (!disposed && status === 'SUBSCRIBED') changed(true); });
      cleanup = () => { void supabase.removeChannel(channel); };
    }).catch(() => { /* The central worker continues; focus/online can recover the observation. */ });
    return () => { disposed = true; cleanup?.(); window.removeEventListener('focus', recover); window.removeEventListener('online', recover); };
  }, [poloId, contextKey, environment, month, changed, enabled]);
}

export const useNfseBatchRealtime = useNfseOperationRealtime;
