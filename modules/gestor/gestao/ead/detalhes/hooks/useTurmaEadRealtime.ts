import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { eadTurmaKeys } from '../ead-turma.keys';
import type { EadAlunoTurma } from '../ead-turma.types';

export const useTurmaEadRealtime = (turmaId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!turmaId) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let connected = false;
    let disposed = false;
    const queryKeys = [
      eadTurmaKeys.turma(turmaId),
    ];
    const scheduleRefresh = () => {
      if (disposed) return;
      queryKeys.forEach((queryKey) => {
        void queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
      });
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        queryKeys.forEach((queryKey) => {
          void queryClient.refetchQueries({ queryKey, type: 'active', stale: true });
        });
      }, 300);
    };

    const refreshProgressIfCurrentTurma = (payload: any) => {
      const row = Object.keys(payload.new || {}).length > 0 ? payload.new : payload.old;
      const cachedStudents = queryClient.getQueryData<EadAlunoTurma[]>(eadTurmaKeys.alunos(turmaId));
      if (!cachedStudents || !row?.aluno_id || cachedStudents.some((student) => student.alunoId === row.aluno_id)) {
        scheduleRefresh();
      }
    };

    const channel = supabase
      .channel(`gestao-ead-turma-${turmaId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gestao_realtime_events', filter: `turma_id=eq.${turmaId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inscricoes_online', filter: `turma_id=eq.${turmaId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ead_aluno_progresso' }, refreshProgressIfCurrentTurma)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'certificados_academicos', filter: `turma_id=eq.${turmaId}` }, scheduleRefresh)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          if (connected) scheduleRefresh();
          connected = true;
        }
      });
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') scheduleRefresh(); };
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      supabase.removeChannel(channel);
    };
  }, [queryClient, turmaId]);
};
