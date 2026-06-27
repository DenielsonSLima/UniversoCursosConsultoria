import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';

export const useTurmaTecnicoRealtime = (turmaId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!turmaId) return;

    const invalidateTurma = () => {
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turmaId) });
      queryClient.invalidateQueries({ queryKey: ['turma_financeiro_config', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['turma-financeiro', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['financeiro-alunos', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['diario-alunos', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['gestao-kpis'] });
    };

    const invalidateFinanceiro = () => {
      invalidateTurma();
      queryClient.invalidateQueries({ queryKey: ['financeiro-tecnico-recebiveis'] });
      queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'] });
    };

    const channel = supabase
      .channel(`turma-tecnico-${turmaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turmas', filter: `id=eq.${turmaId}` },
        invalidateTurma,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matriculas', filter: `turma_id=eq.${turmaId}` },
        invalidateTurma,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_receber', filter: `turma_id=eq.${turmaId}` },
        invalidateFinanceiro,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matricula_movimentacoes', filter: `turma_origem_id=eq.${turmaId}` },
        invalidateTurma,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matricula_movimentacoes', filter: `turma_destino_id=eq.${turmaId}` },
        invalidateTurma,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transferencias_academicas', filter: `turma_origem_id=eq.${turmaId}` },
        invalidateTurma,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transferencias_academicas', filter: `turma_destino_id=eq.${turmaId}` },
        invalidateTurma,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, turmaId]);
};
