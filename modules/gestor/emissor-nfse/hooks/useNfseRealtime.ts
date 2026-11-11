import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { nfseRealtimeTargets } from '../realtime/nfse.realtime';
import { NFSE_BACKEND_ENABLED } from '../services/nfse.runtime';
import { isNfseScopeValid } from '../types/nfse.scope';
import type { NfseScope } from '../types/nfse.types';
import { nfseCacheTargets } from '../queries/nfse-cache';
import { subscribeNfseChanges } from '../realtime/nfse-subscription';

export function useNfseRealtime(scope: NfseScope | null, enabled = true) {
  const client = useQueryClient();
  const poloId = scope?.poloId;
  const contextKey = scope?.contextKey;
  const environment = scope?.environment;
  const month = scope?.month;

  useEffect(() => {
    if (!NFSE_BACKEND_ENABLED || !enabled || !poloId || !contextKey || !environment || !month) return;
    const captured = { poloId, contextKey, environment, month };
    if (!isNfseScopeValid(captured)) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import('../../../../lib/supabase').then(({ supabase }) => {
      if (disposed) return;
      cleanup = subscribeNfseChanges(supabase, client, `nfse:${captured.poloId}:${crypto.randomUUID()}`,
        [{ table: 'nfse_change_events', filter: `polo_id=eq.${captured.poloId}`, targets: payload => nfseRealtimeTargets(payload, captured) }],
        [...nfseCacheTargets(captured, 'models'), ...nfseCacheTargets(captured, 'configuration'),
          ...nfseCacheTargets(captured, 'cancellation-models'), ...nfseCacheTargets(captured, 'services')]);
    }).catch(() => { /* Query focus/reconnect remains available if the client cannot load. */ });
    return () => { disposed = true; cleanup?.(); };
  }, [client, enabled, poloId, contextKey, environment, month]);
}
