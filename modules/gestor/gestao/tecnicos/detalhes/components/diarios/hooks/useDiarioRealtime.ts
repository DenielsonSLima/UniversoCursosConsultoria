import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../../../lib/supabase';
import { diarioClasseKeys } from '../diario-classe.keys';

export const useDiarioRealtime = (turmaId: string, disciplinaId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`diario-${turmaId}-${disciplinaId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diario_frequencia',
          filter: `turma_id=eq.${turmaId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: diarioClasseKeys.frequencia(turmaId, disciplinaId) });
          queryClient.invalidateQueries({ queryKey: diarioClasseKeys.resultados(turmaId, disciplinaId) });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diario_notas',
          filter: `turma_id=eq.${turmaId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: diarioClasseKeys.resultados(turmaId, disciplinaId) });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diario_praticas',
          filter: `turma_id=eq.${turmaId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: diarioClasseKeys.praticas(turmaId, disciplinaId) });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diario_observacoes',
          filter: `turma_id=eq.${turmaId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: diarioClasseKeys.observacoes(turmaId, disciplinaId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [turmaId, disciplinaId, queryClient]);
};
