import { useQuery } from '@tanstack/react-query';
import { financeiroService, TransferenciasFilters } from '../../financeiro.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';

export function useTransferenciasQueries(filters: TransferenciasFilters) {
  const transferenciasQuery = useQuery({
    queryKey: financeiroQueryKeys.transferenciasList(filters),
    queryFn: () => financeiroService.getTransferencias(filters),
    staleTime: 15_000,
    enabled: Boolean(filters.poloId),
  });

  const summaryQuery = useQuery({
    queryKey: financeiroQueryKeys.transferenciasSummary(filters),
    queryFn: () => financeiroService.getTransferenciasSummary(filters),
    staleTime: 15_000,
    enabled: Boolean(filters.poloId),
  });

  return { transferenciasQuery, summaryQuery };
}
