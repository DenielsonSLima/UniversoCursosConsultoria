import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { matriculaTecnicaWorkflowKeys } from '../../../../../shared/documentos-aluno/documentos-aluno.query-keys';

const REALTIME_INVALIDATION_DELAY_MS = 200;

export const useMatriculaTecnicaWorkflowRealtime = (alunoId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!alunoId) return undefined;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let subscribedOnce = false;

    const invalidate = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: matriculaTecnicaWorkflowKeys.aluno(alunoId),
          }),
          queryClient.invalidateQueries({
            queryKey: ['parceiro', alunoId, 'matriculas'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['parceiro', alunoId, 'matricula-atual'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['matriculas', alunoId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['diario-alunos'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['diario-notas-resultados'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['academic-lifecycle'],
          }),
        ]);
      }, REALTIME_INVALIDATION_DELAY_MS);
    };

    const channel = supabase
      .channel(`matricula-tecnica-workflow:${alunoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matriculas',
          filter: `aluno_id=eq.${alunoId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matricula_liberacoes_diario',
          filter: `aluno_id=eq.${alunoId}`,
        },
        invalidate,
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (subscribedOnce) invalidate();
        subscribedOnce = true;
      });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      void supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);
};
