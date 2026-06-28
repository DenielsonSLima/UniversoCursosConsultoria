import { useEffect } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { alunoSecretariaKeys } from './secretaria-aluno.service';

export const useAlunoSecretariaRealtime = (
  alunoId: string,
  queryClient: QueryClient
) => {
  useEffect(() => {
    if (!alunoId) return;

    const channel = supabase
      .channel(`aluno_secretaria_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matriculas', filter: `aluno_id=eq.${alunoId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: alunoSecretariaKeys.matriculas(alunoId) });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'secretaria_solicitacoes', filter: `aluno_id=eq.${alunoId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: alunoSecretariaKeys.solicitacoes(alunoId) });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documentos_validacao', filter: `aluno_id=eq.${alunoId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['document-validation-code'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);
};
