import type { NfseCandidateFilters, NfseDocumentFilters, NfseScope } from '../types/nfse.types';

const scopeKey = (scope: NfseScope | null) => [
  'nfse', 'v1', scope?.contextKey ?? 'no-context', scope?.poloId ?? 'no-polo',
  scope?.environment ?? 'no-environment', scope?.month ?? 'no-month',
] as const;

export const nfseQueryKeys = {
  scope: scopeKey,
  workspace: (scope: NfseScope | null) => [...scopeKey(scope), 'workspace'] as const,
  candidates: (scope: NfseScope | null, filters: NfseCandidateFilters) => [
    ...scopeKey(scope), 'candidates', filters.classId ?? '', filters.modelId ?? '',
    filters.search?.trim() ?? '', filters.page ?? 1,
  ] as const,
  documents: (scope: NfseScope | null, filters: NfseDocumentFilters) => [
    ...scopeKey(scope), 'documents', filters.status, filters.search?.trim() ?? '', filters.page ?? 1,
    filters.dateFrom ?? '', filters.dateTo ?? '', filters.courseType ?? '', filters.origin ?? '',
    filters.issuedState ?? '',
  ] as const,
  models: (scope: NfseScope | null) => [...scopeKey(scope), 'models'] as const,
  configuration: (scope: NfseScope | null) => [...scopeKey(scope), 'configuration'] as const,
};
