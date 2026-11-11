import type { NfseScope } from '../types/nfse.types';
import { NfseContractError } from '../services/nfse.errors';
import { assertScope, unwrapNfseEnvelope } from '../services/nfse.validation';
import { queueUuid } from '../fila/nfse-queue.contract';
import { parseNfseHomologationPreflight, parseNfseHomologationPreview, parseNfseHomologationResult } from './nfse-homologation.contract';
import type { NfseHomologationService } from './nfse-homologation.types';

export type NfseHomologationTransport = (endpoint: string, body: Record<string, unknown>) => Promise<unknown>;

export function createNfseHomologationService(transport: NfseHomologationTransport, now = () => new Date()): NfseHomologationService {
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
    async preflight(scope) {
      const referenceDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
      return parseNfseHomologationPreflight(await call('nfse-national-preflight', scope, { referenceDate, serviceCode: '080201' }));
    },
    async preview(scope, requestId, recipientPartnerId) {
      const partnerId = recipientPartnerId === undefined ? undefined : queueUuid(recipientPartnerId);
      const preview = parseNfseHomologationPreview(await call('nfse-national-pilot', scope,
        { action: 'PREVIEW', requestId: queueUuid(requestId), ...(partnerId ? { recipientPartnerId: partnerId } : {}) }));
      if (preview.payload && (partnerId ? preview.payload.recipientSource !== 'PARTNER' || preview.payload.recipientPartnerId !== partnerId : preview.payload.synthetic !== true)) throw new NfseContractError();
      return preview;
    },
    issue: (scope, requestId, previewId) => result(scope, 'ISSUE', requestId, previewId),
    reconcile: (scope, requestId, previewId) => result(scope, 'RECONCILE', requestId, previewId),
  };
}
