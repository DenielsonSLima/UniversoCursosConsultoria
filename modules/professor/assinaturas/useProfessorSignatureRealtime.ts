import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { createRealtimeInvalidationController } from '../../shared/realtime/realtime-invalidation';
import { portalRealtimeSignalFilter } from '../../shared/realtime/portal-realtime-signals';

export function useProfessorSignatureRealtime(professorId: string | undefined, contextId: string) {
  const client = useQueryClient();
  useEffect(() => {
    if (!professorId || !contextId) return undefined;
    const invalidation = createRealtimeInvalidationController({ invalidate: () => client.invalidateQueries({
      predicate: (query) => query.queryKey[0] === 'assinatura-eletronica'
        && query.queryKey[3] === contextId
        && ['PROFESSOR', 'COORDENADOR'].includes(String(query.queryKey[2])),
    }) });
    const channel = supabase.channel(`professor-signatures:${professorId}:${contextId}`)
      .on('postgres_changes', portalRealtimeSignalFilter(`portal:professor:${professorId}:assinaturas`), invalidation.schedule)
      .subscribe(invalidation.onChannelStatus);
    return () => { invalidation.dispose(); void supabase.removeChannel(channel); };
  }, [client, professorId, contextId]);
}
