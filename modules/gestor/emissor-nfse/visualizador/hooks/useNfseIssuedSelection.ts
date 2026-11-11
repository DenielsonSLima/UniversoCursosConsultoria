import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NfseDocument, NfseScope } from '../../types/nfse.types';
import { resolveNfseIssuedDocument } from '../services/nfse-issued-presentation';

/** Follow authenticated list refreshes while a viewer is open; never consult the fiscal provider here. */
export function useNfseIssuedSelection(scope: NfseScope | null, selected: NfseDocument | null) {
  const client = useQueryClient(), cache = client.getQueryCache();
  const snapshot = useCallback(() => {
    if (!scope || !selected) return null;
    return resolveNfseIssuedDocument(client, scope, selected);
  }, [client, scope, selected]);
  const subscribe = useCallback((changed: () => void) => cache.subscribe(changed), [cache]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
