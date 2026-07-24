import { useEffect } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';

type FinanceRealtimeContext = {
  userId: string;
  poloId: string;
};

export const useSecretariaFinanceRealtime = (
  context: FinanceRealtimeContext,
  financeKey: QueryKey,
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const activePoloId = context.poloId && context.poloId !== 'todos'
      ? context.poloId
      : null;
    let refreshTimer: number | undefined;
    let receivablesChanged = false;
    let accountsChanged = false;
    const flush = () => {
      refreshTimer = undefined;
      if (receivablesChanged) {
        void queryClient.invalidateQueries({
          queryKey: [...financeKey, 'abertos'],
          refetchType: 'active',
        });
      }
      if (accountsChanged) {
        void queryClient.invalidateQueries({
          queryKey: [...financeKey, 'contas'],
          refetchType: 'active',
        });
      }
      receivablesChanged = false;
      accountsChanged = false;
    };
    const schedule = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(flush, 500);
    };
    let channel = supabase.channel(
      `secretaria_financeiro_${context.userId}_${activePoloId || 'todos'}`,
    );
    channel = channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'finance_realtime_events',
          ...(activePoloId ? { filter: `polo_id=eq.${activePoloId}` } : {}),
        },
        () => {
          receivablesChanged = true;
          schedule();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_bancarias' },
        () => {
          accountsChanged = true;
          schedule();
        },
      )
      .subscribe();

    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [context.poloId, context.userId, financeKey, queryClient]);
};
