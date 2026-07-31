import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { financeiroQueryKeys } from '../../../financeiro/financeiro.queryKeys';
import { supabase } from '../../../../../lib/supabase';
import { dependenciasAcademicasKeys } from '../dependencias-academicas.keys';

export const useDependenciasAcademicasRealtime = (poloId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!poloId) return undefined;
    let timer: number | undefined;
    let financialChanged = false;

    const flush = () => {
      timer = undefined;
      if (financialChanged) {
        void queryClient.invalidateQueries({
          queryKey: dependenciasAcademicasKeys.workspace(poloId),
          refetchType: 'active',
        });
        void queryClient.invalidateQueries({
          queryKey: dependenciasAcademicasKeys.recebiveis(poloId),
          refetchType: 'active',
        });
        void queryClient.invalidateQueries({
          queryKey: financeiroQueryKeys.receivablesRoot,
          refetchType: 'active',
        });
        void queryClient.invalidateQueries({
          queryKey: financeiroQueryKeys.resumoKpis,
          refetchType: 'active',
        });
      }
      financialChanged = false;
    };

    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(flush, 450);
    };

    const channel = supabase
      .channel(`secretaria_dependencias_${poloId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_receber' },
        () => {
          financialChanged = true;
          schedule();
        },
      )
      .subscribe();

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [poloId, queryClient]);
};
