import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';

export function useIntegracaoBancariaRealtime(queryClient: QueryClient) {
  useEffect(() => {
    const invalidateOverview = () => {
      queryClient.invalidateQueries({ queryKey: ['integracao_bancaria'] });
    };
    const channel = supabase
      .channel('integracao_bancaria_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_gateway_runtime_config' }, invalidateOverview)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_gateway_routes' }, invalidateOverview)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_gateway_credentials' }, invalidateOverview)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_gateway_issuer_config' }, invalidateOverview)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
