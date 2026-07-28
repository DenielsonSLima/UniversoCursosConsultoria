// File: modules/gestor/financeiro/despesas/hooks/useDespesasQueries.ts

import { useQuery } from '@tanstack/react-query';
import { despesasService } from '../despesas.service';
import { despesasQueryKeys, DespesasFilters } from '../despesas.queryKeys';

interface UseDespesasQueriesOptions {
  groupSummary?: boolean;
}

export function useDespesasQueries(
  filters: DespesasFilters,
  options: UseDespesasQueriesOptions = {},
) {
  const lancamentosQuery = useQuery({
    queryKey: despesasQueryKeys.lancamentosList(filters),
    queryFn: () => despesasService.getDespesas(filters),
    staleTime: 15_000,
    enabled: Boolean(filters.poloId),
  });

  const summaryQuery = useQuery({
    queryKey: despesasQueryKeys.summaryList(filters),
    queryFn: () => despesasService.getDespesasSummary(filters),
    staleTime: 15_000,
    enabled: Boolean(filters.poloId),
  });

  const groupSummaryQuery = useQuery({
    queryKey: despesasQueryKeys.groupSummaryList(filters),
    queryFn: () => despesasService.getDespesasGroupSummary(filters),
    enabled: options.groupSummary === true && Boolean(filters.poloId),
    staleTime: 15_000,
  });

  return {
    lancamentosQuery,
    summaryQuery,
    groupSummaryQuery,
  };
}
