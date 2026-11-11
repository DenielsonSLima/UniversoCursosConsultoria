import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isNfseScopeValid } from '../types/nfse.scope';
import type { NfseScope } from '../types/nfse.types';
import { nfseQueueRealtimeTargets } from './nfse-queue.realtime';
import { nfseCacheTargets } from '../queries/nfse-cache';
import { subscribeNfseChanges } from '../realtime/nfse-subscription';

export function useNfseQueueRealtime(scope: NfseScope | null) {
  const client = useQueryClient();
  const contextKey = scope?.contextKey, poloId = scope?.poloId;
  const environment = scope?.environment, month = scope?.month;
  useEffect(() => {
    const captured = contextKey && poloId && environment && month ? { contextKey, poloId, environment, month } : null;
    if (!isNfseScopeValid(captured)) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import('../../../../lib/supabase').then(({ supabase }) => {
      if (disposed) return;
      cleanup = subscribeNfseChanges(supabase, client, `nfse-queue:${poloId}:${crypto.randomUUID()}`,
        [{ table: 'nfse_queue_change_events', filter: `polo_id=eq.${poloId}`, targets: payload => nfseQueueRealtimeTargets(payload, captured) }],
        nfseCacheTargets(captured, 'operations'));
    }).catch(() => { /* Focus/reconnect recovers without polling. */ });
    return () => { disposed = true; cleanup?.(); };
  }, [client, contextKey, poloId, environment, month]);
}
