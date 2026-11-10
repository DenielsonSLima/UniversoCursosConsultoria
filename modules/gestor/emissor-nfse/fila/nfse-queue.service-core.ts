import { parseQueueRemoval, queueRemovalInput, type NfseQueueRemovalInput } from './nfse-queue-removal';
import type { NfseRpcTransport } from '../services/nfse.service-core';
import { assertScope, integer, unwrapNfseEnvelope } from '../services/nfse.validation';
import type { NfseScope } from '../types/nfse.types';
import { parseQueuePage, parseQueueSaved, queueInput, queueUuid } from './nfse-queue.contract';
import type { NfseQueueInput } from './nfse-queue.types';

export function createNfseQueueService(transport: NfseRpcTransport) {
  const call = async (name: string, scope: NfseScope, args: Record<string, unknown>, signal?: AbortSignal) => {
    assertScope(scope); queueUuid(scope.contextKey);
    return unwrapNfseEnvelope(await transport(name, { p_context_key: scope.contextKey, p_polo_id: scope.poloId,
      p_environment: scope.environment, p_month: scope.month, ...args }, signal), scope);
  };
  return {
    async list(scope: NfseScope, page: number, signal?: AbortSignal) {
      integer(page, 1);
      return parseQueuePage(await call('get_nfse_queue_secure', scope,
        { p_status: 'PREPARADO', p_page: page, p_page_size: 25 }, signal), page);
    },
    async remove(scope: NfseScope, input: NfseQueueRemovalInput) {
      const args = queueRemovalInput(input);
      return parseQueueRemoval(await call('remove_nfse_queue_documents_secure', scope, args), args.p_document_ids);
    },
    async prepare(scope: NfseScope, input: NfseQueueInput) {
      return parseQueueSaved(await call('prepare_nfse_batch_secure', scope, queueInput(input)));
    },
  };
}
