import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { useFinanceiroSharedQueries } from '../../hooks/useFinanceiroSharedQueries';
import { confirmFinancialPayment, type FinancialPaymentConfirmation } from '../../settlements/financial-payment.service';
import { receivablesReadQueryOptions } from '../../financeiro.receivables-request';
import { serviceReceivablesKeys, type ServiceReceivable, type ServiceStatusScope } from './servicos-receber.contract';
import { serviceReceivablesService } from './servicos-receber.service';
import { useToast } from '../../../components/ToastNotification';
import { paymentMoneyLabel } from '../../settlements/financial-payment.form';

const PAGE_SIZE = 20;
export function useServicosReceber(poloId?: string | null) {
  const [search, setSearch] = useState(''), [debouncedSearch, setDebouncedSearch] = useState('');
  const [dueStart, setDueStart] = useState(''), [dueEnd, setDueEnd] = useState('');
  const [statusScope, setStatusScope] = useState<ServiceStatusScope>('PENDING');
  const [page, setPage] = useState(1), [selected, setSelected] = useState<ServiceReceivable | null>(null);
  const [bolepixId, setBolepixId] = useState<string | null>(null);
  const client = useQueryClient(), feedback = useToast();
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const filters = useMemo(() => ({ poloId, search: debouncedSearch, dueStart, dueEnd, statusScope }), [poloId, debouncedSearch, dueStart, dueEnd, statusScope]);
  const periodError = Boolean(dueStart && dueEnd && dueStart > dueEnd);
  const list = useQuery({ ...receivablesReadQueryOptions, queryKey: serviceReceivablesKeys.page(filters, page, PAGE_SIZE),
    queryFn: ({ signal }) => serviceReceivablesService.page(filters, page, PAGE_SIZE, signal), enabled: !periodError,
    staleTime: 15_000, refetchOnWindowFocus: true });
  const summary = useQuery({ ...receivablesReadQueryOptions, queryKey: serviceReceivablesKeys.summary(filters),
    queryFn: ({ signal }) => serviceReceivablesService.summary(filters, signal), enabled: !periodError, staleTime: 15_000 });
  const { accountsQuery } = useFinanceiroSharedQueries({ poloId, accounts: true, polos: false, partners: false });
  useEffect(() => { setPage(1); setSelected(null); setBolepixId(null); }, [poloId, debouncedSearch, dueStart, dueEnd, statusScope]);
  useEffect(() => {
    if (list.data && page > Math.max(1, Math.ceil(list.data.totalItems / PAGE_SIZE))) setPage(Math.max(1, Math.ceil(list.data.totalItems / PAGE_SIZE)));
  }, [list.data, page]);

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
  return { ...feedback, search, setSearch, dueStart, setDueStart, dueEnd, setDueEnd, statusScope, setStatusScope,
    page, setPage, pageSize: PAGE_SIZE, list, summary, periodError, accountsQuery, selected, setSelected,
    bolepixId, setBolepixId, payment };
}
