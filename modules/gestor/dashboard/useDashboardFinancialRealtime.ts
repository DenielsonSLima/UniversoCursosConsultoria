import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { dashboardQueryKeys } from './dashboard.queries';

const FINANCIAL_SOURCES = new Set(['contas_pagar', 'despesas_lancamentos']);

export const useDashboardFinancialRealtime = (
  enabled: boolean,
  poloId: string,
  competencia: string,
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !poloId) return undefined;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = (payload: { new?: { source_table?: unknown } }) => {
      if (!FINANCIAL_SOURCES.has(String(payload.new?.source_table || ''))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void queryClient.invalidateQueries({
          queryKey: dashboardQueryKeys.financialRadar(poloId, competencia),
          refetchType: 'active',
        });
      }, 300);
    };

    const channel = supabase
      .channel(`dashboard_financial_radar_${poloId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'finance_realtime_events',
        filter: `polo_id=eq.${poloId}`,
      }, invalidate)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [competencia, enabled, poloId, queryClient]);
};
