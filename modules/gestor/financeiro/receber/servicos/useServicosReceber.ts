import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { useFinanceiroSharedQueries } from '../../hooks/useFinanceiroSharedQueries';
import { confirmFinancialPayment, type FinancialPaymentConfirmation } from '../../settlements/financial-payment.service';
import { receivablesReadQueryOptions } from '../../financeiro.receivables-request';
import { serviceReceivablesKeys, type ServiceReceivable, type ServiceStatusScope } from './servicos-receber.contract';
import { serviceReceivablesService } from './servicos-receber.service';
import { useToast } from '../../../components/ToastNotification';
import { paymentMoneyLabel } from '../../settlements/financial-payment.form';
import { getReceivablesPeriod, validateReceivablesPeriod, type ReceivablesPeriod } from '../components/modalidade-receber/receivables-period';

const PAGE_SIZE = 20;
const GROUP_ITEMS_PAGE_SIZE = 25;
export interface ServiceGroupItemsState {
  rows: ServiceReceivable[]; isLoading: boolean; isError: boolean; isPaused: boolean; isFetching: boolean; onRetry: () => void;
}
export function useServicosReceber(poloId?: string | null) {
  const [search, setSearch] = useState(''), [debouncedSearch, setDebouncedSearch] = useState('');
  const [period, setPeriod] = useState<ReceivablesPeriod>(() => getReceivablesPeriod());
  const { start: dueStart, end: dueEnd } = period;
  const [statusScope, setStatusScope] = useState<ServiceStatusScope>('PENDING');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupPages, setGroupPages] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1), [selected, setSelected] = useState<ServiceReceivable | null>(null);
  const [bolepixId, setBolepixId] = useState<string | null>(null);
  const client = useQueryClient(), feedback = useToast();
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const filters = useMemo(() => ({ poloId, search: debouncedSearch, dueStart, dueEnd, statusScope }), [poloId, debouncedSearch, dueStart, dueEnd, statusScope]);
  const summaryFilters = useMemo(() => ({ poloId, search: debouncedSearch, dueStart, dueEnd, statusScope: 'ALL' as const }), [poloId, debouncedSearch, dueStart, dueEnd]);
  const upcomingFilters = useMemo(() => ({ ...summaryFilters, statusScope: 'UPCOMING' as const }), [summaryFilters]);
  const periodError = validateReceivablesPeriod(period);
  const list = useQuery({ ...receivablesReadQueryOptions, queryKey: serviceReceivablesKeys.groups(filters, page, PAGE_SIZE),
    queryFn: ({ signal }) => serviceReceivablesService.groups(filters, page, PAGE_SIZE, signal), enabled: !periodError,
    staleTime: 15_000, refetchOnWindowFocus: true });
  const summary = useQuery({ ...receivablesReadQueryOptions, queryKey: serviceReceivablesKeys.summary(summaryFilters),
    queryFn: ({ signal }) => serviceReceivablesService.summary(summaryFilters, signal), enabled: !periodError, staleTime: 15_000 });
  const upcoming = useQuery({ ...receivablesReadQueryOptions, queryKey: serviceReceivablesKeys.summary(upcomingFilters),
    queryFn: ({ signal }) => serviceReceivablesService.summary(upcomingFilters, signal), enabled: !periodError, staleTime: 15_000 });
  const groups = list.data?.groups || [];
  const groupQueries = useQueries({ queries: groups.map(group => {
    const detailPage = groupPages[group.key] || 1;
    return { ...receivablesReadQueryOptions,
      queryKey: serviceReceivablesKeys.groupItems(filters, group.key, detailPage, GROUP_ITEMS_PAGE_SIZE),
      queryFn: ({ signal }: { signal: AbortSignal }) => serviceReceivablesService.groupItems(filters, group.key, detailPage, GROUP_ITEMS_PAGE_SIZE, signal),
      enabled: !periodError && expandedGroups.has(group.key), staleTime: 15_000 };
  }) });
  const groupItemsByKey = new Map<string, ServiceGroupItemsState>();
  groups.forEach((group, index) => {
    const query = groupQueries[index];
    groupItemsByKey.set(group.key, { rows: query?.data?.rows || [], isLoading: Boolean(query?.isLoading),
      isError: Boolean(query?.isError), isPaused: query?.fetchStatus === 'paused', isFetching: Boolean(query?.isFetching),
      onRetry: () => { void query?.refetch(); } });
  });
  const { accountsQuery } = useFinanceiroSharedQueries({ poloId, accounts: true, polos: false, partners: false });
  useEffect(() => { setPage(1); setSelected(null); setBolepixId(null); }, [poloId, debouncedSearch, dueStart, dueEnd, statusScope]);
  useEffect(() => { setExpandedGroups(new Set()); setGroupPages({}); }, [poloId, debouncedSearch, dueStart, dueEnd, statusScope, page]);
  useEffect(() => {
    if (list.data && page > Math.max(1, Math.ceil(list.data.totalItems / PAGE_SIZE))) setPage(Math.max(1, Math.ceil(list.data.totalItems / PAGE_SIZE)));
  }, [list.data, page]);
  useEffect(() => {
    const corrections = groups.flatMap((group, index) => {
      const query = groupQueries[index];
      const maxPage = Math.max(1, Math.ceil((query?.data?.totalItems ?? group.itemCount) / GROUP_ITEMS_PAGE_SIZE));
      return (groupPages[group.key] || 1) > maxPage ? [[group.key, maxPage] as const] : [];
    });
    if (corrections.length) setGroupPages(current => ({ ...current, ...Object.fromEntries(corrections) }));
    if (selected) {
      const current = groupQueries.flatMap(query => query.data?.rows || []).find(row => row.id === selected.id);
      if (current && current !== selected) setSelected(current);
    }
  }, [groups, groupPages, groupQueries, selected]);
  const selectionMissing = Boolean(selected && list.isSuccess && !list.isFetching && (
    !groups.some(group => group.key === selected.clienteId) || groups.some((group, index) => group.key === selected.clienteId
      && groupQueries[index]?.isSuccess && !groupQueries[index]?.isFetching
      && !groupQueries[index]?.data?.rows.some(row => row.id === selected.id))));
  const toggleGroup = (key: string) => setExpandedGroups(current => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next;
  });
  const changeGroupPage = (key: string, nextPage: number) => setGroupPages(current => ({ ...current, [key]: Math.max(1, nextPage) }));
  const clearFilters = () => { setSearch(''); setPeriod(getReceivablesPeriod()); setStatusScope('PENDING'); };

  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const scopedPolo = poloId && poloId !== 'todos' ? poloId : null;
    const refresh = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => {
        timer = undefined; if (disposed) return;
        const queryKey = serviceReceivablesKeys.scope(poloId), fetching = client.isFetching({ queryKey }) > 0;
        void client.invalidateQueries({ queryKey }).then(() => {
          // An event arriving during the initial read may be newer than its snapshot.
          if (!disposed && fetching) void client.invalidateQueries({ queryKey });
        });
      }, 150);
    };
    const channel = supabase.channel(`service-receivables:${scopedPolo || 'todos'}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'finance_realtime_events',
        ...(scopedPolo ? { filter: `polo_id=eq.${scopedPolo}` } : {}) }, payload => {
        const row = payload.new as Record<string, unknown>;
        if (row.source_table !== 'contas_receber' || (scopedPolo && row.polo_id && row.polo_id !== scopedPolo)) return;
        refresh();
      }).subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    const visible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', visible); void supabase.removeChannel(channel); };
  }, [client, poloId]);
  const invalidate = () => Promise.all([
    client.invalidateQueries({ queryKey: serviceReceivablesKeys.scope(poloId) }),
    client.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
    client.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
    client.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
    client.invalidateQueries({ queryKey: ['caixa'] }),
  ]);
  const payment = useMutation({ mutationFn: (payload: FinancialPaymentConfirmation) => confirmFinancialPayment('RECEIVABLE', payload.input, payload.fingerprint),
    retry: false, onSuccess: async result => {
      await invalidate(); setSelected(null);
      feedback.toast.success(result.preview.status === 'PAGO' ? 'Recebimento confirmado' : 'Recebimento parcial registrado',
        `Recebido: ${paymentMoneyLabel(result.preview.paymentAmount)}. Saldo restante: ${paymentMoneyLabel(result.preview.remainingAfter)}.`);
    }, onError: error => feedback.toast.error('Recebimento não confirmado', error.message) });
  return { ...feedback, poloId, search, setSearch, debouncedSearch, period, setPeriod, statusScope, setStatusScope,
    page, setPage, pageSize: PAGE_SIZE, list, summary, upcoming, periodError, accountsQuery, selected, setSelected,
    bolepixId, setBolepixId, payment, viewMode, setViewMode, groups, expandedGroups, groupPages,
    groupItemsByKey, groupItemsPageSize: GROUP_ITEMS_PAGE_SIZE, toggleGroup, changeGroupPage, clearFilters, selectionMissing };
}
