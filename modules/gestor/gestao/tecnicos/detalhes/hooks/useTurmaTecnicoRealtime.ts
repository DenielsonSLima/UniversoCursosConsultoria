import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { gestaoQueryKeys } from '../../../gestao.query-keys';

export const useTurmaTecnicoRealtime = (turmaId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!turmaId) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshFinanceiro = false;
    const turmaKeys = [
      academicLifecycleKeys.turma(turmaId),
      academicLifecycleKeys.grade(turmaId),
      academicLifecycleKeys.diarios(turmaId),
      ['turma_financeiro_config', turmaId] as const,
      ['turma-financeiro', turmaId] as const,
      ['financeiro-alunos', turmaId] as const,
      ['diario-alunos', turmaId] as const,
    ];

    const scheduleRefresh = (financeiro = false) => {
      refreshFinanceiro ||= financeiro;
      turmaKeys.forEach((queryKey) => {
        void queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
      });
      if (financeiro) {
        void queryClient.invalidateQueries({ queryKey: ['financeiro-tecnico-recebiveis'], refetchType: 'none' });
        void queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'], refetchType: 'none' });
      }
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        turmaKeys.forEach((queryKey) => {
          void queryClient.refetchQueries({ queryKey, type: 'active', stale: true });
        });
        if (refreshFinanceiro) {
          void queryClient.refetchQueries({ queryKey: ['financeiro-tecnico-recebiveis'], type: 'active', stale: true });
          void queryClient.refetchQueries({ queryKey: ['financeiro-aluno-receivables'], type: 'active', stale: true });
        }
        refreshFinanceiro = false;
      }, 300);
    };

    const scheduleGradeRefresh = () => {
      void queryClient.invalidateQueries({
        queryKey: gestaoQueryKeys.classesByModality('TECNICO'),
        refetchType: 'none',
      });
      scheduleRefresh();
    };

    const channel = supabase
      .channel(`turma-tecnico-${turmaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turmas_disciplinas', filter: `turma_id=eq.${turmaId}` },
        scheduleGradeRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aulas_turma', filter: `turma_id=eq.${turmaId}` },
        scheduleGradeRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'diario_frequencia', filter: `turma_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'diario_notas', filter: `turma_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atividades_extra_classe', filter: `turma_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gestao_realtime_events', filter: `turma_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_receber', filter: `turma_id=eq.${turmaId}` },
        () => scheduleRefresh(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matricula_movimentacoes', filter: `turma_origem_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matricula_movimentacoes', filter: `turma_destino_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transferencias_academicas', filter: `turma_origem_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transferencias_academicas', filter: `turma_destino_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [queryClient, turmaId]);
};
