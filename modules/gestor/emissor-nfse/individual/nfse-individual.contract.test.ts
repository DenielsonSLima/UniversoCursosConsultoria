import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseScope } from '../types/nfse.types';
import { NfseContractError } from '../services/nfse.errors';
import { createNfseIndividualService } from './nfse-individual.service-core';
import { individualDefinition, individualReason, individualRejectionExplanation, parseIndividualIssueResult, parseIndividualCancelResult } from './nfse-individual.contract';
import { individualStorageKey, readIndividualAttempt } from './nfse-individual.attempt';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };
const definition = { partnerId: id(4), modelId: id(3), modelVersion: 1, amount: '1.00' as const, competenceDate: '2026-11-11', serviceDate: '2026-11-11' };
const payload = { issuerName: 'EMITENTE SINTÉTICO', issuerCnpj: '00000000000100', recipientName: 'PARCEIRO SINTÉTICO', recipientDocument: '00000000000',
  modelId: id(3), modelVersion: 1, modelName: 'MODELO SINTÉTICO', amount: '1.00', competenceDate: '2026-11-11', serviceDate: '2026-11-11', series: '123',
  nationalServiceCode: '080201', nbsCode: '122020000', serviceDescription: 'PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS', opSimpNac: '3', regApTribSN: '1',
  municipalityCode: '2803401', municipalRegistration: 'IM-SINTÉTICA' };
const preview = { previewId: id(5), expiresAt: '2026-11-11T18:00:00Z', state: 'PREVIEWED', payload, capability: { available: true, reason: null } };
const issue = { previewId: id(5), state: 'AUTHORIZED', message: 'Autorização sintética', payload, number: '1', accessKey: '1'.repeat(50) };
const justification = 'Erro no valor informado na emissão.';
const cancelPayload = { number: '1', accessKey: '1'.repeat(50), reasonCode: '1', justification };
const cancelPreview = { previewId: id(5), cancelPreviewId: id(6), expiresAt: '2026-11-11T18:00:00Z', state: 'PREVIEWED', payload: cancelPayload, capability: { available: true, reason: null } };
const cancellation = { previewId: id(5), cancelPreviewId: id(6), state: 'CANCELLED', message: 'Cancelamento sintético confirmado', payload: cancelPayload };

test('unsupported official model branches remain explicit executor limitations in the review', () => {
  assert.match(individualReason('INDIVIDUAL_ADDITIONAL_SERVICE_UNSUPPORTED'), /comércio exterior.*adaptação/);
  assert.match(individualReason('INDIVIDUAL_GOVERNMENT_OPERATION_UNSUPPORTED'), /ainda não é atendida/);
  assert.match(individualReason('FISCAL_IBSCBS_DEPENDENT_GROUP_UNSUPPORTED'), /grupos complementares/);
  assert.match(individualReason('FISCAL_COMPETENCE_MODEL_MISMATCH'), /competência.*regra do modelo/i);
  assert.match(individualReason('FISCAL_SERVICE_DATE_COMPETENCE_MISMATCH'), /prestação.*datas iguais.*sem envio/);
  assert.match(individualReason('UNKNOWN_FUTURE_REASON'), /ainda não liberou/);
});
const envelope = (data: unknown, echo = scope) => ({ version: 1, scope: echo, data });

test('production intent fixes R$1, real dates and canonical model/partner references before network', async () => {
  let calls = 0; const service = createNfseIndividualService(async () => { calls++; return null; });
  await assert.rejects(service.preview({ ...scope, environment: 'HOMOLOGACAO' }, id(10), definition), NfseContractError);
  for (const change of [{ amount: '260.00' }, { partnerId: 'bad' }, { modelVersion: 0 }, { competenceDate: '' }, { serviceDate: '2026-02-30' }]) {
    assert.throws(() => individualDefinition({ ...definition, ...change } as typeof definition), NfseContractError);
  }
  await assert.rejects(service.issue(scope, id(10), 'bad'), NfseContractError); assert.equal(calls, 0);
});

test('issue and cancellation use one bound operation; browser never sends XML, private material or access key', async () => {
  const calls: Record<string, unknown>[] = [];
  const service = createNfseIndividualService(async body => {
    calls.push(body); return envelope(body.action === 'PREVIEW' ? preview : body.action === 'CANCEL_PREVIEW' ? cancelPreview
      : ['CANCEL', 'RECONCILE_CANCEL'].includes(String(body.action)) ? cancellation : issue);
  });
  await service.preview(scope, id(10), { ...definition, fiscalInput: 'FORBIDDEN', recipientDocument: 'FORBIDDEN' } as typeof definition);
  await service.issue(scope, id(10), id(5)); await service.reconcile(scope, id(10), id(5));
  await service.previewCancellation(scope, id(10), id(5), justification); await service.cancel(scope, id(10), id(5), id(6)); await service.reconcileCancellation(scope, id(10), id(5), id(6));
  assert.deepEqual(calls.map(row => row.action), ['PREVIEW', 'ISSUE', 'RECONCILE', 'CANCEL_PREVIEW', 'CANCEL', 'RECONCILE_CANCEL']);
  assert(calls.every(row => row.requestId === id(10))); assert(calls.every(row => row.scope === scope || JSON.stringify(row.scope) === JSON.stringify(scope)));
  assert.equal(calls[3].reasonCode, '1'); assert.equal(calls[4].confirmed, true); assert.equal('confirmed' in calls[5], false);
  assert(!/FORBIDDEN|accessKey|privateKey|certificate|Xml/.test(JSON.stringify(calls)));
  assert.deepEqual(calls[0], { scope, requestId: id(10), action: 'PREVIEW', ...definition });
});

