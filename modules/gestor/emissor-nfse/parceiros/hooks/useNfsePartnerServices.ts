import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { isNfseScopeValid } from '../../types/nfse.scope';
import { NfseAccessError } from '../../services/nfse.errors';
import type { NfsePartnerServiceInput } from '../types/nfse-partner-services.types';
import { nfsePartnerServices } from '../services/nfse-partner-services.service';
import { nfsePartnerServicesKeys } from '../queries/nfse-partner-services.keys';

const required = (scope: NfseScope | null) => {
  if (!isNfseScopeValid(scope)) throw new NfseAccessError();
  return scope;
};
const queryOptions = { retry: false, staleTime: 15_000, gcTime: 0, refetchOnWindowFocus: true } as const;

export function useNfsePartnerServiceOptions(scope: NfseScope | null) {
  return useQuery({ ...queryOptions, queryKey: nfsePartnerServicesKeys.options(scope), enabled: isNfseScopeValid(scope),
    queryFn: ({ signal }) => nfsePartnerServices.options(required(scope), signal) });
}

export function useNfsePartnerServices(scope: NfseScope | null, page: number) {
  return useQuery({ ...queryOptions, queryKey: nfsePartnerServicesKeys.list(scope, page), enabled: isNfseScopeValid(scope),
    queryFn: ({ signal }) => nfsePartnerServices.list(required(scope), page, signal) });
}

export function useSaveNfsePartnerService(scope: NfseScope | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: NfsePartnerServiceInput) => {
      const captured = { ...required(scope) };
      return { result: await nfsePartnerServices.save(captured, input), scope: captured };
    },
    retry: false,
    onSuccess: ({ scope: captured }) => client.invalidateQueries({ queryKey: nfsePartnerServicesKeys.scope(captured) }),
  });
}
