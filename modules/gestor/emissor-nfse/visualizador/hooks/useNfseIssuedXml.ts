import { useQuery } from '@tanstack/react-query';
import { NfseAccessError } from '../../services/nfse.errors';
import { isNfseScopeValid } from '../../types/nfse.scope';
import type { NfseScope } from '../../types/nfse.types';
import type { IssuedNfseIdentity } from '../services/nfse-issued-xml.service-core';
import { readNfseIssuedXml } from '../services/nfse-issued-xml.service';

export function useNfseIssuedXml(scope: NfseScope | null, document: IssuedNfseIdentity) {
  return useQuery({
    queryKey: ['nfse-issued-xml', scope?.contextKey, scope?.poloId, scope?.environment, scope?.month,
      document.id, document.accessKey, document.number],
    enabled: isNfseScopeValid(scope) && document.status === 'EMITIDA',
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false,
    queryFn: ({ signal }) => {
      if (!isNfseScopeValid(scope)) throw new NfseAccessError();
      return readNfseIssuedXml({ ...scope }, { ...document }, signal);
    },
  });
}
