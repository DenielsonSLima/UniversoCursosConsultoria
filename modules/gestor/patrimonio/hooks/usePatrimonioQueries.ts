import { useQuery } from '@tanstack/react-query';
import { patrimonioQueryKeys } from '../patrimonio.queryKeys';
import {
  patrimonioProductTypeQueryKeys,
  patrimonioProductTypesService,
} from '../patrimonio-product-types.service';
import { patrimonioService } from '../patrimonio.service';
import type { PatrimonioListFilters } from '../patrimonio.types';

export function usePatrimonioQueries(filters: PatrimonioListFilters) {
  const listQuery = useQuery({
    queryKey: patrimonioQueryKeys.list(filters),
    queryFn: () => patrimonioService.list(filters),
    enabled: Boolean(filters.poloId),
    staleTime: 20_000,
    gcTime: 5 * 60_000,
  });

  const productTypesQuery = useQuery({
    queryKey: patrimonioProductTypeQueryKeys.list(filters.poloId || null, true),
    queryFn: () => patrimonioProductTypesService.list(filters.poloId!, true),
    enabled: Boolean(filters.poloId),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  return { listQuery, productTypesQuery };
}
