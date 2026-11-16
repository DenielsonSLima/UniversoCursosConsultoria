// File: modules/gestor/financeiro/despesas/hooks/useDespesasQueries.ts

import { useQuery } from '@tanstack/react-query';
import { despesasService } from '../despesas.service';
import { despesasQueryKeys, DespesasFilters, type DespesaAgrupamento } from '../despesas.queryKeys';
import { getDespesasVencidas } from '../despesas-vencidas.service';
import { getDespesasWorkspace } from '../despesas-workspace.service';

interface UseDespesasQueriesOptions {
  groupSummary?: boolean;
  groupBy?: DespesaAgrupamento;
}

export function useDespesasQueries(
  filters: DespesasFilters,
  options: UseDespesasQueriesOptions = {},
) {
  const workspace = filters.tipo === 'DESPESA_FIXA' || filters.tipo === 'DESPESA_VARIAVEL';
  const bundled = workspace || filters.statusScope === 'vencidos';
  const agrupamento = options.groupSummary ? options.groupBy || 'categoria' : 'nenhum';
  const workspaceQuery = useQuery({
    queryKey: [...despesasQueryKeys.lancamentosList(filters), 'workspace', agrupamento],
    queryFn: () => workspace
      ? getDespesasWorkspace(filters, agrupamento)
      : getDespesasVencidas(filters, options.groupBy),
    enabled: bundled && Boolean(filters.poloId), staleTime: 15_000,
  });
  const lancamentosQuery = useQuery({
    queryKey: despesasQueryKeys.lancamentosList(filters),
    queryFn: () => despesasService.getDespesas(filters),
    staleTime: 15_000,
    enabled: !bundled && Boolean(filters.poloId),
  });

  const summaryQuery = useQuery({
    queryKey: despesasQueryKeys.summaryList(filters),
    queryFn: () => despesasService.getDespesasSummary(filters),
    staleTime: 15_000,
    enabled: !bundled && Boolean(filters.poloId),
  });

  const groupSummaryQuery = useQuery({
    queryKey: despesasQueryKeys.groupSummaryList(filters, options.groupBy),
    queryFn: () => despesasService.getDespesasGroupSummary(filters, options.groupBy),
    enabled: !bundled && options.groupSummary === true && Boolean(filters.poloId),
    staleTime: 15_000,
  });

  if (bundled) return {
    lancamentosQuery: { ...workspaceQuery, data: workspaceQuery.data?.items },
    summaryQuery: { ...workspaceQuery, data: workspaceQuery.data?.summary },
    groupSummaryQuery: { ...workspaceQuery, data: workspaceQuery.data?.groups },
  };
  return {
    lancamentosQuery,
    summaryQuery,
    groupSummaryQuery,
  };
}
