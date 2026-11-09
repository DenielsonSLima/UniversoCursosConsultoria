import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { isNfseScopeValid } from '../../types/nfse.scope';
import { nfsePartnerServicesKeys } from '../queries/nfse-partner-services.keys';

/** Financial events refresh title choices; private drafts refresh on save/focus. */
export function useNfsePartnerServicesRealtime(scope: NfseScope | null) {
  const client = useQueryClient();
  const contextKey = scope?.contextKey;
  const poloId = scope?.poloId;
  const environment = scope?.environment;
  const month = scope?.month;
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
        void client.invalidateQueries({ queryKey: nfsePartnerServicesKeys.scope(captured) });
      }, 300);
    };
    void import('../../../../../lib/supabase').then(({ supabase }) => {
      if (disposed) return;
      let subscribed = false;
      const channel = supabase.channel(`nfse-partner-services:${poloId}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'finance_realtime_events', filter: `polo_id=eq.${poloId}` }, invalidate)
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          if (subscribed) invalidate();
          subscribed = true;
        });
      cleanup = () => { void supabase.removeChannel(channel); };
    });
    return () => { disposed = true; if (timer) clearTimeout(timer); cleanup?.(); };
  }, [client, contextKey, poloId, environment, month]);
}
