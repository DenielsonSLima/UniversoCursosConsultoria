import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NfseDocument, NfseScope } from '../../types/nfse.types';
import { resolveNfseIssuedDocument } from '../services/nfse-issued-presentation';

/** Follow authenticated list refreshes while a viewer is open; never consult the fiscal provider here. */
export function useNfseIssuedSelection(scope: NfseScope | null, selected: NfseDocument | null, authorizationConfirmed = false) {
  const client = useQueryClient(), cache = client.getQueryCache();
  const identity = JSON.stringify([scope, selected?.id, selected?.number, selected?.accessKey]);
  const listedIdentity = useRef<string | null>(null);
  const snapshot = useCallback(() => {
    if (!scope || !selected) return null;
    return resolveNfseIssuedDocument(client, scope, selected, authorizationConfirmed && listedIdentity.current !== identity);
  }, [client, scope, selected, authorizationConfirmed, identity]);
  const subscribe = useCallback((changed: () => void) => cache.subscribe(changed), [cache]);
  const document = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    // Once a canonical list has supplied this row, later removal keeps the
    // ordinary fail-closed behavior while the cancellation projection arrives.
    if (document && document !== selected) listedIdentity.current = identity;
  }, [document, selected, identity]);
  return document;
}
