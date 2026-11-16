// File: modules/gestor/financeiro/despesas/hooks/useDespesasQueries.ts

import { useQuery } from '@tanstack/react-query';
import { despesasService } from '../despesas.service';
import { despesasQueryKeys, DespesasFilters, type DespesaAgrupamento } from '../despesas.queryKeys';
import { getDespesasVencidas } from '../despesas-vencidas.service';

interface UseDespesasQueriesOptions {
  groupSummary?: boolean;
  groupBy?: DespesaAgrupamento;
}

export function useDespesasQueries(
  filters: DespesasFilters,
  options: UseDespesasQueriesOptions = {},
) {
  const overdue = filters.statusScope === 'vencidos';
  const overdueQuery = useQuery({
    queryKey: [...despesasQueryKeys.lancamentosList(filters), 'workspace', options.groupBy],
    queryFn: () => getDespesasVencidas(filters, options.groupBy),
    enabled: overdue && Boolean(filters.poloId), staleTime: 15_000,
  });
  const lancamentosQuery = useQuery({
    queryKey: despesasQueryKeys.lancamentosList(filters),
    queryFn: () => despesasService.getDespesas(filters),
    staleTime: 15_000,
    enabled: !overdue && Boolean(filters.poloId),
  });

  const summaryQuery = useQuery({
    queryKey: despesasQueryKeys.summaryList(filters),
    queryFn: () => despesasService.getDespesasSummary(filters),
    staleTime: 15_000,
    enabled: !overdue && Boolean(filters.poloId),
  });

  const groupSummaryQuery = useQuery({
    queryKey: despesasQueryKeys.groupSummaryList(filters, options.groupBy),
    queryFn: () => despesasService.getDespesasGroupSummary(filters, options.groupBy),
    enabled: !overdue && options.groupSummary === true && Boolean(filters.poloId),
    staleTime: 15_000,
  });

  if (overdue) return {
    lancamentosQuery: { ...overdueQuery, data: overdueQuery.data?.items },
    summaryQuery: { ...overdueQuery, data: overdueQuery.data?.summary },
    groupSummaryQuery: { ...overdueQuery, data: overdueQuery.data?.groups },
  };
  return {
    lancamentosQuery,
    summaryQuery,
    groupSummaryQuery,
  };
}
