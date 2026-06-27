// File: modules/gestor/financeiro/despesas/hooks/useDespesasQueries.ts

import { useQuery } from '@tanstack/react-query';
import { despesasService } from '../despesas.service';
import { despesasQueryKeys, DespesasFilters } from '../despesas.queryKeys';

export function useDespesasQueries(filters: DespesasFilters) {
  const lancamentosQuery = useQuery({
    queryKey: despesasQueryKeys.lancamentosList(filters),
    queryFn: () => despesasService.getDespesas(filters),
    staleTime: 15_000,
  });

  const summaryQuery = useQuery({
    queryKey: ['despesas', 'summary', filters],
    queryFn: () => despesasService.getDespesasSummary(filters),
    staleTime: 15_000,
  });

  return {
    lancamentosQuery,
    summaryQuery,
  };
}
