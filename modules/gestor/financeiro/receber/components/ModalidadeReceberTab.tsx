import React, { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQueries } from '@tanstack/react-query';
import {
  financeiroService,
  isContaDisponivelNoPolo,
  type ReceivablesPageFilters,
  type ReceivablesSummaryFilters,
} from '../../financeiro.service';
import ToastNotification, { useToast } from '../../../components/ToastNotification';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { receivablesReadQueryOptions } from '../../financeiro.receivables-request';
import { ReceivablesQueryRecovery } from './modalidade-receber/ReceivablesQueryRecovery';
import { useFinanceiroRealtime } from '../../hooks/useFinanceiroRealtime';
import { useFinanceiroSharedQueries } from '../../hooks/useFinanceiroSharedQueries';
import { useModalidadeReceberQueries } from '../hooks/useModalidadeReceberQueries';
import { ModalidadeReceberOverlays } from './modalidade-receber/ModalidadeReceberOverlays';
import { ModalidadeReceberToolbar } from './modalidade-receber/ModalidadeReceberToolbar';
import {
  type ReceivableActionsContext,
} from './modalidade-receber/ReceivableItemPresentation';
import { ReceivablesList } from './modalidade-receber/ReceivablesList';
import type {
  GroupItemsState,
  ModalidadeReceberTabProps,
  ReceivableKpis,
  ReceivableStatusCounts,
  ViewMode,
} from './modalidade-receber/modalidade-receber.types';
import { useModalidadeReceberOperations } from './modalidade-receber/useModalidadeReceberOperations';
import { useModalidadeReceberReport } from './modalidade-receber/useModalidadeReceberReport';
import {
  getReceivablesPeriod,
  getReceivablesListScope,
  validateReceivablesPeriod,
  type ReceivablesScope,
} from './modalidade-receber/receivables-period';

const PAGE_SIZE = 20;
const GROUP_ITEMS_PAGE_SIZE = 25;

