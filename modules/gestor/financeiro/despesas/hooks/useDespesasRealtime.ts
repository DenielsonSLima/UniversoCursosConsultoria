// File: modules/gestor/financeiro/despesas/hooks/useDespesasRealtime.ts

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { despesasQueryKeys } from '../despesas.queryKeys';

export function useDespesasRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot });
    };

    const channel = supabase
      .channel('despesas_lancamentos_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'despesas_lancamentos' },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
