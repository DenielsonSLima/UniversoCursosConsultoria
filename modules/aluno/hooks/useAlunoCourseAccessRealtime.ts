import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { invalidateAlunoCourseAccessQueries } from '../shared/aluno-course-access.queries';

export const useAlunoCourseAccessRealtime = (
  alunoId: string,
  enabled: boolean,
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !alunoId) return undefined;

    const invalidate = () => {
      invalidateAlunoCourseAccessQueries(queryClient, alunoId);
    };
    const channel = supabase
      .channel(`aluno_course_access_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matriculas',
          filter: `aluno_id=eq.${alunoId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'finance_realtime_events',
          filter: `aluno_id=eq.${alunoId}`,
        },
        invalidate,
      )
      .subscribe();

    const refreshAfterResume = () => invalidate();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') invalidate();
    };
    window.addEventListener('focus', refreshAfterResume);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshAfterResume);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [alunoId, enabled, queryClient]);
};
