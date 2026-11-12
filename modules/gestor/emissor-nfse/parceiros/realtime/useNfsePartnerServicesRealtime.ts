import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { isNfseScopeValid } from '../../types/nfse.scope';
import { nfsePartnerServicesKeys } from '../queries/nfse-partner-services.keys';

import { subscribeNfseChanges } from '../../realtime/nfse-subscription';

/** Financial events refresh title choices; fiscal service changes use the page subscription. */
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
    void import('../../../../../lib/supabase').then(({ supabase }) => {
      if (disposed) return;
      const keys = [nfsePartnerServicesKeys.scope(captured)];
      cleanup = subscribeNfseChanges(supabase, client,
        `nfse-partner-services:${poloId}:${crypto.randomUUID()}`,
        [{ table: 'finance_realtime_events', filter: `polo_id=eq.${poloId}`, targets: () => keys }], keys);
    }).catch(() => { /* Queries recover on focus/reconnect; no polling. */ });
    return () => { disposed = true; cleanup?.(); };
  }, [client, contextKey, poloId, environment, month]);
}
