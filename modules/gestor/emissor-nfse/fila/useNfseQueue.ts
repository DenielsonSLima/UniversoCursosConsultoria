import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isNfseScopeValid } from '../types/nfse.scope';
import type { NfseScope } from '../types/nfse.types';
import { NfseAccessError } from '../services/nfse.errors';
import { nfseStudentKeys } from '../preparar/queries/nfse-students.keys';
import { nfseQueueKeys, type NfseQueueInput } from './nfse-queue.types';
import { nfseQueueService } from './nfse-queue.service';

const required = (scope: NfseScope | null) => {
  if (!isNfseScopeValid(scope)) throw new NfseAccessError();
  return scope;
};

export function useNfseQueue(scope: NfseScope | null, page = 1) {
  return useQuery({ queryKey: nfseQueueKeys.list(scope, page), enabled: isNfseScopeValid(scope), retry: false,
    staleTime: 15_000, gcTime: 0, refetchOnWindowFocus: true,
    queryFn: ({ signal }) => nfseQueueService.list(required(scope), page, signal) });
}

export function usePrepareNfseQueue(scope: NfseScope | null) {
  const client = useQueryClient();
  return useMutation({ retry: false, mutationFn: async (input: NfseQueueInput) => {
    const captured = { ...required(scope) };
    return { result: await nfseQueueService.prepare(captured, input), scope: captured, paymentMonth: input.paymentMonth };
  }, onSuccess: ({ scope: captured, paymentMonth }) => Promise.all([
    client.invalidateQueries({ queryKey: nfseQueueKeys.scope(captured) }),
    client.invalidateQueries({ queryKey: nfseStudentKeys.scope({ contextId: captured.contextKey,
      poloId: captured.poloId, paymentMonth }) }),
  ]) });
}
