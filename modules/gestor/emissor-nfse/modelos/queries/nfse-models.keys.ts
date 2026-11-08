import type { NfseScope } from '../../types/nfse.types';

const scopeKey = (scope: NfseScope | null) => [
  'nfse-models', 'v1', scope?.contextKey ?? 'no-context',
  scope?.poloId ?? 'no-polo', scope?.environment ?? 'no-environment',
] as const;

export const nfseModelsKeys = {
  scope: scopeKey,
  list: (scope: NfseScope | null) => [...scopeKey(scope), scope?.month ?? 'no-month'] as const,
};
