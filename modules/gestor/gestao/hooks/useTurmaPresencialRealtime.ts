import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { academicLifecycleKeys } from '../tecnicos/detalhes/academic-lifecycle.keys';

export type TurmaPresencialModalidade = 'LIVRE' | 'ESPECIALIZACAO';

interface UseTurmaPresencialRealtimeParams {
  turmaId: string;
  modalidade: TurmaPresencialModalidade;
  channelPrefix: string;
}

export function useTurmaPresencialRealtime({ turmaId, modalidade, channelPrefix }: UseTurmaPresencialRealtimeParams) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!turmaId) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshFinanceiro = false;
    const turmaKeys = [
      academicLifecycleKeys.turma(turmaId),
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

    const channel = supabase
      .channel(`${channelPrefix}-${turmaId}`)
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
  }, [channelPrefix, modalidade, queryClient, turmaId]);
}
