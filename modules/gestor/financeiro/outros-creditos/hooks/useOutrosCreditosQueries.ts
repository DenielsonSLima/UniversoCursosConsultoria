import { useQuery } from '@tanstack/react-query';
import {
  financeiroService,
  ReceivablesSummaryFilters,
} from '../../financeiro.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';

export function useOutrosCreditosQueries(
  summaryFilters: ReceivablesSummaryFilters,
  poloId?: string | null
) {
  const creditsQuery = useQuery({
    queryKey: financeiroQueryKeys.outrosCreditosList(poloId),
    queryFn: () => financeiroService.getOutrosCreditos(poloId || undefined),
    enabled: true,
    staleTime: 15_000,
  });

  const summaryQuery = useQuery({
    queryKey: financeiroQueryKeys.outrosCreditosSummary(summaryFilters),
    queryFn: () => financeiroService.getOutrosCreditosSummary(summaryFilters),
    enabled: true,
    staleTime: 15_000,
  });

  return {
    creditsQuery,
    summaryQuery,
  };
}
