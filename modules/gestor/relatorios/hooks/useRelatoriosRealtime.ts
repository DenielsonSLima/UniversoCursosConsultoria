import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { relatoriosKeys } from '../relatorios.query-keys';
import { isRelatoriosRealtimeSource } from '../relatorios.realtime';

interface UseRelatoriosRealtimeOptions {
  enabled: boolean;
  poloId?: string | null;
}

export const useRelatoriosRealtime = ({
  enabled,
  poloId,
}: UseRelatoriosRealtimeOptions) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let hasSubscribed = false;
    let disposed = false;

    const markReportsStale = () => {
      void queryClient.invalidateQueries({
        queryKey: relatoriosKeys.matriculas.all(),
        refetchType: 'none',
      });
      void queryClient.invalidateQueries({
        queryKey: relatoriosKeys.censo.matriculaInicial(),
        refetchType: 'none',
      });

      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
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

    let channel = supabase
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
            markReportsStale();
          }
        },
      );

    channel = channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (hasSubscribed) markReportsStale();
      hasSubscribed = true;
    });

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, poloId, queryClient]);
};
