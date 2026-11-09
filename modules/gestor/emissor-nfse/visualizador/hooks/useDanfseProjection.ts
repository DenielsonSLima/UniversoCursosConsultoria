import { useMutation } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { isNfseScopeValid } from '../../types/nfse.scope';
import { NfseAccessError } from '../../services/nfse.errors';
import type { DanfseComponents } from '../danfse.projection';
import { getDanfseProjection } from '../services/danfse-projection.service';

export function useDanfseProjection(scope: NfseScope | null) {
  return useMutation({
    mutationKey: ['nfse', 'danfse-projection', scope?.contextKey, scope?.poloId, scope?.environment],
    gcTime: 0, retry: false,
    mutationFn: ({ components, signal }: { components: DanfseComponents; signal: AbortSignal }) => {
      if (!isNfseScopeValid(scope)) throw new NfseAccessError();
      return getDanfseProjection({ ...scope }, components, signal);
    },
  });
}
