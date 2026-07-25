import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { documentosAlunoKeys } from './documentos-aluno.query-keys';

export const useDocumentosAlunoRealtime = (alunoId?: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!alunoId) return undefined;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: documentosAlunoKeys.aluno(alunoId) });
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documentos_aluno_versoes',
        },
        invalidate,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);
};
