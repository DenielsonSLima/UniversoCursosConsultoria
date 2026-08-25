import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import { createRealtimeInvalidationController } from '../../shared/realtime/realtime-invalidation';
import {
  portalRealtimeSignalFilter,
  portalRealtimeTopics,
} from '../../shared/realtime/portal-realtime-signals';
import { professorCalendarQueryKey } from './calendario-professor.queries';

export const useProfessorCalendarRealtime = (
  professorId: string,
  poloId: string,
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!professorId || !poloId) return undefined;

    const invalidation = createRealtimeInvalidationController({
      invalidate: () => queryClient.invalidateQueries({
        queryKey: professorCalendarQueryKey(professorId, poloId),
        exact: true,
      }),
    });

    const channel = supabase
      .channel(`professor_calendar_${professorId}_${poloId}`)
      .on(
        'postgres_changes',
        portalRealtimeSignalFilter(
          portalRealtimeTopics.professorCalendarGeneral(poloId),
        ),
        invalidation.schedule,
      )
      .on(
        'postgres_changes',
        portalRealtimeSignalFilter(
          portalRealtimeTopics.professorCalendarScoped(professorId, poloId),
        ),
        invalidation.schedule,
      )
      .on(
        'postgres_changes',
        portalRealtimeSignalFilter(
          portalRealtimeTopics.professorAcademic(professorId, poloId),
        ),
        invalidation.schedule,
      )
      .subscribe(invalidation.onChannelStatus);

    return () => {
      invalidation.dispose();
      void supabase.removeChannel(channel);
    };
  }, [poloId, professorId, queryClient]);
};
