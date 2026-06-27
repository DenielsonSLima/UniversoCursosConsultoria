import { useQuery } from '@tanstack/react-query';
import {
  financeiroService,
  ReceivablesSummaryFilters,
} from '../../financeiro.service';
import { CourseModality, financeiroQueryKeys } from '../../financeiro.queryKeys';

export function useModalidadeReceberQueries(
  modality: CourseModality,
  summaryFilters: ReceivablesSummaryFilters
) {
  const receivablesQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesByModality(modality),
    queryFn: () => financeiroService.getReceivablesByModality(modality),
    staleTime: 15_000,
  });

  const summaryQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesModalitySummary(modality, summaryFilters),
    queryFn: () => financeiroService.getReceivablesModalitySummary(modality, summaryFilters),
    staleTime: 15_000,
  });

  return {
    receivablesQuery,
    summaryQuery,
  };
}
