import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isNfseScopeValid } from '../types/nfse.scope';
import type { NfseScope } from '../types/nfse.types';
import { nfseQueueKeys } from './nfse-queue.types';
import { isNfseQueueEvent } from './nfse-queue.realtime';

export function useNfseQueueRealtime(scope: NfseScope | null) {
  const client = useQueryClient();
  const contextKey = scope?.contextKey, poloId = scope?.poloId;
  const environment = scope?.environment, month = scope?.month;
  useEffect(() => {
    const captured = contextKey && poloId && environment && month ? { contextKey, poloId, environment, month } : null;
    if (!isNfseScopeValid(captured)) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!disposed) void client.invalidateQueries({ queryKey: nfseQueueKeys.scope(captured) });
      }, 200);
    };
    void import('../../../../lib/supabase').then(({ supabase }) => {
      if (disposed) return;
      const channel = supabase.channel(`nfse-queue:${poloId}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nfse_queue_change_events',
          filter: `polo_id=eq.${poloId}` }, payload => {
          if (isNfseQueueEvent(payload, captured)) invalidate();
        }).subscribe(status => { if (status === 'SUBSCRIBED') invalidate(); });
      cleanup = () => { void supabase.removeChannel(channel); };
    }).catch(() => { /* Focus/reconnect and bounded polling keep recovery automatic. */ });
    return () => { disposed = true; if (timer) clearTimeout(timer); cleanup?.(); };
  }, [client, contextKey, poloId, environment, month]);
}
