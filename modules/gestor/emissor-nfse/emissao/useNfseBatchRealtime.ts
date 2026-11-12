import { useEffect } from 'react';
import type { NfseScope } from '../types/nfse.types';
import { nfseRealtimeTargets } from '../realtime/nfse.realtime';

/** Realtime wakes only an active confirmation read, never starts or repeats an issuance. */
export function useNfseBatchRealtime(scope: NfseScope, changed: () => void, enabled = true) {
  const { poloId, contextKey, environment, month } = scope;
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    window.addEventListener('focus', changed);
    window.addEventListener('online', changed);
    const captured = { poloId, contextKey, environment, month };
    void import('../../../../lib/supabase').then(({ supabase }) => {
      if (disposed) return;
      const channel = supabase.channel(`nfse-batch:${poloId}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nfse_change_events', filter: `polo_id=eq.${poloId}` }, payload => {
          if (!disposed && nfseRealtimeTargets(payload, captured).length) changed();
        }).subscribe(status => { if (!disposed && status === 'SUBSCRIBED') changed(); });
      cleanup = () => { void supabase.removeChannel(channel); };
    }).catch(() => { /* Bounded confirmation reads still recover a missing event. */ });
    return () => { disposed = true; cleanup?.(); window.removeEventListener('focus', changed); window.removeEventListener('online', changed); };
  }, [poloId, contextKey, environment, month, changed, enabled]);
}
