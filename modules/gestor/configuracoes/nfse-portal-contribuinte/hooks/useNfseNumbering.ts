import { useQuery } from '@tanstack/react-query';
import type { NfseScope } from '../../../emissor-nfse/types/nfse.types';
import { isNfseScopeValid } from '../../../emissor-nfse/types/nfse.scope';
import { nfseMetadataKeys } from '../../../emissor-nfse/queries/nfse-cache';
import { nfseNumberingService } from '../services/nfse-numbering.service';
import type { NfseNumberingService } from '../services/nfse-numbering.contract';

export function useNfseNumbering(scope: NfseScope, service: NfseNumberingService = nfseNumberingService) {
  return useQuery({ queryKey: [...nfseMetadataKeys.numbering(scope), scope.month],
    enabled: isNfseScopeValid(scope), retry: false, staleTime: 15_000, gcTime: 0, refetchOnWindowFocus: true, refetchOnReconnect: true,
    queryFn: ({ signal }) => service.get(scope, signal) });
}
