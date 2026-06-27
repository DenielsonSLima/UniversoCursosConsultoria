import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { eadTurmaKeys } from '../ead-turma.keys';

export const useTurmaEadRealtime = (turmaId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!turmaId) return;

    const invalidateTurma = () => {
      queryClient.invalidateQueries({ queryKey: eadTurmaKeys.turma(turmaId) });
    };

    const channel = supabase
      .channel(`gestao-ead-turma-${turmaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriculas', filter: `turma_id=eq.${turmaId}` }, invalidateTurma)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inscricoes_online', filter: `turma_id=eq.${turmaId}` }, invalidateTurma)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ead_aluno_progresso' }, invalidateTurma)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'certificados_academicos', filter: `turma_id=eq.${turmaId}` }, invalidateTurma)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, turmaId]);
};
