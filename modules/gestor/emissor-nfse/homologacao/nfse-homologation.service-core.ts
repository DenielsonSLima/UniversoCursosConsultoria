import type { NfseScope } from '../types/nfse.types';
import { NfseContractError } from '../services/nfse.errors';
import { assertScope, unwrapNfseEnvelope } from '../services/nfse.validation';
import { queueUuid } from '../fila/nfse-queue.contract';
import { parseNfseHomologationPreflight, parseNfseHomologationPreview, parseNfseHomologationResult } from './nfse-homologation.contract';
import type { NfseHomologationService } from './nfse-homologation.types';

export type NfseHomologationTransport = (endpoint: string, body: Record<string, unknown>) => Promise<unknown>;

export function createNfseHomologationService(transport: NfseHomologationTransport): NfseHomologationService {
  const call = async (endpoint: string, scope: NfseScope, args: Record<string, unknown>) => {
    assertScope(scope); queueUuid(scope.contextKey);
    if (scope.environment !== 'HOMOLOGACAO') throw new NfseContractError();
    const captured = { ...scope };
    return unwrapNfseEnvelope(await transport(endpoint, { scope: captured, ...args }), captured);
  };
  const result = async (scope: NfseScope, action: 'ISSUE' | 'RECONCILE', requestId: string, previewId: string) =>
    parseNfseHomologationResult(await call('nfse-national-pilot', scope, {
      action, requestId: queueUuid(requestId), previewId: queueUuid(previewId), ...(action === 'ISSUE' ? { confirmed: true } : {}),
    }));
  return {
    async preflight(scope) { return parseNfseHomologationPreflight(await call('nfse-national-preflight', scope, {})); },
    async preview(scope, requestId) { return parseNfseHomologationPreview(await call('nfse-national-pilot', scope,
      { action: 'PREVIEW', requestId: queueUuid(requestId) })); },
    issue: (scope, requestId, previewId) => result(scope, 'ISSUE', requestId, previewId),
    reconcile: (scope, requestId, previewId) => result(scope, 'RECONCILE', requestId, previewId),
  };
}
