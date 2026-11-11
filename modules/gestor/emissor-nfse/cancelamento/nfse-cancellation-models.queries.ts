import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NfseScope } from '../types/nfse.types';
import { isNfseScopeValid } from '../types/nfse.scope';
import { NfseAccessError } from '../services/nfse.errors';
import type { NfseCancellationModelInput, NfseCancellationModelsService } from './nfse-cancellation-models.contract';
import { nfseMetadataKeys } from '../queries/nfse-cache';
import { nfseCancellationModelsService } from './nfse-cancellation-models.service';
const key = nfseMetadataKeys.cancellationModels;
export function useNfseCancellationModels(scope: NfseScope | null, service: NfseCancellationModelsService = nfseCancellationModelsService) {
  return useQuery({ queryKey: [...key(scope), scope?.month], enabled: isNfseScopeValid(scope), retry: false, staleTime: 30_000, gcTime: 0, refetchOnWindowFocus: true, refetchOnReconnect: true,
    queryFn: ({ signal }) => { if (!scope) throw new NfseAccessError(); return service.list(scope, signal); } });
}
export function useSaveNfseCancellationModel(scope: NfseScope, service: NfseCancellationModelsService = nfseCancellationModelsService) {
  const client = useQueryClient();
  return useMutation({ retry: false, mutationFn: async (input: NfseCancellationModelInput) => {
    if (!isNfseScopeValid(scope)) throw new NfseAccessError();
    const captured = { ...scope }; return { model: await service.save(captured, input), scope: captured };
  }, onSuccess: ({ scope: captured }) => client.invalidateQueries({ queryKey: key(captured) }) });
}
