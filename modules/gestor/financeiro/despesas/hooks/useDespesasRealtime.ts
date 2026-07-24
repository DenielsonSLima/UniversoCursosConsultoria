// File: modules/gestor/financeiro/despesas/hooks/useDespesasRealtime.ts

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { despesasQueryKeys } from '../despesas.queryKeys';

export function useDespesasRealtime(poloId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot });
    };

    const activePoloId = poloId && poloId !== 'todos' ? poloId : null;
    const channel = supabase
      .channel(`despesas_lancamentos_realtime_${activePoloId || 'todos'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'despesas_lancamentos',
          ...(activePoloId ? { filter: `polo_id=eq.${activePoloId}` } : {}),
        },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poloId, queryClient]);
}
