import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { gestorBanesePaymentService } from '../receber/banese/gestor-banese-payment.service';
import { getOtherCreditPayment, refreshOtherCreditPayment, shouldWatchOtherCredit } from './other-credit-payment.service';

export function useOtherCreditPayment(receivableId: string) {
  const queryClient = useQueryClient();
  const [startedAt, setStartedAt] = useState(Date.now);
  const [actionMessage, setActionMessage] = useState('');
  const queryKey = [...financeiroQueryKeys.outrosCreditosRoot, 'payment', receivableId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getOtherCreditPayment(receivableId, signal),
    staleTime: 0, gcTime: 0, retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false, refetchIntervalInBackground: false,
    refetchInterval: (current) => shouldWatchOtherCredit(
      current.state.data, current.state.status === 'error', startedAt, Date.now(),
    ) ? 15_000 : false,
  });
  const previousStatus = useRef<string | null>(null);
  const status = query.data?.payment.status;
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

  const refresh = useMutation({
    mutationFn: () => refreshOtherCreditPayment(receivableId),
    retry: false,
    onSuccess: async () => {
      setStartedAt(Date.now());
      setActionMessage('Situação consultada no banco.');
      await queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.outrosCreditosRoot });
    },
    onError: (error: Error) => setActionMessage(error.message || 'Não foi possível consultar o banco.'),
  });
  const document = useMutation({
    mutationFn: () => gestorBanesePaymentService.openBoletoPdfInNewTab(receivableId),
    retry: false,
    onError: (error: Error) => setActionMessage(error.message),
  });
  return { query, refresh, document, actionMessage, setActionMessage };
}
