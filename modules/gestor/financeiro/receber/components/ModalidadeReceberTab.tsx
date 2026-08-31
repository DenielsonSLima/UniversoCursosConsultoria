import React, { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQueries } from '@tanstack/react-query';
import {
  financeiroService,
  isContaDisponivelNoPolo,
  type ReceivablesPageFilters,
} from '../../financeiro.service';
import ToastNotification, { useToast } from '../../../components/ToastNotification';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
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
  StatusScope,
  ViewMode,
} from './modalidade-receber/modalidade-receber.types';
import { useModalidadeReceberOperations } from './modalidade-receber/useModalidadeReceberOperations';
import { useModalidadeReceberReport } from './modalidade-receber/useModalidadeReceberReport';

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
  const [statusScope, setStatusScope] = useState<StatusScope>('pending');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const groupMode = 'student' as const;
  const [turmaId, setTurmaId] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupPages, setGroupPages] = useState<Record<string, number>>({});
  const [dueStart, setDueStart] = useState('');
  const [dueEnd, setDueEnd] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const operations = useModalidadeReceberOperations(toast);

  useFinanceiroRealtime(poloId);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const pageFilters = useMemo<ReceivablesPageFilters>(() => ({
    poloId: poloId || undefined,
    turmaId: turmaId || undefined,
    search: debouncedSearch,
    dueStart,
    dueEnd,
    statusScope,
    groupMode,
    page,
    pageSize: PAGE_SIZE,
  }), [debouncedSearch, dueEnd, dueStart, groupMode, page, poloId, statusScope, turmaId]);

  const {
    groupsQuery,
    summaryQuery,
    activeClassesQuery,
  } = useModalidadeReceberQueries(modality, pageFilters);
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
        queryKey: financeiroQueryKeys.receivablesGroupItems(modality, filters),
        queryFn: () => financeiroService.getReceivablesPageByModality(modality, filters),
        enabled: expandedGroups.has(group.key),
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

  const statusCounts: ReceivableStatusCounts = {
    pending: summaryQuery.data?.pendingCount || 0,
    received: summaryQuery.data?.receivedCount || 0,
    overdue: summaryQuery.data?.overdueCount || 0,
    canceled: summaryQuery.data?.canceledCount || 0,
    all: summaryQuery.data?.allCount || 0,
  };
  const kpis: ReceivableKpis = {
    total: summaryQuery.data?.allValue || 0,
    recebido: summaryQuery.data?.receivedValue || 0,
    aReceber: summaryQuery.data?.pendingValue || 0,
    vencidos: summaryQuery.data?.overdueCount || 0,
  };
  const totalItems = groupsQuery.data?.totalItems || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [search, dueStart, dueEnd, statusScope, turmaId, modality]);

  useEffect(() => {
    setTurmaId('');
  }, [modality, poloId]);

  useEffect(() => {
    if (turmaId && activeClassesQuery.isSuccess && !activeClasses.some((turma) => turma.id === turmaId)) {
      setTurmaId('');
    }
  }, [activeClasses, activeClassesQuery.isSuccess, turmaId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setExpandedGroups(new Set());
    setGroupPages({});
  }, [search, dueStart, dueEnd, statusScope, turmaId, modality, page]);

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
    dueStart,
    dueEnd,
    statusScope,
    turmaId,
    turmaLabel: activeClasses.find((turma) => turma.id === turmaId)?.nome || '',
    kpis,
    statusCounts,
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
    <div className="space-y-6 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <ModalidadeReceberOverlays operations={operations} settlementAccounts={activeSettlementAccounts} />
      <ModalidadeReceberToolbar
        modality={modality}
        title={title}
        description={description}
        icon={icon}
        accentLabel={accentLabel}
        kpis={kpis}
        statusCounts={statusCounts}
        statusScope={statusScope}
        search={search}
        dueStart={dueStart}
        dueEnd={dueEnd}
        turmaId={turmaId}
        turmas={activeClasses}
        turmasLoading={activeClassesQuery.isLoading}
        viewMode={viewMode}
        report={report}
        isLoading={isLoading}
        onStatusScopeChange={setStatusScope}
        onSearchChange={setSearch}
        onDueStartChange={setDueStart}
        onDueEndChange={setDueEnd}
        onTurmaIdChange={setTurmaId}
        onViewModeChange={setViewMode}
        onClearFilters={() => {
          setSearch('');
          setDueStart('');
          setDueEnd('');
          setTurmaId('');
        }}
      />
      <ReceivablesList
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
      />
    </div>
  );
};
