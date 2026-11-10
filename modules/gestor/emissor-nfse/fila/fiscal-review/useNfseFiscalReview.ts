import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { nfseQueueKeys } from '../nfse-queue.types';
import { nfseFiscalReviewService } from './nfse-fiscal-review.service';
import type { NfseFiscalReviewService, SaveNfseFiscalReview } from './nfse-fiscal-review.types';

export const nfseFiscalReviewKeys = {
  scope: (scope: NfseScope) => ['nfse-fiscal-review', 'v1', scope.contextKey, scope.poloId, scope.environment, scope.month] as const,
  detail: (scope: NfseScope, documentId: string, modelId: string) =>
    [...nfseFiscalReviewKeys.scope(scope), documentId, modelId || 'current'] as const,
};

export function useNfseFiscalReview(scope: NfseScope, documentId: string, modelId: string,
  service: NfseFiscalReviewService = nfseFiscalReviewService) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: nfseFiscalReviewKeys.detail(scope, documentId, modelId),
    queryFn: ({ signal }) => service.get(scope, documentId, modelId || undefined, signal),
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
  const save = useMutation({ retry: false, mutationFn: (input: SaveNfseFiscalReview) => service.save({ ...scope }, documentId, input),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: nfseFiscalReviewKeys.scope(scope) }),
      client.invalidateQueries({ queryKey: nfseQueueKeys.scope(scope) }),
    ]) });
  return { query, save };
}
