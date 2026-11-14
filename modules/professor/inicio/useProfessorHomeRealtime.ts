import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { professorDashboardKeys } from '../hooks/useProfessorDashboard';
import { createRealtimeInvalidationController } from '../../shared/realtime/realtime-invalidation';
import { portalRealtimeSignalFilter, portalRealtimeTopics } from '../../shared/realtime/portal-realtime-signals';

export const useProfessorHomeRealtime = (professorId: string, poloId?: string | null) => {
  const client = useQueryClient();
  useEffect(() => {
    if (!professorId || !poloId) return undefined;
    const invalidation = createRealtimeInvalidationController({ invalidate: () => client.invalidateQueries({ queryKey: professorDashboardKeys.professor(professorId, poloId), exact: true }) });
    const channel = supabase.channel(`professor-home-${professorId}-${poloId}`)
      .on('postgres_changes', portalRealtimeSignalFilter(portalRealtimeTopics.professorAcademic(professorId, poloId)), invalidation.schedule)
      .on('postgres_changes', portalRealtimeSignalFilter(portalRealtimeTopics.professorChats(professorId)), invalidation.schedule)
      .subscribe(invalidation.onChannelStatus);
    return () => { invalidation.dispose(); void supabase.removeChannel(channel); };
  }, [client, professorId, poloId]);
};
