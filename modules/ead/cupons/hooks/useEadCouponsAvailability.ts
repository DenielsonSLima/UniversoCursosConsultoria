import { useQuery } from '@tanstack/react-query';
import { isEadCouponsEnvironmentAllowed } from '../coupons-environment';
import { getEadCouponsAvailability, shouldRetryEadCouponsAvailability } from '../coupons-availability.service';

export const eadCouponsAvailabilityKey = (contextId: string) => ['ead-cupons', 'availability', contextId] as const;

/** Sem backend instalado/ativo, não oferece cupons. O servidor repete a guarda em toda mutação. */
export const useEadCouponsAvailability = (contextId: string, enabled = true): boolean => {
  const canCheck = enabled && Boolean(contextId) && isEadCouponsEnvironmentAllowed();
  const query = useQuery({
    queryKey: eadCouponsAvailabilityKey(contextId),
    enabled: canCheck,
    queryFn: ({ signal }) => getEadCouponsAvailability(signal),
    staleTime: 30_000,
    gcTime: 0,
    retry: shouldRetryEadCouponsAvailability,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  return canCheck && query.data === true && !query.isError;
};
