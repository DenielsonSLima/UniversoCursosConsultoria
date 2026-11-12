import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isNfseScopeValid } from '../types/nfse.scope';
import type { NfseScope } from '../types/nfse.types';
import { NfseAccessError } from '../services/nfse.errors';
import { nfseQueueKeys, type NfseQueueInput } from './nfse-queue.types';
import { nfseQueueService } from './nfse-queue.service';
import type { NfseQueueRemovalInput } from './nfse-queue-removal';
import { invalidateNfseCache } from '../queries/nfse-cache';

const required = (scope: NfseScope | null) => {
  if (!isNfseScopeValid(scope)) throw new NfseAccessError();
  return scope;
};

export function useNfseQueue(scope: NfseScope | null, page = 1) {
  return useQuery({ queryKey: nfseQueueKeys.list(scope, page), enabled: isNfseScopeValid(scope), retry: false,
    staleTime: 15_000, gcTime: 0, refetchOnWindowFocus: true, refetchOnReconnect: true,
    queryFn: ({ signal }) => nfseQueueService.list(required(scope), page, signal) });
}

export function usePrepareNfseQueue(scope: NfseScope | null) {
  const client = useQueryClient();
  return useMutation({ retry: false, mutationFn: async (input: NfseQueueInput) => {
    const captured = { ...required(scope) };
    return { result: await nfseQueueService.prepare(captured, input), scope: captured, paymentMonth: input.paymentMonth };
  }, onSuccess: ({ scope: captured }) => invalidateNfseCache(client, captured, 'operations') });
}

export function useRemoveNfseQueue(scope: NfseScope | null) {
  const client = useQueryClient();
  return useMutation({ retry: false, mutationFn: async (input: NfseQueueRemovalInput) => {
    const captured = { ...required(scope) };
    return { result: await nfseQueueService.remove(captured, input), scope: captured };
  }, onSuccess: ({ scope: captured }) => invalidateNfseCache(client, captured, 'operations'),
  onError: () => client.invalidateQueries({ queryKey: nfseQueueKeys.scope(scope) }) });
}
