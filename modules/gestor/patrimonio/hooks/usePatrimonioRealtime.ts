import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { patrimonioQueryKeys } from '../patrimonio.queryKeys';

interface PatrimonioRealtimePayload {
  new?: { polo_id?: unknown } | null;
  old?: { polo_id?: unknown } | null;
}

const getPoloIdFromPayload = (payload: PatrimonioRealtimePayload) => {
  const poloId = payload.new?.polo_id ?? payload.old?.polo_id;
  return typeof poloId === 'string' && poloId ? poloId : null;
};

const isPatrimonioListForPolo = (queryKey: readonly unknown[], poloId: string) => {
  if (queryKey[0] !== 'patrimonio' || queryKey[1] !== 'list') return false;

  const filters = queryKey[2];
  return (
    filters !== null
    && typeof filters === 'object'
    && 'poloId' in filters
    && filters.poloId === poloId
  );
};

export function usePatrimonioRealtime(poloId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const activePoloId = poloId && poloId !== 'todos' ? poloId : null;
    let refreshTimer: number | undefined;
    const pendingPoloIds = new Set<string>();

    const flush = () => {
      refreshTimer = undefined;
      const polosToRefresh = Array.from(pendingPoloIds);
      pendingPoloIds.clear();

      for (const poloToRefresh of polosToRefresh) {
        void queryClient.invalidateQueries({
          queryKey: patrimonioQueryKeys.listRoot,
          predicate: (query) => isPatrimonioListForPolo(query.queryKey, poloToRefresh),
        });
      }
    };

    const invalidate = (payload: PatrimonioRealtimePayload) => {
      const poloToRefresh = activePoloId || getPoloIdFromPayload(payload);
      if (!poloToRefresh) return;

      pendingPoloIds.add(poloToRefresh);
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(flush, 250);
    };

    const channel = supabase
      .channel(`patrimonios_realtime_${activePoloId || 'todos'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patrimonios',
          ...(activePoloId ? { filter: `polo_id=eq.${activePoloId}` } : {}),
        },
        invalidate,
      )
      .subscribe();

    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [poloId, queryClient]);
}
