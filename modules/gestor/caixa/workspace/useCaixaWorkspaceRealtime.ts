import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { getCaixaWorkspaceInvalidation } from './caixa-workspace.realtime';
import { caixaWorkspaceV2QueryKeys } from './caixa-workspace.queries';

const DEBOUNCE_MS = 500;

interface UseCaixaWorkspaceRealtimeOptions {
  enabled: boolean;
  empresaId: string;
  companyPoloIds: readonly string[];
}

export const useCaixaWorkspaceRealtime = ({
  enabled,
  empresaId,
  companyPoloIds,
}: UseCaixaWorkspaceRealtimeOptions) => {
  const queryClient = useQueryClient();
  const poloKey = [...companyPoloIds].sort().join(',');

  useEffect(() => {
    if (!enabled || !empresaId) return undefined;

    const companyPolos = new Set(poloKey ? poloKey.split(',') : []);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let broadInvalidation = false;
    let subscribedOnce = false;
    const pendingScopes = new Set<string | null>();

    const flush = (refetchType: 'active' | 'none') => {
      if (broadInvalidation) {
        void queryClient.invalidateQueries({
          queryKey: caixaWorkspaceV2QueryKeys.forCompany(empresaId),
          refetchType,
        });
      } else {
        pendingScopes.forEach((poloId) => {
          void queryClient.invalidateQueries({
            queryKey: caixaWorkspaceV2QueryKeys.forScope(empresaId, poloId),
            refetchType,
          });
        });
      }
      broadInvalidation = false;
      pendingScopes.clear();
    };

    const schedule = (payload: { new?: unknown }) => {
      const invalidation = getCaixaWorkspaceInvalidation(payload, companyPolos);
      if (invalidation.kind === 'IGNORE') return;
      if (invalidation.kind === 'COMPANY') broadInvalidation = true;
      invalidation.scopes.forEach((scope) => pendingScopes.add(scope));

      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        flush('active');
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`caixa-workspace-v2-${empresaId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'finance_realtime_events',
      }, schedule)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (!subscribedOnce) {
          subscribedOnce = true;
          return;
        }
        void queryClient.invalidateQueries({
          queryKey: caixaWorkspaceV2QueryKeys.forCompany(empresaId),
          refetchType: 'active',
        });
      });

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        flush('none');
      }
      void supabase.removeChannel(channel);
    };
  }, [enabled, empresaId, poloKey, queryClient]);
};
