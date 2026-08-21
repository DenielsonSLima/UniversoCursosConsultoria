import { useQuery } from '@tanstack/react-query';
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

  return {
    allPartners: parceirosQuery.data || [],
    loadingPartners: parceirosQuery.isLoading,
    turmasDisponiveis: turmasDisponiveisQuery.data || [],
    loadingTurmas: turmasDisponiveisQuery.isLoading,
    turmasError: turmasDisponiveisQuery.isError,
    reloadTurmas: turmasDisponiveisQuery.refetch,
  };
};
