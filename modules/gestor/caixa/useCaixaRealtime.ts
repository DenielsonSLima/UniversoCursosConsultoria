import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { getCaixaRealtimeInvalidationScopes } from './caixa.realtime';
import { caixaQueryKeys } from './caixa.service';
import { caixaReportQueryKeys } from './report/caixa-report.service';

const DEBOUNCE_MS = 500;

export const useCaixaRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const pendingScopes = new Set<string>();
    let requiresBroadInvalidation = false;

    const invalidatePendingScopes = (refetchType: 'active' | 'none') => {
      if (requiresBroadInvalidation) {
        void queryClient.invalidateQueries({ queryKey: caixaQueryKeys.statements, refetchType });
        void queryClient.invalidateQueries({ queryKey: caixaReportQueryKeys.monthly, refetchType });
      } else {
        pendingScopes.forEach((scope) => {
          void queryClient.invalidateQueries({
            queryKey: caixaQueryKeys.statementsForPolo(scope),
            refetchType,
          });
          void queryClient.invalidateQueries({
            queryKey: caixaReportQueryKeys.monthlyForPolo(scope),
            refetchType,
          });
        });
      }

      pendingScopes.clear();
      requiresBroadInvalidation = false;
    };

    const invalidatePolos = () => {
      void queryClient.invalidateQueries({
        queryKey: caixaQueryKeys.polos,
        refetchType: 'active',
      });
    };

    const refresh = (payload: { new?: unknown }) => {
      const scopes = getCaixaRealtimeInvalidationScopes(payload);
      if (scopes === null) {
        requiresBroadInvalidation = true;
      } else {
        scopes.forEach((scope) => pendingScopes.add(scope));
      }

      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        invalidatePendingScopes('active');
      }, DEBOUNCE_MS);
    };

    const financeChannel = supabase
      .channel('caixa-prestacao-mensal-realtime')
      .on('postgres_changes', {
        // A tabela é append-only. DELETE representa somente a limpeza de
        // eventos antigos e não uma nova alteração financeira.
        event: 'INSERT',
        schema: 'public',
        table: 'finance_realtime_events',
      }, refresh)
      .subscribe();

    const polosChannel = supabase
      .channel('caixa-polos-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'polos',
      }, invalidatePolos)
      .subscribe();

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        invalidatePendingScopes('none');
      }
      void supabase.removeChannel(financeChannel);
      void supabase.removeChannel(polosChannel);
    };
  }, [queryClient]);
};
