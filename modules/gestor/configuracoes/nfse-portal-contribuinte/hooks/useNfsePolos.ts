import { useQuery } from '@tanstack/react-query';
import { nfseConfigQueryKeys } from '../queries/nfse-config.queryKeys';
import { nfsePolosService } from '../services/nfse-polos.service';

export function useNfsePolos(isMatriz: boolean, matrixPoloId: string, contextKey: string, authUserId: string) {
  return useQuery({
    queryKey: nfseConfigQueryKeys.polos(contextKey, matrixPoloId, authUserId),
    queryFn: ({ signal }) => nfsePolosService.list({ authUserId, contextId: contextKey }, signal),
    enabled: isMatriz && Boolean(authUserId && matrixPoloId && contextKey.trim()),
    retry: false,
    staleTime: 30_000,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });
}
