import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { gestaoQueryKeys } from '../gestao.query-keys';

export const useGestaoRealtime = (poloId?: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let refreshTimer: number | undefined;

    const refresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.summaries() }),
          queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.activeClassesRoot() }),
          queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classes() }),
        ]);
      }, 250);
    };

    const eventConfig: {
      event: '*';
      schema: 'public';
      table: 'gestao_realtime_events';
      filter?: string;
    } = {
      event: '*',
      schema: 'public',
      table: 'gestao_realtime_events',
    };
    if (poloId) eventConfig.filter = `polo_id=eq.${poloId}`;

    const channel = supabase
      .channel(`gestao-resumo-${poloId || 'global'}`)
      .on('postgres_changes', eventConfig, refresh)
      .subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [poloId, queryClient]);
};
