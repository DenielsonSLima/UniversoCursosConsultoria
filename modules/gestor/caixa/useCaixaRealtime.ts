import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { caixaQueryKeys } from './caixa.service';

const DEBOUNCE_MS = 500;

export const useCaixaRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const invalidateStatements = (refetchType: 'active' | 'none') => {
      void queryClient.invalidateQueries({
        queryKey: caixaQueryKeys.statements,
        refetchType,
      });
    };

    const refresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        // Uma conta compartilhada afeta o consolidado, o polo de origem e o
        // total exibido nos demais polos. Invalidar pelo prefixo evita cache
        // divergente entre polos e competências.
        invalidateStatements('active');
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel('caixa-prestacao-mensal-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'finance_realtime_events',
      }, refresh)
      .subscribe();

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        invalidateStatements('none');
      }
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
