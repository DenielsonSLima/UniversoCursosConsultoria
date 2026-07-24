import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../../../lib/supabase';
import { diarioClasseKeys } from '../diario-classe.keys';

export const useDiarioRealtime = (turmaId: string, disciplinaId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const pendingKeys = new Map<string, readonly unknown[]>();
    const scheduleRefresh = (...queryKeys: (readonly unknown[])[]) => (payload: any) => {
      const row = Object.keys(payload.new || {}).length > 0 ? payload.new : payload.old;
      if (row?.disciplina_id && row.disciplina_id !== disciplinaId) return;
      queryKeys.forEach((queryKey) => {
        pendingKeys.set(JSON.stringify(queryKey), queryKey);
        void queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
      });
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        pendingKeys.forEach((queryKey) => {
          void queryClient.refetchQueries({ queryKey, exact: true, type: 'active', stale: true });
        });
        pendingKeys.clear();
      }, 250);
    };

    const channel = supabase
      .channel(`diario-${turmaId}-${disciplinaId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'aulas_turma',
          filter: `turma_id=eq.${turmaId}`,
        },
        scheduleRefresh(
          diarioClasseKeys.aulas(turmaId, disciplinaId),
          diarioClasseKeys.resultados(turmaId, disciplinaId),
          diarioClasseKeys.praticas(turmaId, disciplinaId),
        ),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diario_frequencia',
          filter: `turma_id=eq.${turmaId}`,
        },
        scheduleRefresh(
          diarioClasseKeys.frequencia(turmaId, disciplinaId),
          diarioClasseKeys.resultados(turmaId, disciplinaId),
        ),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diario_notas',
          filter: `turma_id=eq.${turmaId}`,
        },
        scheduleRefresh(diarioClasseKeys.resultados(turmaId, disciplinaId)),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'turmas_disciplinas',
          filter: `turma_id=eq.${turmaId}`,
        },
        scheduleRefresh(
          diarioClasseKeys.instruments(turmaId, disciplinaId),
          diarioClasseKeys.resultados(turmaId, disciplinaId),
        ),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diario_praticas',
          filter: `turma_id=eq.${turmaId}`,
        },
        scheduleRefresh(diarioClasseKeys.praticas(turmaId, disciplinaId)),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diario_observacoes',
          filter: `turma_id=eq.${turmaId}`,
        },
        scheduleRefresh(diarioClasseKeys.observacoes(turmaId, disciplinaId)),
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [turmaId, disciplinaId, queryClient]);
};
