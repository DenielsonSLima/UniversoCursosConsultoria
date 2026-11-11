import type { NfseDocument, NfseScope } from '../types/nfse.types';
import type { NfseRpcTransport } from '../services/nfse.service-core';
import { assertScope, integer, oneOf, record, unwrapNfseEnvelope } from '../services/nfse.validation';
import { queueUuid } from '../fila/nfse-queue.contract';
import { NfseContractError } from '../services/nfse.errors';

export type NfseErrorArchiveAction = 'ARCHIVE' | 'RESTORE';
export interface NfseErrorArchiveInput { requestId: string; operationIds: string[]; action: NfseErrorArchiveAction }
export interface NfseErrorArchiveResult { action: NfseErrorArchiveAction; operationIds: string[]; changedCount: number }
export const canChangeNfseErrorArchive = (document: NfseDocument, action: NfseErrorArchiveAction) =>
  document.status === 'ERRO' && document.state === 'REJECTED' && (action === 'ARCHIVE' ? document.canArchive === true : document.canRestore === true);

const ids = (value: unknown) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100 || new Set(value).size !== value.length) throw new NfseContractError();
  return value.map(queueUuid).sort();
};
export function createNfseErrorArchiveService(transport: NfseRpcTransport) {
  return async (scope: NfseScope, input: NfseErrorArchiveInput): Promise<NfseErrorArchiveResult> => {
    assertScope(scope);
    const action = oneOf(input.action, ['ARCHIVE', 'RESTORE']), operationIds = ids(input.operationIds);
    const result = record(unwrapNfseEnvelope(await transport('archive_nfse_errors_secure', {
      p_context_key: scope.contextKey, p_polo_id: scope.poloId, p_environment: scope.environment, p_month: scope.month,
      p_request_id: queueUuid(input.requestId), p_operation_ids: operationIds, p_action: action,
    }), scope));
    const returnedIds = ids(result.operationIds), changedCount = integer(result.changedCount);
    if (result.action !== action || JSON.stringify(returnedIds) !== JSON.stringify(operationIds) || changedCount > operationIds.length) throw new NfseContractError();
    return { action, operationIds: returnedIds, changedCount };
  };
}

export function createNfseErrorArchiveAttempt(uuid: () => string = () => crypto.randomUUID()) {
  let previous: { key: string; input: NfseErrorArchiveInput } | undefined;
  return {
    get(scope: NfseScope, action: NfseErrorArchiveAction, operationIds: string[]): NfseErrorArchiveInput {
      const canonical = ids(operationIds), key = JSON.stringify([scope, action, canonical]);
      if (previous?.key !== key) previous = { key, input: { requestId: queueUuid(uuid()), action, operationIds: canonical } };
      return { ...previous.input, operationIds: [...previous.input.operationIds] };
    },
    confirm(requestId: string) { if (previous?.input.requestId === requestId) previous = undefined; },
  };
}
