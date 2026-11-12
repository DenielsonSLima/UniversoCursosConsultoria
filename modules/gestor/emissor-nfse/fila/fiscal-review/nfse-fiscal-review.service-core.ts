import type { NfseScope } from '../../types/nfse.types';
import type { NfseRpcTransport } from '../../services/nfse.service-core';
import { assertScope, integer, unwrapNfseEnvelope } from '../../services/nfse.validation';
import { queueUuid } from '../nfse-queue.contract';
import { fiscalReviewBasis, fiscalReviewDefinition, parseNfseFiscalReview, parseNfseFiscalReviewSaved } from './nfse-fiscal-review.contract';
import type { NfseFiscalReviewService } from './nfse-fiscal-review.types';

export function createNfseFiscalReviewService(transport: NfseRpcTransport): NfseFiscalReviewService {
  const call = async (name: string, scope: NfseScope, documentId: string, args: Record<string, unknown>, signal?: AbortSignal) => {
    assertScope(scope); queueUuid(scope.contextKey); queueUuid(documentId);
    return unwrapNfseEnvelope(await transport(name, { p_context_key: scope.contextKey, p_polo_id: scope.poloId,
      p_environment: scope.environment, p_month: scope.month, p_document_id: documentId, ...args }, signal), scope);
  };
  return {
    async get(scope, documentId, modelId, signal) {
      return parseNfseFiscalReview(await call('get_nfse_fiscal_review_secure', scope, documentId,
        { p_model_id: modelId ? queueUuid(modelId) : null }, signal), documentId);
    },
    async save(scope, documentId, input) {
      return parseNfseFiscalReviewSaved(await call('save_nfse_fiscal_review_secure', scope, documentId, {
        p_request_id: queueUuid(input.requestId), p_expected_revision: integer(input.expectedRevision),
        p_basis_token: fiscalReviewBasis(input.basisToken), p_definition: fiscalReviewDefinition(input.definition),
      }), documentId);
    },
    async validate(scope, documentId, input) {
      return parseNfseFiscalReviewSaved(await call('validate_nfse_fiscal_review_secure', scope, documentId, {
        p_request_id: queueUuid(input.requestId), p_expected_revision: integer(input.expectedRevision),
        p_basis_token: fiscalReviewBasis(input.basisToken), p_model_id: queueUuid(input.modelId),
        p_model_version: integer(input.modelVersion, 1),
      }), documentId);
    },
  };
}