test('preview identity/date/model drift and crossed scope cannot supply another operation', async () => {
  for (const change of [{ modelId: id(20) }, { modelVersion: 2 }, { competenceDate: '2026-11-10' }, { serviceDate: '2026-11-10' }]) {
    const service = createNfseIndividualService(async () => envelope({ ...preview, payload: { ...payload, ...change } }));
    await assert.rejects(service.preview(scope, id(10), definition), NfseContractError);
  }
  const crossed = createNfseIndividualService(async () => envelope(preview, { ...scope, poloId: id(20) }));
  await assert.rejects(crossed.preview(scope, id(10), definition), NfseContractError);
  const wrongNote = createNfseIndividualService(async () => envelope({ ...issue, previewId: id(20) }));
  await assert.rejects(wrongNote.reconcile(scope, id(10), id(5)), NfseContractError);
  const wrongEvent = createNfseIndividualService(async () => envelope({ ...cancellation, cancelPreviewId: id(20) }));
  await assert.rejects(wrongEvent.reconcileCancellation(scope, id(10), id(5), id(6)), NfseContractError);
});

test('unconfirmed issuance carries no fiscal success and analysis is distinct from cancellation', () => {
  assert.throws(() => parseIndividualIssueResult({ ...issue, state: 'AWAITING_CONFIRMATION' }), NfseContractError);
  assert.throws(() => parseIndividualIssueResult({ ...issue, accessKey: null }), NfseContractError);
  const pending = parseIndividualIssueResult({ ...issue, state: 'AWAITING_CONFIRMATION', number: undefined, accessKey: undefined });
  assert.equal(pending.number, null); assert.equal(pending.accessKey, null);
  assert.equal(parseIndividualCancelResult({ ...cancellation, state: 'AWAITING_ANALYSIS' }).state, 'AWAITING_ANALYSIS');
  const unsent = parseIndividualCancelResult({ ...cancellation, state: 'PREVIEWED', capability: { available: false, reason: 'CONTRACT_UNVERIFIED' } });
  assert.equal(unsent.state, 'PREVIEWED'); assert.equal(unsent.capability?.available, false);
  assert.equal(parseIndividualCancelResult({ ...cancellation, payload: { ...cancelPayload, reasonCode: '2' } }).payload.reasonCode, '2');
  assert.throws(() => parseIndividualCancelResult({ ...cancellation, payload: { ...cancelPayload, reasonCode: '3' } }), NfseContractError);
  assert.throws(() => parseIndividualCancelResult({ ...cancellation, payload: { ...cancelPayload, justification: 'curta' } }), NfseContractError);
});

test('recovery persists only opaque IDs, including the authorized document awaiting cancellation', () => {
  const record = { requestId: id(10), previewId: id(5), cancelPreviewId: id(6) };
  assert.deepEqual(readIndividualAttempt({ getItem: () => JSON.stringify(record) }, individualStorageKey(scope)), record);
  assert.equal(readIndividualAttempt({ getItem: () => JSON.stringify({ ...record, cpf: 'PRIVATE' }) }, 'key'), null);
  assert.equal(readIndividualAttempt({ getItem: () => 'not-json' }, 'key'), null);
  assert.notEqual(individualStorageKey(scope), individualStorageKey({ ...scope, environment: 'HOMOLOGACAO' }));
});


test('daily emission sends only a canonical source reference and explicit service competence, not reconstructed fiscal fields', async () => {
  const calls: Record<string, unknown>[] = [];
  const service = createNfseIndividualService(async body => { calls.push(body); return envelope({ ...preview, payload: { ...payload, amount: '260.00', modelVersion: 3 } }); });
  const source = { kind: 'PARTNER_SERVICE' as const, id: id(30) };
  const result = await service.previewSource(scope, id(10), { ...source, amount: '0.01', recipientDocument: 'FORBIDDEN' } as typeof source, '2026-11-10');
  assert.equal(result.payload?.amount, '260.00'); assert.equal(result.payload?.modelVersion, 3);
  assert.deepEqual(calls[0], { scope, requestId: id(10), action: 'PREVIEW_QUEUE', source, competenceDate: '2026-11-10' });
  await service.previewSource(scope, id(11), { kind: 'ACADEMIC_QUEUE', id: id(31) });
  assert.equal('competenceDate' in calls[1], false);
  await service.previewSource(scope, id(12), source);
  assert.deepEqual(calls[2], { scope, requestId: id(12), action: 'PREVIEW_QUEUE', source });
  await assert.rejects(service.previewSource(scope, id(11), { kind: 'ACADEMIC_QUEUE', id: id(31) }, '2026-11-10'), NfseContractError);
  await assert.rejects(service.previewSource(scope, id(11), source, ''), NfseContractError);
  assert.equal(calls.length, 3);
});

