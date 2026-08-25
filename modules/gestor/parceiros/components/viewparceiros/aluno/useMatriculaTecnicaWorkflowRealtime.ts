import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { createRealtimeInvalidationController } from '../../../../../shared/realtime/realtime-invalidation';
import {
  portalRealtimeSignalFilter,
  portalRealtimeTopics,
} from '../../../../../shared/realtime/portal-realtime-signals';
import { matriculaTecnicaWorkflowKeys } from '../../../../../shared/documentos-aluno/documentos-aluno.query-keys';

export const useMatriculaTecnicaWorkflowRealtime = (alunoId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!alunoId) return undefined;

    const invalidation = createRealtimeInvalidationController({
      delayMs: 200,
      invalidate: async () => {
        await Promise.all([
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
      },
    });

    const channel = supabase
      .channel(`matricula-tecnica-workflow:${alunoId}`)
      .on(
        'postgres_changes',
        portalRealtimeSignalFilter(portalRealtimeTopics.studentEnrollment(alunoId)),
        invalidation.schedule,
      )
      .subscribe(invalidation.onChannelStatus);

    return () => {
      invalidation.dispose();
      void supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);
};
