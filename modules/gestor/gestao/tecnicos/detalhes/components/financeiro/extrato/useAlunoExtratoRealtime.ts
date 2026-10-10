import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../../../lib/supabase';

export const alunoExtratoQueryKey = (matriculaId: string) => (
  ['turma-financeiro-extrato-aluno', matriculaId] as const
);

export const useAlunoExtratoRealtime = (matriculaId: string) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!matriculaId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: alunoExtratoQueryKey(matriculaId),
          exact: true,
          refetchType: 'active',
        });
      }, 300);
    };
    const channel = supabase
      .channel(`turma-financeiro-extrato:${matriculaId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'contas_receber',
        filter: `matricula_id=eq.${matriculaId}`,
      }, refresh)
      .subscribe((status) => {
        // Also closes the gap between the initial query and subscription, and
        // reconciles changes missed while the connection was unavailable.
        if (status === 'SUBSCRIBED') refresh();
      });
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [matriculaId, queryClient]);
};
