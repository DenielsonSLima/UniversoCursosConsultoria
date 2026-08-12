import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { relatoriosKeys } from '../relatorios.query-keys';
import {
  isRelatoriosFinanceiroRealtimeSource,
  isRelatoriosRealtimeSource,
} from '../relatorios.realtime';

interface UseRelatoriosRealtimeOptions {
  enabled: boolean;
  financeiroEnabled?: boolean;
  poloId?: string | null;
}

export const useRelatoriosRealtime = ({
  enabled,
  financeiroEnabled = false,
  poloId,
}: UseRelatoriosRealtimeOptions) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled && !financeiroEnabled) return;

    let academicRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    let financialRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    let hasAcademicSubscription = false;
    let hasFinancialSubscription = false;
    let disposed = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    const markAcademicReportsStale = () => {
      void queryClient.invalidateQueries({
        queryKey: relatoriosKeys.matriculas.all(),
        refetchType: 'none',
      });
      void queryClient.invalidateQueries({
        queryKey: relatoriosKeys.censo.matriculaInicial(),
        refetchType: 'none',
      });

      if (academicRefreshTimer) clearTimeout(academicRefreshTimer);
      academicRefreshTimer = setTimeout(() => {
        if (disposed) return;
        void queryClient.refetchQueries({
          queryKey: relatoriosKeys.matriculas.all(),
          type: 'active',
          stale: true,
        });
        void queryClient.refetchQueries({
          queryKey: relatoriosKeys.censo.matriculaInicial(),
          type: 'active',
          stale: true,
        });
      }, 400);
    };

    const markFinancialReportsStale = () => {
      void queryClient.invalidateQueries({
        queryKey: relatoriosKeys.financeiro.all(),
        refetchType: 'none',
      });

      if (financialRefreshTimer) clearTimeout(financialRefreshTimer);
      financialRefreshTimer = setTimeout(() => {
        if (disposed) return;
        void queryClient.refetchQueries({
          queryKey: relatoriosKeys.financeiro.all(),
          type: 'active',
          stale: true,
        });
      }, 400);
    };

    if (enabled) {
      const academicChannel = supabase
        .channel(`relatorios-realtime-${poloId || 'todos'}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'gestao_realtime_events',
            ...(poloId ? { filter: `polo_id=eq.${poloId}` } : {}),
          },
          (payload: any) => {
            if (isRelatoriosRealtimeSource(payload.new?.source_table)) {
              markAcademicReportsStale();
            }
          },
        )
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          if (hasAcademicSubscription) markAcademicReportsStale();
          hasAcademicSubscription = true;
        });

      channels.push(academicChannel);
    }

    if (financeiroEnabled) {
      const financialChannel = supabase
        .channel(`relatorios-financeiro-realtime-${poloId || 'todos'}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'finance_realtime_events',
            ...(poloId ? { filter: `polo_id=eq.${poloId}` } : {}),
          },
          (payload: any) => {
            if (isRelatoriosFinanceiroRealtimeSource(payload.new?.source_table)) {
              markFinancialReportsStale();
            }
          },
        )
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          if (hasFinancialSubscription) markFinancialReportsStale();
          hasFinancialSubscription = true;
        });

      channels.push(financialChannel);
    }

    return () => {
      disposed = true;
      if (academicRefreshTimer) clearTimeout(academicRefreshTimer);
      if (financialRefreshTimer) clearTimeout(financialRefreshTimer);
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [enabled, financeiroEnabled, poloId, queryClient]);
};
