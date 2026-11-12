import type { NfseReceiptFilters, NfseReceiptScope } from '../types/nfse-students.types';

const authorityKey = (scope: Pick<NfseReceiptScope, 'contextId' | 'poloId' | 'environment'> | null) => [
  'nfse-receipt-students', 'v2', scope?.contextId ?? '', scope?.poloId ?? '', scope?.environment ?? '',
] as const;
const scopeKey = (scope: NfseReceiptScope | null) => [...authorityKey(scope), scope?.paymentMonth ?? ''] as const;

export const nfseStudentKeys = {
  authority: authorityKey,
  scope: scopeKey,
  groups: (scope: NfseReceiptScope | null, filters: NfseReceiptFilters) => [
    ...scopeKey(scope), 'groups', filters.courseType, filters.classId, filters.search.trim(), filters.page,
  ] as const,
  selection: (scope: NfseReceiptScope | null, ids: string[]) => [
    ...scopeKey(scope), 'selection', [...ids].sort(),
  ] as const,
};
