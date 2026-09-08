import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  financeiroService,
  ReceivablesPageFilters,
  ReceivablesSummaryFilters,
} from '../../financeiro.service';
import { CourseModality, financeiroQueryKeys } from '../../financeiro.queryKeys';
import { getUpcomingReceivablesFilters } from '../components/modalidade-receber/receivables-period';

export function useModalidadeReceberQueries(
  modality: CourseModality,
  filters: ReceivablesPageFilters,
  overviewFilters: ReceivablesSummaryFilters = filters,
  enabled = true,
) {
  const isGrouped = filters.groupMode !== 'none';
  const summaryFilters = {
    poloId: overviewFilters.poloId,
    turmaId: overviewFilters.turmaId,
    search: overviewFilters.search,
    dueStart: overviewFilters.dueStart,
    dueEnd: overviewFilters.dueEnd,
  };

  const receivablesQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesPageByModality(modality, filters),
    queryFn: () => financeiroService.getReceivablesPageByModality(modality, filters),
    enabled: enabled && Boolean(filters.poloId) && !isGrouped,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const groupsQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesGroupsByModality(modality, filters),
    queryFn: () => financeiroService.getReceivablesGroupsPageByModality(modality, filters),
    enabled: enabled && Boolean(filters.poloId) && isGrouped,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const summaryQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesModalitySummary(modality, summaryFilters),
    queryFn: () => financeiroService.getReceivablesModalitySummary(modality, summaryFilters),
    enabled: enabled && Boolean(filters.poloId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const upcomingFilters = getUpcomingReceivablesFilters(summaryFilters);
  const upcomingSummaryQuery = useQuery({
    queryKey: financeiroQueryKeys.receivablesModalitySummary(modality, upcomingFilters),
    queryFn: () => financeiroService.getReceivablesModalitySummary(modality, upcomingFilters),
    enabled: enabled && Boolean(filters.poloId),
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
    upcomingSummaryQuery,
    activeClassesQuery,
  };
}
