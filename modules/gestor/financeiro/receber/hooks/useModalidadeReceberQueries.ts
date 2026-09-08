import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { receivablesReadQueryOptions } from '../../financeiro.receivables-request';
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
    ...receivablesReadQueryOptions,
    queryKey: financeiroQueryKeys.receivablesPageByModality(modality, filters),
    queryFn: ({ signal }) => financeiroService.getReceivablesPageByModality(modality, filters, signal),
    enabled: enabled && Boolean(filters.poloId) && !isGrouped,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const groupsQuery = useQuery({
    ...receivablesReadQueryOptions,
    queryKey: financeiroQueryKeys.receivablesGroupsByModality(modality, filters),
    queryFn: ({ signal }) => financeiroService.getReceivablesGroupsPageByModality(modality, filters, signal),
    enabled: enabled && Boolean(filters.poloId) && isGrouped,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const summaryQuery = useQuery({
    ...receivablesReadQueryOptions,
    queryKey: financeiroQueryKeys.receivablesModalitySummary(modality, summaryFilters),
    queryFn: ({ signal }) => financeiroService.getReceivablesModalitySummary(modality, summaryFilters, signal),
    enabled: enabled && Boolean(filters.poloId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const upcomingFilters = getUpcomingReceivablesFilters(summaryFilters);
  const upcomingSummaryQuery = useQuery({
    ...receivablesReadQueryOptions,
    queryKey: financeiroQueryKeys.receivablesModalitySummary(modality, upcomingFilters),
    queryFn: ({ signal }) => financeiroService.getReceivablesModalitySummary(modality, upcomingFilters, signal),
    enabled: enabled && Boolean(filters.poloId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const activeClassesQuery = useQuery({
    ...receivablesReadQueryOptions,
    queryKey: financeiroQueryKeys.receivablesActiveClassesByModality(modality, filters.poloId),
    queryFn: ({ signal }) => financeiroService.getActiveReceivablesClassesByModality(modality, filters.poloId, signal),
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
