import type { NfseReceiptFilters, NfseReceiptScope } from '../types/nfse-students.types';

const scopeKey = (scope: NfseReceiptScope | null) => [
  'nfse-receipt-students', 'v1', scope?.contextId ?? '', scope?.poloId ?? '', scope?.paymentMonth ?? '',
] as const;

export const nfseStudentKeys = {
  scope: scopeKey,
  groups: (scope: NfseReceiptScope | null, filters: NfseReceiptFilters) => [
    ...scopeKey(scope), 'groups', filters.courseType, filters.classId, filters.search.trim(), filters.page,
  ] as const,
  selection: (scope: NfseReceiptScope | null, ids: string[]) => [
    ...scopeKey(scope), 'selection', [...ids].sort(),
  ] as const,
};
