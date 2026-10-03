import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { renegociacoesQueryKeys } from '../renegociacoes.queryKeys';

const SOURCES = new Set(['contas_receber', 'receivable_renegotiation_agreements', 'receivable_renegotiation_events']);

export const useRenegociacoesRealtime = (poloId?: string | null, enabled = true) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    let timer: number | undefined;
    const scheduleRefresh = (payload: { new?: Record<string, unknown> }) => {
      const source = String(payload.new?.source_table || '');
      if (!SOURCES.has(source)) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: renegociacoesQueryKeys.all }),
          queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
        ]);
      }, 250);
    };
    const filter = poloId ? { filter: `polo_id=eq.${poloId}` } : {};
    const refresh = () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: renegociacoesQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
      ]);
    const channel = supabase
      .channel(`renegociacoes_${poloId || 'matriz'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'finance_realtime_events', ...filter },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh();
      });
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, poloId, queryClient]);
};
