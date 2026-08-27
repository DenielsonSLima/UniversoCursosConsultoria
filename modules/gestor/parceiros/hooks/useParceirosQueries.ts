import { useQuery } from '@tanstack/react-query';
import { alunosStatusService } from '../../alunos-status/alunos-status.service';
import { parceirosService } from '../parceiros.service';
import { parceirosQueryKeys } from '../parceiros.query-keys';

export const useParceirosQueries = (
  scope: {
    poloId?: string | null;
    includeGlobal?: boolean;
    enablePartners?: boolean;
    enableTurmas?: boolean;
  } = {},
) => {
  const parceirosQuery = useQuery<any[]>({
    queryKey: parceirosQueryKeys.list(scope.poloId, scope.includeGlobal),
    queryFn: () => parceirosService.getAll('todos', {
      poloId: scope.poloId || undefined,
      includeGlobal: scope.includeGlobal,
    }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
    enabled: scope.enablePartners !== false,
  });

  const turmasDisponiveisQuery = useQuery({
    queryKey: parceirosQueryKeys.turmasDisponiveis(scope.poloId),
    queryFn: () => parceirosService.getTurmasDisponiveis(scope.poloId || undefined),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
    enabled: scope.enableTurmas !== false,
  });

  const kpisQuery = useQuery({
    queryKey: parceirosQueryKeys.kpis(scope.poloId, scope.includeGlobal),
    queryFn: () => alunosStatusService.getKpis({
      poloId: scope.poloId,
      includeGlobal: scope.includeGlobal,
      consumer: 'PARCEIROS',
    }),
    staleTime: 60_000,
    enabled: scope.enablePartners !== false,
  });

  return {
    allPartners: parceirosQuery.data || [],
    loadingPartners: parceirosQuery.isLoading,
    turmasDisponiveis: turmasDisponiveisQuery.data || [],
    loadingTurmas: turmasDisponiveisQuery.isLoading,
    turmasError: turmasDisponiveisQuery.isError,
    reloadTurmas: turmasDisponiveisQuery.refetch,
    statusKpis: kpisQuery.data,
    loadingStatusKpis: kpisQuery.isLoading,
    statusKpisError: kpisQuery.isError,
  };
};
