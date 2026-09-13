import type { QueryClient } from '@tanstack/react-query';
import { matriculaTecnicaFinanceiroKeys } from './matricula-tecnica-financeiro.keys';

export interface ProescClassCycleReview {
  success: boolean;
  turmaId: string;
  reviewed: number;
  failed?: number;
}

export const automaticProescCycleReviewOptions = (
  queryClient: QueryClient,
  turmaId: string,
  review: (turmaId: string) => Promise<ProescClassCycleReview>,
) => ({
  queryKey: ['proesc-cycle-review', 'class', turmaId] as const,
  queryFn: async () => {
    const result = await review(turmaId);
    if (result.reviewed > 0) {
      await queryClient.invalidateQueries({
        queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId),
      });
    }
    if (!result.success) {
      throw new Error('A conferência automática não foi concluída para todos os alunos.');
    }
    return result;
  },
  staleTime: 5 * 60_000,
  gcTime: 5 * 60_000,
  retry: false as const,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
});
