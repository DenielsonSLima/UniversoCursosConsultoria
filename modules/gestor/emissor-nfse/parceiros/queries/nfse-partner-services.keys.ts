import { NFSE_PARTNER_SERVICE_FILTERS, type NfsePartnerServiceFilters } from '../types/nfse-partner-services.types';
import type { NfseScope } from '../../types/nfse.types';

const scopeKey = (scope: NfseScope | null) => ['nfse-partner-services', 'v1', scope?.contextKey ?? 'no-context',
  scope?.poloId ?? 'no-polo', scope?.environment ?? 'no-environment', scope?.month ?? 'no-month'] as const;

export const nfsePartnerServicesKeys = {
  scope: scopeKey,
  options: (scope: NfseScope | null) => [...scopeKey(scope), 'options'] as const,
  list: (scope: NfseScope | null, page: number, filters: NfsePartnerServiceFilters = NFSE_PARTNER_SERVICE_FILTERS) =>
    [...scopeKey(scope), 'list', page, filters.search.trim(), filters.dateFrom, filters.dateTo, filters.partnerType] as const,
};

