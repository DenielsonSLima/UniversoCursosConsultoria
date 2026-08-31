import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  financeiroService,
  ReceivablesPageFilters,
} from '../../financeiro.service';
import { CourseModality, financeiroQueryKeys } from '../../financeiro.queryKeys';

export function useModalidadeReceberQueries(
  modality: CourseModality,
  filters: ReceivablesPageFilters,
) {
  const isGrouped = filters.groupMode !== 'none';
  const summaryFilters = {
    poloId: filters.poloId,
    turmaId: filters.turmaId,
    search: filters.search,
    dueStart: filters.dueStart,
    dueEnd: filters.dueEnd,
  };

  const receivablesQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesPageByModality(modality, filters),
    queryFn: () => financeiroService.getReceivablesPageByModality(modality, filters),
    enabled: Boolean(filters.poloId) && !isGrouped,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const groupsQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesGroupsByModality(modality, filters),
    queryFn: () => financeiroService.getReceivablesGroupsPageByModality(modality, filters),
    enabled: Boolean(filters.poloId) && isGrouped,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const summaryQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesModalitySummary(modality, summaryFilters),
    queryFn: () => financeiroService.getReceivablesModalitySummary(modality, summaryFilters),
    enabled: Boolean(filters.poloId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const activeClassesQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesActiveClassesByModality(modality, filters.poloId),
    queryFn: () => financeiroService.getActiveReceivablesClassesByModality(modality, filters.poloId),
    enabled: Boolean(filters.poloId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  return {
    receivablesQuery,
    groupsQuery,
    summaryQuery,
    activeClassesQuery,
  };
}
