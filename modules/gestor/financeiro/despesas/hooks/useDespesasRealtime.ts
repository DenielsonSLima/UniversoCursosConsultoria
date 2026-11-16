// File: modules/gestor/financeiro/despesas/hooks/useDespesasRealtime.ts

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { despesasQueryKeys } from '../despesas.queryKeys';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { caixaQueryKeys } from '../../../caixa/caixa.service';
import { conveniosQueryKeys } from '../../convenios/convenios.queryKeys';

export function useDespesasRealtime(poloId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const activePoloId = poloId && poloId !== 'todos' ? poloId : null;
    let refreshTimer: number | undefined;
    let expensesChanged = false;
    let balancesChanged = false;
    let disposed = false;
    const expenseScope = (query: { queryKey: readonly unknown[] }) => {
      if (!activePoloId) return true;
      const filters = query.queryKey[query.queryKey[1] === 'lancamentos' ? 3 : 2];
      return Boolean(filters && typeof filters === 'object' && 'poloId' in filters
        && filters.poloId === activePoloId);
    };

    const flush = () => {
      refreshTimer = undefined;
      if (expensesChanged) {
        void queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot, predicate: expenseScope });
        void queryClient.invalidateQueries({ queryKey: despesasQueryKeys.summaryRoot, predicate: expenseScope });
        void queryClient.invalidateQueries({ queryKey: despesasQueryKeys.groupSummaryRoot, predicate: expenseScope });
        void queryClient.invalidateQueries({
          queryKey: activePoloId
            ? conveniosQueryKeys.listForPolo(activePoloId)
            : conveniosQueryKeys.lists,
        });
        void queryClient.invalidateQueries({
          queryKey: activePoloId
            ? conveniosQueryKeys.detailsForPolo(activePoloId)
            : conveniosQueryKeys.details,
        });
      }
      if (balancesChanged) {
        void queryClient.invalidateQueries({
          queryKey: financeiroQueryKeys.contasBancariasSaldos,
        });
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.statementsForPolo(activePoloId),
        });
        void queryClient.invalidateQueries({
          queryKey: caixaQueryKeys.custosOperacionaisForPolo(activePoloId),
        });
      }
      expensesChanged = false;
      balancesChanged = false;
    };

    const schedule = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(flush, 250);
    };

    const invalidateExpenseAndBalances = () => {
      if (disposed) return;
      expensesChanged = true;
      balancesChanged = true;
      schedule();
    };

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
      .subscribe(status => {
        // Reread after subscription and reconnection to recover missed events.
        if (status === 'SUBSCRIBED') invalidateExpenseAndBalances();
      });

    return () => {
      disposed = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [poloId, queryClient]);
}
