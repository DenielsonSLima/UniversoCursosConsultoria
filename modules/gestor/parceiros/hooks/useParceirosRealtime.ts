import { useEffect } from 'react';
import { supabase } from '../../../../lib/supabase';

export const useParceirosRealtime = (invalidateParceiros: (changedId?: string) => void) => {
  useEffect(() => {
    const channel = supabase
      .channel('parceiros_realtime_global')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parceiros' },
        (payload) => {
          const changedId = (payload.new as any)?.id || (payload.old as any)?.id;
          invalidateParceiros(changedId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [invalidateParceiros]);
};