export const ModalidadeReceberTab: React.FC<ModalidadeReceberTabProps> = ({
  poloId,
  modality,
  title,
  description,
  icon,
  accentLabel,
}) => {
  const { toasts, removeToast, toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusScope, setStatusScope] = useState<ReceivablesScope>('pending');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const groupMode = 'student' as const;
  const [turmaId, setTurmaId] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupPages, setGroupPages] = useState<Record<string, number>>({});
  const [period, setPeriod] = useState(() => getReceivablesPeriod());
  const { start: dueStart, end: dueEnd } = period;
  const periodError = validateReceivablesPeriod(period);
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const operations = useModalidadeReceberOperations(toast);

  useFinanceiroRealtime(poloId);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const summaryFilters = useMemo<ReceivablesSummaryFilters>(() => ({
    poloId: poloId || undefined,
    turmaId: turmaId || undefined,
    search: debouncedSearch,
    dueStart,
    dueEnd,
  }), [debouncedSearch, dueEnd, dueStart, poloId, turmaId]);

  const pageFilters: ReceivablesPageFilters = {
    ...getReceivablesListScope(statusScope, summaryFilters),
    groupMode,
    page,
    pageSize: PAGE_SIZE,
  };

  const {
    groupsQuery,
    summaryQuery,
    upcomingSummaryQuery,
    activeClassesQuery,
  } = useModalidadeReceberQueries(modality, pageFilters, summaryFilters, !periodError);
  const { accountsQuery } = useFinanceiroSharedQueries({ accounts: true, polos: false, partners: false });
  const receivables = [];
  const groups = groupsQuery.data?.groups || [];
  const accounts = accountsQuery.data || [];
  const activeClasses = activeClassesQuery.data || [];
  const isLoading = groupsQuery.isLoading;
  const isPageFetching = groupsQuery.isFetching;

  const groupItemQueries = useQueries({
    queries: groups.map((group) => {
      const filters: ReceivablesPageFilters = {
        ...pageFilters,
        groupKey: group.key,
        page: groupPages[group.key] || 1,
        pageSize: GROUP_ITEMS_PAGE_SIZE,
      };
      return {
        ...receivablesReadQueryOptions,
        queryKey: financeiroQueryKeys.receivablesGroupItems(modality, filters),
        queryFn: ({ signal }: { signal: AbortSignal }) => financeiroService.getReceivablesPageByModality(modality, filters, signal),
        enabled: !periodError && expandedGroups.has(group.key),
        placeholderData: keepPreviousData,
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
      };
    }),
  });

  const groupItemsByKey = useMemo(() => {
    const result = new Map<string, GroupItemsState>();
    groups.forEach((group, index) => {
      const query = groupItemQueries[index];
      result.set(group.key, {
        rows: query?.data?.rows || [],
        isLoading: Boolean(query?.isLoading),
        isError: Boolean(query?.isError),
        isPaused: query?.fetchStatus === 'paused',
        isFetching: Boolean(query?.isFetching),
        onRetry: () => { void query?.refetch(); },
      });
    });
    return result;
  }, [groupItemQueries, groups]);

  const activeSettlementAccounts = useMemo(() => (
    accounts.filter((account) =>
      account.ativo !== false
      && isContaDisponivelNoPolo(account, operations.selected?.poloId)
    )
  ), [accounts, operations.selected?.poloId]);

  const readQueries = [groupsQuery, summaryQuery, upcomingSummaryQuery, activeClassesQuery];
  const failedQueries = readQueries.filter((query) => query.isError);
  const isReadPaused = readQueries.some((query) => query.fetchStatus === 'paused');

  const statusCounts: ReceivableStatusCounts = {
    pending: summaryQuery.data?.pendingCount || 0,
    received: summaryQuery.data?.receivedCount || 0,
    overdue: summaryQuery.data?.overdueCount || 0,
    canceled: summaryQuery.data?.canceledCount || 0,
    all: summaryQuery.data?.allCount || 0,
  };
  const reportSummary = statusScope === 'upcoming' ? upcomingSummaryQuery.data : summaryQuery.data;
  const kpis: ReceivableKpis = {
    total: reportSummary?.allValue || 0,
    recebido: reportSummary?.receivedValue || 0,
    aReceber: reportSummary?.pendingValue || 0,
    vencidos: reportSummary?.overdueCount || 0,
  };
  const totalItems = groupsQuery.data?.totalItems || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dueStart, dueEnd, statusScope, turmaId, modality, poloId]);

  useEffect(() => {
    setTurmaId('');
  }, [modality, poloId]);

  useEffect(() => {
    if (turmaId && activeClassesQuery.isSuccess && !activeClasses.some((turma) => turma.id === turmaId)) {
      setTurmaId('');
    }
  }, [activeClasses, activeClassesQuery.isSuccess, turmaId]);

  useEffect(() => {
    if (groupsQuery.isSuccess && !groupsQuery.isPlaceholderData && page > totalPages) setPage(totalPages);
  }, [groupsQuery.isSuccess, groupsQuery.isPlaceholderData, page, totalPages]);

  useEffect(() => {
    setExpandedGroups(new Set());
    setGroupPages({});
  }, [debouncedSearch, dueStart, dueEnd, statusScope, turmaId, modality, poloId, page]);

  const toggleGroup = (key: string) => {
    const willOpen = !expandedGroups.has(key);
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (willOpen) setGroupPages((pages) => ({ ...pages, [key]: pages[key] || 1 }));
  };

  const changeGroupPage = (key: string, nextPage: number) => {
    setGroupPages((current) => ({ ...current, [key]: Math.max(1, nextPage) }));
  };

  const report = useModalidadeReceberReport({
    modality,
    poloId,
    title,
    search,
    debouncedSearch,
    dueStart: pageFilters.dueStart || '',
    dueEnd: pageFilters.dueEnd || '',
    statusScope: pageFilters.statusScope,
    turmaId,
    turmaLabel: activeClasses.find((turma) => turma.id === turmaId)?.nome || '',
    kpis,
    statusCounts: {
      pending: reportSummary?.pendingCount || 0,
      received: reportSummary?.receivedCount || 0,
      overdue: reportSummary?.overdueCount || 0,
      canceled: reportSummary?.canceledCount || 0,
      all: reportSummary?.allCount || 0,
    },
    toast,
  });

  const receivableActions: ReceivableActionsContext = {
    baneseDetailsPending: operations.baneseDetailsMutation.isPending,
    baneseDetailsReceivableId: operations.baneseDetailsMutation.variables?.receivableId,
    refreshPending: operations.refreshMutation.isPending,
    syncPending: operations.syncMutation.isPending,
    onOpenPayment: operations.openPayment,
    onCopyInvoiceUrl: operations.copyInvoiceUrl,
    onOpenCharge: operations.openCharge,
    onRefresh: (receivableId) => operations.refreshMutation.mutate(receivableId),
    onSync: (receivableId) => operations.syncMutation.mutate(receivableId),
    onOpenPaidReceipt: operations.openPaidReceipt,
    onOpenReversal: operations.openReversal,
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <ModalidadeReceberOverlays operations={operations} settlementAccounts={activeSettlementAccounts} />
      <ModalidadeReceberToolbar
        modality={modality}
        title={title}
        description={description}
        icon={icon}
        accentLabel={accentLabel}
        summary={{
          data: summaryQuery.data,
          loading: summaryQuery.isPending || summaryQuery.isFetching || search.trim() !== debouncedSearch,
          error: summaryQuery.isError,
        }}
        upcoming={{
          data: upcomingSummaryQuery.data,
          loading: upcomingSummaryQuery.isPending || upcomingSummaryQuery.isFetching || search.trim() !== debouncedSearch,
          error: upcomingSummaryQuery.isError,
        }}
        period={period}
        periodError={periodError}
        statusCounts={statusCounts}
        statusScope={statusScope}
        search={search}
        turmaId={turmaId}
        turmas={activeClasses}
        turmasLoading={activeClassesQuery.isLoading}
        viewMode={viewMode}
        report={report}
        isLoading={isLoading}
        onStatusScopeChange={setStatusScope}
        onSearchChange={setSearch}
        onPeriodChange={setPeriod}
        onTurmaIdChange={setTurmaId}
        onViewModeChange={setViewMode}
        onClearFilters={() => {
          setSearch('');
          setPeriod(getReceivablesPeriod());
          setTurmaId('');
          setStatusScope('pending');
        }}
      />
      {!periodError && (failedQueries.length > 0 || isReadPaused) ? (
        <ReceivablesQueryRecovery
          offline={isReadPaused}
          retrying={failedQueries.some((query) => query.isFetching)}
          onRetry={() => { failedQueries.forEach((query) => { void query.refetch(); }); }}
        />
      ) : null}
      {!periodError && !((groupsQuery.isError || groupsQuery.fetchStatus === 'paused') && !groupsQuery.data) ? <ReceivablesList
        viewMode={viewMode}
        groupMode={groupMode}
        isLoading={isLoading}
        isPageFetching={isPageFetching}
        totalItems={totalItems}
        totalReceivables={groupsQuery.data?.totalReceivables || 0}
        page={page}
        pageSize={PAGE_SIZE}
        totalPages={totalPages}
        groupItemsPageSize={GROUP_ITEMS_PAGE_SIZE}
        receivables={receivables}
        groups={groups}
        groupItemsByKey={groupItemsByKey}
        expandedGroups={expandedGroups}
        groupPages={groupPages}
        actions={receivableActions}
        onToggleGroup={toggleGroup}
        onChangeGroupPage={changeGroupPage}
        onChangePage={setPage}
      /> : null}
    </div>
  );
};
