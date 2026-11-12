import assert from 'node:assert/strict';
import test from 'node:test';
import { NfseContractError } from '../../services/nfse.errors';
import { createNfseFiscalReviewService } from './nfse-fiscal-review.service-core';
import { fiscalReviewDefinition, parseNfseFiscalReview } from './nfse-fiscal-review.contract';
import { fiscalDefinition, fiscalId, fiscalReview, fiscalScope } from './nfse-fiscal-review.fixture';
import type { NfseScope } from '../../types/nfse.types';
import type { NfseFiscalReviewDefinition } from './nfse-fiscal-review.types';

const envelope = (data: unknown, scope = fiscalScope) => ({ version: 1, scope, data });
const saved = { documentId: fiscalReview.documentId, revision: 1, reviewId: fiscalId(7), message: 'Revisão salva sem emissão.' };
const input = { requestId: fiscalId(8), expectedRevision: 0, basisToken: fiscalReview.basisToken, definition: fiscalDefinition };

test('review sends selected model and explicit confirmations, never identity, amounts or fiscal authority', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const service = createNfseFiscalReviewService(async (name, args) => { calls.push({ name, args }); return envelope(name.startsWith('get_') ? fiscalReview : saved); });
  await service.get(fiscalScope, fiscalReview.documentId, fiscalDefinition.modelId);
  const data = await service.save(fiscalScope, fiscalReview.documentId, { ...input,
    definition: { ...fiscalDefinition, amount: '0.01', cnpj: 'another-issuer', issue: true } as NfseFiscalReviewDefinition });
  assert.deepEqual(data, saved);
  assert.equal(calls[0].args.p_model_id, fiscalDefinition.modelId);
  assert.deepEqual(calls[1], { name: 'save_nfse_fiscal_review_secure', args: { p_context_key: fiscalScope.contextKey,
    p_polo_id: fiscalScope.poloId, p_environment: 'HOMOLOGACAO', p_month: fiscalScope.month,
    p_document_id: fiscalReview.documentId, p_request_id: input.requestId, p_expected_revision: 0,
    p_basis_token: fiscalReview.basisToken, p_definition: fiscalDefinition } });
});

test('review does not derive fiscal dates from payments and rejects missing confirmation before network', async () => {
  assert.equal(parseNfseFiscalReview(fiscalReview, fiscalReview.documentId).service.competenceDate, null);
  assert.equal(parseNfseFiscalReview(fiscalReview, fiscalReview.documentId).service.serviceDate, null);
  let calls = 0;
  const service = createNfseFiscalReviewService(async () => { calls++; return envelope(saved); });
  for (const definition of [{ ...fiscalDefinition, competenceDate: '' }, { ...fiscalDefinition, serviceDate: '2026-02-31' },
    { ...fiscalDefinition, recipient: { mode: 'STUDENT', confirmed: false } },
    { ...fiscalDefinition, classificationConfirmed: false }, { ...fiscalDefinition, receiptsConfirmed: false }]) {
    await assert.rejects(service.save(fiscalScope, fiscalReview.documentId,
      { ...input, definition: definition as NfseFiscalReviewDefinition }), NfseContractError);
  }
  assert.equal(calls, 0);
});

test('review projects canonical data without secrets and never enables fiscal transmission', () => {
  const parsed = parseNfseFiscalReview({ ...fiscalReview, privateKey: 'excluded',
    recipient: { ...fiscalReview.recipient, password: 'excluded' } }, fiscalReview.documentId);
  assert.equal('privateKey' in parsed, false); assert.equal('password' in parsed.recipient, false);
  assert.equal(parsed.preparation.amount, '260.00'); assert.equal(parsed.canTransmit, false);
  assert.throws(() => parseNfseFiscalReview({ ...fiscalReview, canTransmit: true }, fiscalReview.documentId), NfseContractError);
  assert.throws(() => parseNfseFiscalReview({ ...fiscalReview, reviewComplete: true }, fiscalReview.documentId), NfseContractError);
  assert.deepEqual(fiscalReviewDefinition(fiscalDefinition), fiscalDefinition);
});

test('responses cannot cross document, context, polo, environment or month', async () => {
  for (const change of [{ contextKey: fiscalId(99) }, { poloId: fiscalId(99) }, { month: '2026-10' }, { environment: 'PRODUCAO' }]) {
    const service = createNfseFiscalReviewService(async () => envelope(fiscalReview, { ...fiscalScope, ...change } as typeof fiscalScope));
    await assert.rejects(service.get(fiscalScope, fiscalReview.documentId), NfseContractError);
  }
  const service = createNfseFiscalReviewService(async () => envelope({ ...fiscalReview, documentId: fiscalId(99) }));
  await assert.rejects(service.get(fiscalScope, fiscalReview.documentId), NfseContractError);
  assert.throws(() => parseNfseFiscalReview(fiscalReview, fiscalId(99)), NfseContractError);
  const otherScope: NfseScope = { ...fiscalScope, environment: 'PRODUCAO' };
  assert.notDeepEqual(otherScope, fiscalScope);
});

test('optional adjustments send only model selection and concurrency proof, without human attestations', async () => {
  const selection = { requestId: fiscalId(8), expectedRevision: 0, basisToken: fiscalReview.basisToken,
    modelId: fiscalDefinition.modelId, modelVersion: fiscalDefinition.modelVersion };
  const service = createNfseFiscalReviewService(async (name, args) => {
    assert.equal(name, 'validate_nfse_fiscal_review_secure');
    assert.deepEqual(args, { p_context_key: fiscalScope.contextKey, p_polo_id: fiscalScope.poloId,
      p_environment: fiscalScope.environment, p_month: fiscalScope.month, p_document_id: fiscalReview.documentId,
      p_request_id: selection.requestId, p_expected_revision: 0, p_basis_token: selection.basisToken,
      p_model_id: selection.modelId, p_model_version: selection.modelVersion });
    return envelope(saved);
  });
  assert.deepEqual(await service.validate(fiscalScope, fiscalReview.documentId, selection), saved);
  const automatic = parseNfseFiscalReview({ ...fiscalReview, revision: 1, reviewStatus: 'CONFIRMED',
    reviewComplete: true, validationSource: 'SYSTEM_VALIDATED', recipient: { ...fiscalReview.recipient, confirmed: false } }, fiscalReview.documentId);
  assert.equal(automatic.validationSource, 'SYSTEM_VALIDATED'); assert.equal(automatic.recipient.confirmed, false);
  assert.throws(() => parseNfseFiscalReview({ ...fiscalReview, validationSource: 'HUMAN_ASSUMED' }, fiscalReview.documentId), NfseContractError);
});
