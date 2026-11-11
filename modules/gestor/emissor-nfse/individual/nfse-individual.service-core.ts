import type { NfseScope } from '../types/nfse.types';
import { NfseContractError } from '../services/nfse.errors';
import { assertScope, unwrapNfseEnvelope } from '../services/nfse.validation';
import { queueUuid } from '../fila/nfse-queue.contract';
import { emissionSource } from '../emissao/nfse-operation.contract';
import { individualDate, individualDefinition, individualJustification, parseIndividualPreview, parseIndividualIssueResult,
  parseIndividualCancelPreview, parseIndividualCancelResult } from './nfse-individual.contract';
import { individualCancellationDetail, individualCancellationModel } from './nfse-individual.contract';
import type { NfseIndividualService } from './nfse-individual.types';
export function createNfseIndividualService(transport: (body: Record<string, unknown>) => Promise<unknown>): NfseIndividualService {
  const call = async (scope: NfseScope, requestId: string, action: string, args: Record<string, unknown>) => {
    assertScope(scope); queueUuid(scope.contextKey);
    if (scope.environment !== 'PRODUCAO') throw new NfseContractError();
    const captured = { ...scope };
    return unwrapNfseEnvelope(await transport({ scope: captured, action, requestId: queueUuid(requestId), ...args }), captured);
  };
  const bound = <T extends { previewId: string; cancelPreviewId?: string }>(data: T, previewId: string, cancelId?: string): T => {
    if (data.previewId !== previewId || cancelId !== undefined && data.cancelPreviewId !== cancelId) throw new NfseContractError(); return data;
  };
  return {
    async previewSource(scope, requestId, source, competenceDate) {
      const origin = emissionSource(source);
      if (origin.kind === 'ACADEMIC_QUEUE' && competenceDate !== undefined) throw new NfseContractError();
      return parseIndividualPreview(await call(scope, requestId, 'PREVIEW_QUEUE', { source: origin,
        ...(origin.kind === 'PARTNER_SERVICE' && competenceDate !== undefined ? { competenceDate: individualDate(competenceDate) } : {}) }));
    },
    async preview(scope, requestId, definition) {
      const input = individualDefinition(definition);
      const response = parseIndividualPreview(await call(scope, requestId, 'PREVIEW', input as unknown as Record<string, unknown>));
      const payload = response.payload;
      if (payload && (payload.modelId !== input.modelId || payload.modelVersion !== input.modelVersion
        || payload.competenceDate !== input.competenceDate || payload.serviceDate !== input.serviceDate || payload.amount !== input.amount)) throw new NfseContractError();
      return response;
    },
    async issue(scope, requestId, previewId) { return bound(parseIndividualIssueResult(await call(scope, requestId, 'ISSUE', { previewId: queueUuid(previewId), confirmed: true })), previewId); },
    async reconcile(scope, requestId, previewId) { return bound(parseIndividualIssueResult(await call(scope, requestId, 'RECONCILE', { previewId: queueUuid(previewId) })), previewId); },
    async previewCancellation(scope, requestId, previewId, justification) {
      return bound(parseIndividualCancelPreview(await call(scope, requestId, 'CANCEL_PREVIEW', { previewId: queueUuid(previewId), reasonCode: '1', justification: individualJustification(justification) })), previewId);
    },
    async previewCancellationModel(scope, requestId, previewId, model, detail) {
      const selected = individualCancellationModel(model), factualDetail = individualCancellationDetail(detail);
      const result = bound(parseIndividualCancelPreview(await call(scope, requestId, 'CANCEL_PREVIEW', {
        previewId: queueUuid(previewId), cancellationModel: selected, detail: factualDetail })), previewId);
      if (result.payload.cancellationModel?.id !== selected.id || result.payload.cancellationModel.version !== selected.version || result.payload.detail !== factualDetail) throw new NfseContractError();
      return result;
    },
    async cancel(scope, requestId, previewId, cancelPreviewId) { return bound(parseIndividualCancelResult(await call(scope, requestId, 'CANCEL', {
      previewId: queueUuid(previewId), cancelPreviewId: queueUuid(cancelPreviewId), confirmed: true })), previewId, cancelPreviewId); },
    async reconcileCancellation(scope, requestId, previewId, cancelPreviewId) { return bound(parseIndividualCancelResult(await call(scope, requestId, 'RECONCILE_CANCEL', {
      previewId: queueUuid(previewId), cancelPreviewId: queueUuid(cancelPreviewId) })), previewId, cancelPreviewId); },
    async retryCancellation(scope, requestId, previewId, cancelPreviewId, retryRequestId) { return bound(parseIndividualCancelResult(await call(scope, requestId, 'RETRY_CANCEL', {
      previewId: queueUuid(previewId), cancelPreviewId: queueUuid(cancelPreviewId), retryRequestId: queueUuid(retryRequestId), confirmed: true })), previewId, cancelPreviewId); },
  };
}
