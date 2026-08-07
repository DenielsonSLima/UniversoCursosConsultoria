import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { dependenciasAcademicasKeys } from '../dependencias-academicas.keys';

const DEPENDENCY_ACADEMIC_SOURCES = new Set([
  'aulas_turma',
  'cursos',
  'diario_frequencia',
  'diario_notas',
  'matriculas',
  'parceiros',
  'turmas',
  'turmas_disciplinas',
]);

export const useDependenciasAcademicasRealtime = (poloId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!poloId) return undefined;
    let timer: number | undefined;
    let academicChanged = false;
    let financialChanged = false;
    let subscribedOnce = false;

    const flush = () => {
      timer = undefined;
      if (academicChanged || financialChanged) {
        void queryClient.invalidateQueries({
          queryKey: dependenciasAcademicasKeys.workspace(poloId),
          refetchType: 'active',
        });
      }
      if (academicChanged) {
        void queryClient.invalidateQueries({
          queryKey: dependenciasAcademicasKeys.ofertasRoot(poloId),
          refetchType: 'active',
        });
      }
      academicChanged = false;
      financialChanged = false;
    };

    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(flush, 450);
    };

    const markWorkspaceChanged = (payload?: { new?: Record<string, unknown> }) => {
      const source = payload?.new?.source_table;
      if (
        typeof source === 'string'
        && !DEPENDENCY_ACADEMIC_SOURCES.has(source)
      ) {
        return;
      }
      academicChanged = true;
      schedule();
    };

    const markFinancialChanged = () => {
      financialChanged = true;
      schedule();
    };

    const channel = supabase
      .channel(`secretaria_dependencias_${poloId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gestao_realtime_events',
          filter: `polo_id=eq.${poloId}`,
        },
        markWorkspaceChanged,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'finance_realtime_events',
          filter: `polo_id=eq.${poloId}`,
        },
        markFinancialChanged,
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (subscribedOnce) {
          academicChanged = true;
          schedule();
        }
        subscribedOnce = true;
      });

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [poloId, queryClient]);
};
