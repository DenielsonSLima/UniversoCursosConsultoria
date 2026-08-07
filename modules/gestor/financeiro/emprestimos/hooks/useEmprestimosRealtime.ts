import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { caixaQueryKeys } from '../../../caixa/caixa.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import {
  emprestimosFinanciamentoScopes,
  emprestimosQueryKeys,
} from '../emprestimos.queryKeys';
import { getEmprestimosRealtimeSubscription } from '../emprestimos.realtime';

const REALTIME_DEBOUNCE_MS = 250;

export function useEmprestimosRealtime(
  poloResponsavelId?: string | null,
  enabled = true,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const poloId = poloResponsavelId && poloResponsavelId !== 'todos' ? poloResponsavelId : '';
    if (!enabled || !poloId) return undefined;

    let refreshTimer: number | undefined;
    const invalidate = () => {
      refreshTimer = undefined;
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: emprestimosQueryKeys.list(poloId),
          refetchType: 'active',
        }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: caixaQueryKeys.dashboards }),
        ...emprestimosFinanciamentoScopes(poloId).map((scope) => (
          queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.financiamentoResumosForPolo(scope),
            refetchType: 'active',
          })
        )),
      ]);
    };
    const schedule = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(invalidate, REALTIME_DEBOUNCE_MS);
    };
    const subscription = getEmprestimosRealtimeSubscription(poloId);

    // As RPCs canônicas de criação e baixa sempre inserem/atualizam o contrato
    // pai. O campo legado `polo_matriz_id` é o polo responsável no SEM_RATEIO,
    // portanto o filtro continua específico e sem assinatura ampla.
    const channel = supabase
      .channel(`emprestimos_financeiros_realtime_${poloId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: subscription.table,
        filter: subscription.filter,
      }, schedule)
      .subscribe();

    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [enabled, poloResponsavelId, queryClient]);
}
