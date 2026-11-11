import { useQuery } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { isNfseScopeValid } from '../../types/nfse.scope';
import { nfseModelIssuerService } from '../services/nfse-model-issuer.service';
import { NfseAccessError } from '../../services/nfse.errors';

export function useNfseModelIssuerMetadata(scope: NfseScope | null) {
  return useQuery({ queryKey: ['nfse', 'model-issuer', scope?.contextKey, scope?.poloId, scope?.environment, scope?.month],
    enabled: isNfseScopeValid(scope), retry: false, staleTime: 30_000, gcTime: 0,
    refetchOnWindowFocus: true, refetchOnReconnect: true, queryFn: ({ signal }) => {
      if (!scope) throw new NfseAccessError();
      return nfseModelIssuerService.get(scope, signal);
    } });
}
