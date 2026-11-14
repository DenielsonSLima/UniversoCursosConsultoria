import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { portalRealtimeSignalFilter } from '../../shared/realtime/portal-realtime-signals';
import { createRealtimeInvalidationController } from '../../shared/realtime/realtime-invalidation';

export const useProfessorProfileRealtime = (professorId: string) => {
  const client = useQueryClient();
  useEffect(() => {
    if (!professorId) return undefined;
    const profile = createRealtimeInvalidationController({ invalidate: () => client.invalidateQueries({ queryKey: ['professor-perfil', professorId], exact: true }) });
    const signature = createRealtimeInvalidationController({ invalidate: () => client.invalidateQueries({ queryKey: ['signatures', 'professor', professorId], exact: true }) });
    const channel = supabase.channel(`professor-profile-${professorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parceiros', filter: `id=eq.${professorId}` }, profile.schedule)
      .on('postgres_changes', portalRealtimeSignalFilter(`portal:professor:${professorId}:assinaturas`), signature.schedule)
      .subscribe((status) => { profile.onChannelStatus(status); signature.onChannelStatus(status); });
    return () => { profile.dispose(); signature.dispose(); void supabase.removeChannel(channel); };
  }, [client, professorId]);
};
