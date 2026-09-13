import { useQuery, useQueryClient } from '@tanstack/react-query';
import { automaticProescCycleReviewOptions } from '../proesc-cycle-review.query';
import { reviewProescClassCycles } from '../proesc-cycle-review.service';

export const useAutomaticProescCycleReview = (turmaId: string, enabled: boolean) => {
  const queryClient = useQueryClient();
  return useQuery({
    ...automaticProescCycleReviewOptions(queryClient, turmaId, reviewProescClassCycles),
    enabled: enabled && Boolean(turmaId),
  });
};
