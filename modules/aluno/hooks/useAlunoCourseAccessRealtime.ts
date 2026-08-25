import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { createRealtimeInvalidationController } from '../../shared/realtime/realtime-invalidation';
import {
  portalRealtimeSignalFilter,
  portalRealtimeTopics,
} from '../../shared/realtime/portal-realtime-signals';
import { invalidateAlunoCourseAccessQueries } from '../shared/aluno-course-access.queries';

export const useAlunoCourseAccessRealtime = (
  alunoId: string,
  enabled: boolean,
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !alunoId) return undefined;

    const invalidation = createRealtimeInvalidationController({
      invalidate: () => invalidateAlunoCourseAccessQueries(queryClient, alunoId),
    });
    const channel = supabase
      .channel(`aluno_course_access_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        portalRealtimeSignalFilter(
          portalRealtimeTopics.studentCourseAccess(alunoId),
        ),
        invalidation.schedule,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'finance_realtime_events',
          filter: `aluno_id=eq.${alunoId}`,
        },
        invalidation.schedule,
      )
      .subscribe(invalidation.onChannelStatus);

    const refreshAfterResume = () => invalidation.schedule();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') invalidation.schedule();
    };
    window.addEventListener('focus', refreshAfterResume);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshAfterResume);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      invalidation.dispose();
      void supabase.removeChannel(channel);
    };
  }, [alunoId, enabled, queryClient]);
};
