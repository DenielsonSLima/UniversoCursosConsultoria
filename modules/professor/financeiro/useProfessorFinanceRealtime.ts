import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { createRealtimeInvalidationController } from '../../shared/realtime/realtime-invalidation';
import { portalRealtimeSignalFilter } from '../../shared/realtime/portal-realtime-signals';
import { professorFinanceiroKeys } from './financeiro.queries';

export function useProfessorFinanceRealtime(professorId: string, poloId: string) {
  const client = useQueryClient();
  useEffect(() => {
    if (!professorId || !poloId) return undefined;
    const invalidation = createRealtimeInvalidationController({ invalidate: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: professorFinanceiroKeys.lists(professorId, poloId) }),
        client.invalidateQueries({ queryKey: professorFinanceiroKeys.receipts(professorId, poloId) }),
      ]);
    } });
    const channel = supabase.channel(`professor-financial:${professorId}:${poloId}`)
      .on('postgres_changes', portalRealtimeSignalFilter(`portal:professor:${professorId}:polo:${poloId}:financeiro`), invalidation.schedule)
      .subscribe(invalidation.onChannelStatus);
    return () => { invalidation.dispose(); void supabase.removeChannel(channel); };
  }, [professorId, poloId, client]);
}
