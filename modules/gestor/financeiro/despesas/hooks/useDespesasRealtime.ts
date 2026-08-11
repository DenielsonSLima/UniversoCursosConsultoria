// File: modules/gestor/financeiro/despesas/hooks/useDespesasRealtime.ts

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { despesasQueryKeys } from '../despesas.queryKeys';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { caixaQueryKeys } from '../../../caixa/caixa.service';

export function useDespesasRealtime(poloId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    let refreshTimer: number | undefined;
    let expensesChanged = false;
    let balancesChanged = false;

    const flush = () => {
      refreshTimer = undefined;
      if (expensesChanged) {
        void queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot });
        void queryClient.invalidateQueries({ queryKey: despesasQueryKeys.summaryRoot });
        void queryClient.invalidateQueries({ queryKey: despesasQueryKeys.groupSummaryRoot });
      }
      if (balancesChanged) {
        void queryClient.invalidateQueries({
          queryKey: financeiroQueryKeys.contasBancariasSaldos,
        });
        void queryClient.invalidateQueries({ queryKey: caixaQueryKeys.dashboards });
        void queryClient.invalidateQueries({ queryKey: caixaQueryKeys.custosOperacionais });
      }
      expensesChanged = false;
      balancesChanged = false;
    };

    const schedule = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(flush, 250);
    };

    const invalidateExpenseAndBalances = () => {
      expensesChanged = true;
      balancesChanged = true;
      schedule();
    };

    const activePoloId = poloId && poloId !== 'todos' ? poloId : null;
    const channel = supabase
      .channel(`despesas_lancamentos_realtime_${activePoloId || 'todos'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'despesas_lancamentos',
          ...(activePoloId ? { filter: `polo_id=eq.${activePoloId}` } : {}),
        },
        invalidateExpenseAndBalances,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'finance_realtime_events',
          ...(activePoloId ? { filter: `polo_id=eq.${activePoloId}` } : {}),
        },
        // Eventos de rateio chegam pelo polo econômico afetado. Eles também
        // mudam a lista e os totais de Contas a Pagar, não apenas o saldo.
        invalidateExpenseAndBalances,
      )
      .subscribe();

    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [poloId, queryClient]);
}
