import { useQuery } from '@tanstack/react-query';
import {
  financeiroService,
  ReceivablesSummaryFilters,
} from '../../financeiro.service';
import { CourseModality, financeiroQueryKeys } from '../../financeiro.queryKeys';

export function useModalidadeReceberQueries(
  modality: CourseModality,
  summaryFilters: ReceivablesSummaryFilters,
  poloId?: string | null
) {
  const receivablesQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesByModality(modality, poloId),
    queryFn: () => financeiroService.getReceivablesByModality(modality, poloId || undefined),
    enabled: Boolean(poloId),
    staleTime: 15_000,
  });

  const summaryQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesModalitySummary(modality, summaryFilters),
    queryFn: () => financeiroService.getReceivablesModalitySummary(modality, summaryFilters),
    enabled: Boolean(poloId),
    staleTime: 15_000,
  });

  return {
    receivablesQuery,
    summaryQuery,
  };
}
