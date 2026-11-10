import { NfseContractError } from '../services/nfse.errors';
import { integer, list, record, string } from '../services/nfse.validation';
import type { NfseScope } from '../types/nfse.types';
import { queueMonth, queueUuid } from './nfse-queue.contract';

export interface NfseQueueRemovalInput { requestId: string; documentIds: string[] }
export interface NfseQueueRemovalResult {
  id: string;
  documentIds: string[];
  removedCount: number;
  paymentMonths: string[];
  message: string;
}

function documentIds(value: unknown): string[] {
  const ids = list(value, queueUuid).map(id => id.toLowerCase()).sort();
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw new NfseContractError();
  return ids;
}

export function queueRemovalInput(input: NfseQueueRemovalInput) {
  return { p_request_id: queueUuid(input.requestId), p_document_ids: documentIds(input.documentIds) };
}

export function parseQueueRemoval(value: unknown, expected: string[]): NfseQueueRemovalResult {
  const row = record(value);
  const ids = documentIds(row.documentIds);
  const removedCount = integer(row.removedCount, 1);
  const paymentMonths = list(row.paymentMonths, queueMonth);
  if (removedCount !== ids.length || JSON.stringify(ids) !== JSON.stringify(documentIds(expected))
    || !paymentMonths.length || paymentMonths.length > ids.length
    || new Set(paymentMonths).size !== paymentMonths.length) throw new NfseContractError();
  return { id: queueUuid(row.id), documentIds: ids, removedCount, paymentMonths, message: string(row.message) };
}

/** Retain the exact request after a lost response; never silently retry a new intent. */
export function createNfseQueueRemovalAttempt(uuid: () => string = () => crypto.randomUUID()) {
  let previous: { key: string; input: NfseQueueRemovalInput } | undefined;
  return (scope: NfseScope, selected: string[]) => {
    const ids = documentIds(selected);
    const key = JSON.stringify([scope.contextKey, scope.poloId, scope.environment, scope.month, ids]);
    if (previous?.key !== key) previous = { key, input: { requestId: uuid(), documentIds: ids } };
    return { requestId: previous.input.requestId, documentIds: [...previous.input.documentIds] };
  };
}
