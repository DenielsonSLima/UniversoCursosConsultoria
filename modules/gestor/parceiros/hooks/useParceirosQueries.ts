import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parceirosService } from '../parceiros.service';

export const parceirosQueryKeys = {
  all: ['parceiros'] as const,
  list: ['parceiros', 'todos'] as const,
  kpis: ['parceiros_kpis'] as const,
  detail: (id: string) => ['parceiro', id] as const,
  turmasDisponiveis: ['turmas_disponiveis'] as const,
  matriculas: ['matriculas'] as const,
};

export const useParceirosQueries = (showEnrollmentModalForAlunoId: string | null) => {
  const queryClient = useQueryClient();

  const parceirosQuery = useQuery<any[]>({
    queryKey: parceirosQueryKeys.list,
    queryFn: () => parceirosService.getAll('todos'),
  });

  const turmasDisponiveisQuery = useQuery({
    queryKey: parceirosQueryKeys.turmasDisponiveis,
    queryFn: parceirosService.getTurmasDisponiveis,
    enabled: !!showEnrollmentModalForAlunoId,
  });

  const invalidateParceiros = useCallback((changedId?: string) => {
    queryClient.invalidateQueries({ queryKey: parceirosQueryKeys.all });
    queryClient.invalidateQueries({ queryKey: parceirosQueryKeys.kpis });

    if (changedId) {
      queryClient.invalidateQueries({ queryKey: parceirosQueryKeys.detail(changedId) });
    }
  }, [queryClient]);

  return {
    allPartners: parceirosQuery.data || [],
    loadingPartners: parceirosQuery.isLoading,
    turmasDisponiveis: turmasDisponiveisQuery.data || [],
    invalidateParceiros,
  };
};
