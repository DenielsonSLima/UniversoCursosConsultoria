import { queueUuid } from '../fila/nfse-queue.contract';
import type { NfseScope } from '../types/nfse.types';
import type { IndividualAttempt } from './nfse-individual.types';
export const individualStorageKey = (scope: NfseScope) => ['nfse-individual', 'v1', scope.contextKey, scope.poloId, scope.environment, scope.month].join(':');
export function readIndividualAttempt(storage: { getItem(key: string): string | null }, key: string): IndividualAttempt | null {
  try {
    const raw = storage.getItem(key); if (!raw) return null;
    const row = JSON.parse(raw);
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['requestId', 'previewId', 'cancelPreviewId', 'retryRequestId'].includes(key))) return null;
    if (row.retryRequestId && !row.cancelPreviewId) return null;
    return { requestId: queueUuid(row.requestId), previewId: queueUuid(row.previewId), ...(row.cancelPreviewId ? { cancelPreviewId: queueUuid(row.cancelPreviewId) } : {}),
      ...(row.retryRequestId ? { retryRequestId: queueUuid(row.retryRequestId) } : {}) };
  } catch { return null; }
}
