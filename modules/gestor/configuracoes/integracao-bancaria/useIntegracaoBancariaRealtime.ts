import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';

export function useIntegracaoBancariaRealtime(queryClient: QueryClient) {
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidateOverview = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (disposed) return;
        const queryKey = ['integracao_bancaria'];
        const fetching = queryClient.isFetching({ queryKey }) > 0;
        void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false }).then(() => {
          // A snapshot started before subscribing may predate an event already received.
          if (!disposed && fetching) void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
        });
      }, 150);
    };
    const channel = supabase
      .channel('integracao_bancaria_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_gateway_runtime_config' }, invalidateOverview)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_gateway_routes' }, invalidateOverview)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_gateway_credentials' }, invalidateOverview)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_gateway_issuer_config' }, invalidateOverview)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') invalidateOverview();
      });

    const onVisible = () => { if (!document.hidden) invalidateOverview(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
