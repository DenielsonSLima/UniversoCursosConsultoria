import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nfseModelsService } from '../services/nfse-models.service';
import { invalidateNfseCache } from '../../queries/nfse-cache';
import { nfseModelsKeys } from '../queries/nfse-models.keys';
import { NfseAccessError } from '../../services/nfse.errors';
import { isNfseScopeValid } from '../../types/nfse.scope';
import type { NfseModelActionInput, NfseModelInput, NfseScope } from '../../types/nfse.types';

export function useNfseModels(scope: NfseScope | null, enabled = true) {
  return useQuery({
    queryKey: nfseModelsKeys.list(scope), enabled: enabled && isNfseScopeValid(scope),
    retry: false, staleTime: 30_000, gcTime: 0, refetchOnWindowFocus: true, refetchOnReconnect: true,
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
    onSuccess: ({ scope: captured }) => invalidateNfseCache(client, captured, 'models'),
  });
}


export function useMutateNfseModel(scope: NfseScope | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: NfseModelActionInput) => {
      if (!isNfseScopeValid(scope)) throw new NfseAccessError();
      const captured = { ...scope };
      return { result: await nfseModelsService.mutate(captured, input), scope: captured };
    },
    retry: false,
    onSuccess: ({ scope: captured }) => invalidateNfseCache(client, captured, 'models'),
  });
}
