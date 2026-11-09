import type { NfseScope } from '../../types/nfse.types';

const scopeKey = (scope: NfseScope | null) => ['nfse-partner-services', 'v1', scope?.contextKey ?? 'no-context',
  scope?.poloId ?? 'no-polo', scope?.environment ?? 'no-environment', scope?.month ?? 'no-month'] as const;

export const nfsePartnerServicesKeys = {
  scope: scopeKey,
  options: (scope: NfseScope | null) => [...scopeKey(scope), 'options'] as const,
  list: (scope: NfseScope | null, page: number) => [...scopeKey(scope), 'list', page] as const,
};
