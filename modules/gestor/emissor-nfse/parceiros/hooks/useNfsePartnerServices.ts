import { applicationReadCachePolicy } from '../../../../../lib/query-cache-policy';
import type { NfsePartnerRemovalInput } from '../services/nfse-partner-list.contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { isNfseScopeValid } from '../../types/nfse.scope';
import { NfseAccessError } from '../../services/nfse.errors';
import { NFSE_PARTNER_SERVICE_FILTERS, type NfsePartnerServiceFilters, type NfsePartnerServiceInput } from '../types/nfse-partner-services.types';
import { nfsePartnerServices } from '../services/nfse-partner-services.service';
import { invalidateNfseCache } from '../../queries/nfse-cache';
import { nfsePartnerServicesKeys } from '../queries/nfse-partner-services.keys';

const required = (scope: NfseScope | null) => {
  if (!isNfseScopeValid(scope)) throw new NfseAccessError();
  return scope;
};
const queryOptions = { ...applicationReadCachePolicy, retry: false, refetchOnWindowFocus: true } as const;

export function useNfsePartnerServiceOptions(scope: NfseScope | null) {
  return useQuery({ ...queryOptions, queryKey: nfsePartnerServicesKeys.options(scope), enabled: isNfseScopeValid(scope),
    queryFn: ({ signal }) => nfsePartnerServices.options(required(scope), signal) });
}

export function useNfsePartnerServices(scope: NfseScope | null, page: number, filters: NfsePartnerServiceFilters = NFSE_PARTNER_SERVICE_FILTERS) {
  return useQuery({ ...queryOptions, queryKey: nfsePartnerServicesKeys.list(scope, page, filters), enabled: isNfseScopeValid(scope),
    queryFn: ({ signal }) => nfsePartnerServices.list(required(scope), page, signal, filters) });
}

export function useSaveNfsePartnerService(scope: NfseScope | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: NfsePartnerServiceInput) => {
      const captured = { ...required(scope) };
      return { result: await nfsePartnerServices.save(captured, input), scope: captured };
    },
    retry: false,
    onSuccess: ({ scope: captured }) => invalidateNfseCache(client, captured, 'services'),
  });
}


export function useRemoveNfsePartnerServices(scope: NfseScope | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: NfsePartnerRemovalInput) => {
      const captured = { ...required(scope) };
      return { result: await nfsePartnerServices.remove(captured, input), scope: captured };
    },
    retry: false,
    onSuccess: ({ scope: captured }) => invalidateNfseCache(client, captured, 'services'),
  });
}
