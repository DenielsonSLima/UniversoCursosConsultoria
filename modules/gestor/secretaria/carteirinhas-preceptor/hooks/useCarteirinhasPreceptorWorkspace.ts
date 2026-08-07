import { useQuery } from '@tanstack/react-query';
import { carteirinhasPreceptorKeys } from '../carteirinhas-preceptor.keys';
import { carteirinhasPreceptorService } from '../services/carteirinhas-preceptor.service';

export const useCarteirinhasPreceptorWorkspace = (poloId: string | null) => useQuery({
  queryKey: carteirinhasPreceptorKeys.workspace(poloId || 'sem-polo'),
  queryFn: () => carteirinhasPreceptorService.getWorkspace(poloId!),
  enabled: Boolean(poloId),
  staleTime: 30_000,
  gcTime: 10 * 60_000,
  retry: 1,
});
