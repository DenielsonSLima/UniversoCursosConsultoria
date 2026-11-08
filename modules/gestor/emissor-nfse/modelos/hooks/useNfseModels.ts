import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nfseModelsService } from '../services/nfse-models.service';
import { nfseModelsKeys } from '../queries/nfse-models.keys';
import { NfseAccessError } from '../../services/nfse.errors';
import { isNfseScopeValid } from '../../types/nfse.scope';
import type { NfseModelInput, NfseScope } from '../../types/nfse.types';

export function useNfseModels(scope: NfseScope | null, enabled = true) {
  return useQuery({
    queryKey: nfseModelsKeys.list(scope), enabled: enabled && isNfseScopeValid(scope),
    retry: false, staleTime: 30_000, gcTime: 0, refetchOnWindowFocus: false,
    queryFn: ({ signal }) => {
      if (!isNfseScopeValid(scope)) throw new NfseAccessError();
      return nfseModelsService.list(scope, signal);
    },
  });
}

export function useSaveNfseModel(scope: NfseScope | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: NfseModelInput) => {
      if (!isNfseScopeValid(scope)) throw new NfseAccessError();
      const captured = { ...scope };
      return { result: await nfseModelsService.save(captured, input), scope: captured };
    },
    retry: false,
    onSuccess: ({ scope: captured }) => client.invalidateQueries({ queryKey: nfseModelsKeys.scope(captured) }),
  });
}