test('public canonical IBS summary preserves current model revision without changing its tax choices', () => {
  const ibsCbs = { included: true, cst: '000', classificationCode: '000001', operationIndicatorCode: '030101', recipientSameAsAcquirer: true, personalUse: true, governmentPurchase: false };
  const result = parseIndividualIssueResult({ ...issue, payload: { ...payload, modelVersion: 3, ibsCbs } });
  assert.equal(result.payload.modelVersion, 3); assert.deepEqual(result.payload.ibsCbs, ibsCbs);
  assert.throws(() => parseIndividualIssueResult({ ...issue, payload: { ...payload, ibsCbs: { ...ibsCbs, included: 'true' } } }), NfseContractError);
});

test('optional omitted municipal registration reopens the existing preview and issue snapshot', async () => {
  const service = createNfseIndividualService(async body => envelope(body.action === 'PREVIEW_QUEUE'
    ? { ...preview, payload: { ...payload, municipalRegistration: '' } }
    : { ...issue, state: 'PREVIEWED', number: null, accessKey: null, payload: { ...payload, municipalRegistration: ' ' } }));
  const prepared = await service.previewSource(scope, id(10), { kind: 'PARTNER_SERVICE', id: id(30) }, '2026-11-10');
  assert.equal(prepared.previewId, id(5)); assert.equal(prepared.payload?.municipalRegistration, null);
  const reopened = await service.reconcile(scope, id(10), id(5));
  assert.equal(reopened.previewId, id(5)); assert.equal(reopened.state, 'PREVIEWED'); assert.equal(reopened.payload.municipalRegistration, null);
});


test('rejected results preserve real server codes and show a code-specific explanation without authorization', () => {
  const result = parseIndividualIssueResult({ ...issue, state: 'REJECTED', number: null, accessKey: null, codes: ['E0120', 'E9999'] });
  assert.deepEqual(result.codes, ['E0120', 'E9999']); assert.equal(result.number, null); assert.equal(result.accessKey, null);
  assert(individualRejectionExplanation(result.codes)?.includes('CNC NFS-e'));
  assert.equal(individualRejectionExplanation(['E9999']), null);
  assert.throws(() => parseIndividualIssueResult({ ...issue, codes: ['<xml>private</xml>'] }), NfseContractError);
  assert.throws(() => parseIndividualIssueResult({ ...issue, codes: Array(101).fill('E0120') }), NfseContractError);
  const cancelled = parseIndividualCancelResult({ ...cancellation, state: 'CANCELLATION_REJECTED', codes: ['E0400'] });
  assert.deepEqual(cancelled.codes, ['E0400']);
});


test('selected cancellation sends only canonical model identity and facts; retry preserves opaque event identity', async () => {
  const model = { id: 'SYSTEM:ERROR_AMOUNT', version: 1, source: 'SYSTEM', category: 'VALOR', name: 'Erro no valor', active: true,
    eventCode: '101101', reasonCode: '1', textTemplate: 'Solicito cancelar por erro no valor: {{detalhe}}.', requiresDetail: true };
  const detail = 'O valor correto será informado em nova nota.';
  const calls: Record<string, unknown>[] = [];
  const selectedPreview = { ...cancelPreview, payload: { ...cancelPayload, cancellationModel: model, detail } };
  const service = createNfseIndividualService(async body => { calls.push(body); return envelope(body.action === 'CANCEL_PREVIEW' ? selectedPreview
    : { ...cancellation, retry: { availableAt: '2026-11-11T18:00:00Z', used: true } }); });
  await service.previewCancellationModel(scope, id(10), id(5), { id: model.id, version: 1 }, detail);
  assert.deepEqual(calls[0], { scope, action: 'CANCEL_PREVIEW', requestId: id(10), previewId: id(5), cancellationModel: { id: model.id, version: 1 }, detail });
  assert(!('reasonCode' in calls[0])); assert(!('justification' in calls[0]));
  await service.retryCancellation(scope, id(10), id(5), id(6), id(40));
  assert.deepEqual(calls[1], { scope, action: 'RETRY_CANCEL', requestId: id(10), previewId: id(5), cancelPreviewId: id(6), retryRequestId: id(40), confirmed: true });
  const count = calls.length;
  await assert.rejects(service.previewCancellationModel(scope, id(10), id(5), { id: model.id, version: 1 }, '{{detalhe}}'), NfseContractError);
  await assert.rejects(service.previewCancellation(scope, id(10), id(5), 'Solicito cancelar por erro: {{detalhe}}'), NfseContractError);
  assert.equal(calls.length, count);
  const saved = { requestId: id(10), previewId: id(5), cancelPreviewId: id(6), retryRequestId: id(40) };
  assert.deepEqual(readIndividualAttempt({ getItem: () => JSON.stringify(saved) }, 'key'), saved);
});
