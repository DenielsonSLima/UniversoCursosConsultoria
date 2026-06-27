import { useQuery } from '@tanstack/react-query';
import {
  financeiroService,
  ReceivablesSummaryFilters,
} from '../../financeiro.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';

export function useOutrosCreditosQueries(summaryFilters: ReceivablesSummaryFilters) {
  const creditsQuery = useQuery({
    queryKey: financeiroQueryKeys.outrosCreditosList,
    queryFn: () => financeiroService.getOutrosCreditos(),
    staleTime: 15_000,
  });

  const summaryQuery = useQuery({
    queryKey: financeiroQueryKeys.outrosCreditosSummary(summaryFilters),
    queryFn: () => financeiroService.getOutrosCreditosSummary(summaryFilters),
    staleTime: 15_000,
  });

  return {
    creditsQuery,
    summaryQuery,
  };
}
