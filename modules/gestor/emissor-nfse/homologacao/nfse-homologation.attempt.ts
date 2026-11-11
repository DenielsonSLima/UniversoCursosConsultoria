import { queueUuid } from '../fila/nfse-queue.contract';
import type { NfseScope } from '../types/nfse.types';

export interface PendingNfsePilot { requestId: string; previewId: string }

/** Recover only opaque attempt IDs; never put fiscal payloads or credentials in storage. */
export const nfsePilotStorageKey = (scope: NfseScope) => ['nfse-homologation-attempt', 'v1',
  scope.contextKey, scope.poloId, scope.environment, scope.month].join(':');

export function readPendingNfsePilot(storage: { getItem(key: string): string | null }, key: string): PendingNfsePilot | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('requestId' in value) || !('previewId' in value)) return null;
    return { requestId: queueUuid(value.requestId), previewId: queueUuid(value.previewId) };
  } catch { return null; }
}
