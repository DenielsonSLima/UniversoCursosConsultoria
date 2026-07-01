import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parceirosService } from '../parceiros.service';

export const parceirosQueryKeys = {
  all: ['parceiros'] as const,
  list: (poloId?: string | null, includeGlobal?: boolean) => ['parceiros', 'todos', poloId || 'todos', includeGlobal ? 'global' : 'local'] as const,
  kpis: ['parceiros_kpis'] as const,
  detail: (id: string) => ['parceiro', id] as const,
  turmasDisponiveis: (poloId?: string | null) => ['turmas_disponiveis', poloId || 'todos'] as const,
  matriculas: ['matriculas'] as const,
};

export const useParceirosQueries = (
  showEnrollmentModalForAlunoId: string | null,
  scope: { poloId?: string | null; includeGlobal?: boolean } = {},
) => {
  const queryClient = useQueryClient();

  const parceirosQuery = useQuery<any[]>({
    queryKey: parceirosQueryKeys.list(scope.poloId, scope.includeGlobal),
    queryFn: () => parceirosService.getAll('todos', {
      poloId: scope.poloId || undefined,
      includeGlobal: scope.includeGlobal,
    }),
  });

  const turmasDisponiveisQuery = useQuery({
    queryKey: parceirosQueryKeys.turmasDisponiveis(scope.poloId),
    queryFn: () => parceirosService.getTurmasDisponiveis(scope.poloId || undefined),
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
