import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { gestorBanesePaymentService } from '../receber/banese/gestor-banese-payment.service';
import { checkOtherCreditPayment, getOtherCreditPayment, shouldWatchOtherCredit, watchOtherCreditPayment } from './other-credit-payment.service';
import { startPdvConfirmation } from './pdv-confirmation-loop';

export function useOtherCreditPayment(receivableId: string) {
  const queryClient = useQueryClient();
  const [startedAt] = useState(Date.now);
  const [actionMessage, setActionMessage] = useState('');
  const queryKey = [...financeiroQueryKeys.outrosCreditosRoot, 'payment', receivableId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getOtherCreditPayment(receivableId, signal),
    staleTime: 0, gcTime: 0, retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false, refetchIntervalInBackground: false,
    refetchInterval: (current) => shouldWatchOtherCredit(
      current.state.data, current.state.status === 'error', startedAt, Date.now(),
    ) ? 60_000 : false,
  });
  const previousStatus = useRef<string | null>(null);
  useEffect(() => watchOtherCreditPayment(receivableId, () => {
    void queryClient.invalidateQueries({ queryKey: [...financeiroQueryKeys.outrosCreditosRoot, 'payment', receivableId], exact: true });
  }), [receivableId, queryClient]);
  const status = query.data?.payment.status;
  const active = Boolean(status && ['PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO'].includes(status) && !query.isError);
  useEffect(() => {
    if (!active) return;
    let current = true;
    const key = [...financeiroQueryKeys.outrosCreditosRoot, 'payment', receivableId];
    const stop = startPdvConfirmation({
      active: () => globalThis.document.visibilityState === 'visible' && navigator.onLine,
      check: signal => checkOtherCreditPayment(receivableId, signal),
      onData: async data => {
        await queryClient.cancelQueries({ queryKey: key, exact: true });
        if (current) queryClient.setQueryData(key, data);
      },
    });
    return () => { current = false; stop(); };
  }, [receivableId, active, queryClient]);
  useEffect(() => {
    if (status && status !== previousStatus.current) {
      if (previousStatus.current) {
        void queryClient.invalidateQueries({
          queryKey: financeiroQueryKeys.outrosCreditosRoot,
          predicate: (current) => current.queryKey[2] !== 'payment',
        });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis });
        void queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos });
      }
      previousStatus.current = status;
    }
  }, [status, queryClient]);

  const document = useMutation({
    mutationFn: () => gestorBanesePaymentService.openBoletoPdfInNewTab(receivableId),
    retry: false,
    onError: (error: Error) => setActionMessage(error.message),
  });
  return { query, document, actionMessage, setActionMessage };
}
