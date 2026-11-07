import { useQuery } from '@tanstack/react-query';
import { nfseQueryKeys } from '../queries/nfse.queryKeys';
import { nfseService } from '../services/nfse.service';
import { NfseAccessError } from '../services/nfse.errors';
import { isNfseScopeValid } from '../types/nfse.scope';
import type { NfseCandidateFilters, NfseDocumentFilters, NfseScope } from '../types/nfse.types';

const required = (scope: NfseScope | null) => {
  if (!isNfseScopeValid(scope)) throw new NfseAccessError();
  return scope;
};
const options = { retry: false, staleTime: 30_000, gcTime: 0, refetchOnWindowFocus: false } as const;

export function useNfseWorkspace(scope: NfseScope | null) {
  return useQuery({
    ...options, queryKey: nfseQueryKeys.workspace(scope), enabled: isNfseScopeValid(scope),
    queryFn: ({ signal }) => nfseService.workspace(required(scope), signal),
  });
}

export function useNfseCandidates(scope: NfseScope | null, filters: NfseCandidateFilters, enabled = true) {
  return useQuery({
    ...options, queryKey: nfseQueryKeys.candidates(scope, filters), enabled: enabled && isNfseScopeValid(scope),
    queryFn: ({ signal }) => nfseService.candidates(required(scope), filters, signal),
  });
}

export function useNfseDocuments(scope: NfseScope | null, filters: NfseDocumentFilters, enabled = true) {
  return useQuery({
    ...options, queryKey: nfseQueryKeys.documents(scope, filters), enabled: enabled && isNfseScopeValid(scope),
    queryFn: ({ signal }) => nfseService.documents(required(scope), filters, signal),
  });
}

export function useNfseModels(scope: NfseScope | null, enabled = true) {
  return useQuery({
    ...options, queryKey: nfseQueryKeys.models(scope), enabled: enabled && isNfseScopeValid(scope),
    queryFn: ({ signal }) => nfseService.models(required(scope), signal),
  });
}

export function useNfseConfiguration(scope: NfseScope | null) {
  return useQuery({
    ...options, queryKey: nfseQueryKeys.configuration(scope), enabled: isNfseScopeValid(scope),
    queryFn: ({ signal }) => nfseService.configuration(required(scope), signal),
  });
}
