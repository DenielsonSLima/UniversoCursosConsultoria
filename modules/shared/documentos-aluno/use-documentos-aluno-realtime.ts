import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import {
  documentosAlunoKeys,
  matriculaTecnicaWorkflowKeys,
} from './documentos-aluno.query-keys';

const REALTIME_INVALIDATION_DELAY_MS = 200;

export const useDocumentosAlunoRealtime = (alunoId?: string | null) => {
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
            queryKey: documentosAlunoKeys.aluno(alunoId),
          }),
          queryClient.invalidateQueries({
            queryKey: matriculaTecnicaWorkflowKeys.aluno(alunoId),
          }),
        ]);
      }, REALTIME_INVALIDATION_DELAY_MS);
    };

    const channel = supabase
      .channel(`documentos-aluno-v2:${alunoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documentos_aluno',
          filter: `aluno_id=eq.${alunoId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documentos_aluno_lotes',
          filter: `aluno_id=eq.${alunoId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documentos_aluno_arquivos',
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
