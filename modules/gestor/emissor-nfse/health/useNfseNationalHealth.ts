import { useQuery } from '@tanstack/react-query';
import type { NfseScope } from '../types/nfse.types';
import { isNfseScopeValid } from '../types/nfse.scope';
import { parseNfseHealth } from './nfse-health.contract';

export function useNfseNationalHealth(scope: NfseScope | null) {
  return useQuery({
    queryKey: ['nfse', 'national-health', scope?.contextKey, scope?.poloId, scope?.environment, scope?.month],
    enabled: isNfseScopeValid(scope) && scope.environment === 'PRODUCAO',
    retry: false, staleTime: 30_000, gcTime: 0, refetchInterval: 60_000,
    refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true,
    queryFn: async ({ signal }) => {
      if (!scope || scope.environment !== 'PRODUCAO') throw new Error('Verificação indisponível.');
      const { supabase } = await import('../../../../lib/supabase');
      const { data, error } = await supabase.functions.invoke('nfse-national-health', { body: { scope }, signal });
      if (error) throw new Error('Verificação indisponível.');
      return parseNfseHealth(data, scope);
    },
  });
}
