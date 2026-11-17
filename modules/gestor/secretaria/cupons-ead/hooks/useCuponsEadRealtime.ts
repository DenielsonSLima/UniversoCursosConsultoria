import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { isEadCouponsEnvironmentAllowed } from '../../../../ead/cupons/coupons-environment';
import { cuponsEadKeys } from '../cupons-ead.keys';

export function useCuponsEadRealtime(poloId: string, contextId: string, enabled: boolean) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled || !poloId || !isEadCouponsEnvironmentAllowed()) return undefined;
    let timer: number | undefined;
    let subscribed = false;
    const invalidate = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void client.invalidateQueries({ queryKey: cuponsEadKeys.scope(poloId, contextId), refetchType: 'active' });
      }, 200);
    };
    const channel = supabase.channel(`ead_coupons_management:${contextId}:${poloId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ead_coupons', filter: `polo_id=eq.${poloId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ead_coupon_events', filter: `polo_id=eq.${poloId}` }, invalidate)
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return;
        if (subscribed) invalidate();
        subscribed = true;
      });
    window.addEventListener('online', invalidate);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('online', invalidate);
      void supabase.removeChannel(channel);
    };
  }, [client, contextId, enabled, poloId]);
}
