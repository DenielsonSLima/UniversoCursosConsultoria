import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { patrimonioQueryKeys } from '../patrimonio.queryKeys';
import { patrimonioService } from '../patrimonio.service';
import type { PatrimonioListFilters } from '../patrimonio.types';

export function usePatrimonioQueries(filters: PatrimonioListFilters) {
  const listQuery = useQuery({
    queryKey: patrimonioQueryKeys.list(filters),
    queryFn: () => patrimonioService.list(filters),
    enabled: Boolean(filters.poloId),
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  return { listQuery };
}
