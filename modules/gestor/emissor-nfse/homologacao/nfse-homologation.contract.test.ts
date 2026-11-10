import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseHomologationService } from './nfse-homologation.service-core';
import { nfseHomologationResultExplanation, parseNfseHomologationPreflight, parseNfseHomologationPreview, parseNfseHomologationResult } from './nfse-homologation.contract';
import { NfseContractError } from '../services/nfse.errors';
import type { NfseScope } from '../types/nfse.types';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), environment: 'HOMOLOGACAO', month: '2026-11' };
const preflight = { checkedAt: '2026-11-10T20:00:00Z', environment: 'HOMOLOGACAO', referenceDate: '2026-11-01',
  checks: [{ code: 'MTLS', status: 'PASSED', message: 'Conexão verificada.' }],
  pilot: { available: true, reason: null }, certificateExpiresAt: '2027-01-01T00:00:00Z' };
const preview = { previewId: id(3), expiresAt: '2026-11-10T21:00:00Z', capability: { available: true, reason: null },
  payload: { synthetic: true, issuerName: 'Emitente de teste', issuerDocument: 'Documento de teste',
    recipientName: 'Tomador sintético', recipientDocument: 'Documento de teste', serviceDescription: 'Teste sem valor fiscal',
    nationalServiceCode: '080201', competence: '2026-11-10', serviceDate: '2026-11-10', serviceAmount: '1.00',
    opSimpNac: '3', issTreatment: 'TRIBUTAVEL' } };
const result = { state: 'AUTHORIZED', attemptId: id(4), number: '1', accessKey: '1'.repeat(50), message: 'Teste confirmado.' };
const envelope = (data: unknown, echo = scope) => ({ version: 1, scope: echo, data });

test('homologation forbids production and invalid IDs before network', async () => {
  let calls = 0;
  const service = createNfseHomologationService(async () => { calls++; return null; });
  await assert.rejects(service.preflight({ ...scope, environment: 'PRODUCAO' }), NfseContractError);
  await assert.rejects(service.preview(scope, 'bad'), NfseContractError);
  await assert.rejects(service.issue(scope, id(5), 'bad'), NfseContractError);
  assert.equal(calls, 0);
});

test('pilot sends only scoped intent and separates issue from reconciliation', async () => {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const service = createNfseHomologationService(async (endpoint, body) => {
    calls.push({ endpoint, body });
    return envelope(body.action === 'PREVIEW' ? preview : endpoint.endsWith('preflight') ? preflight : result);
  });
  await service.preflight(scope); await service.preview(scope, id(5));
  await service.issue(scope, id(5), preview.previewId); await service.reconcile(scope, id(5), preview.previewId);
  assert.deepEqual(calls, [
    { endpoint: 'nfse-national-preflight', body: { scope } },
    { endpoint: 'nfse-national-pilot', body: { scope, action: 'PREVIEW', requestId: id(5) } },
    { endpoint: 'nfse-national-pilot', body: { scope, action: 'ISSUE', requestId: id(5), previewId: id(3), confirmed: true } },
    { endpoint: 'nfse-national-pilot', body: { scope, action: 'RECONCILE', requestId: id(5), previewId: id(3) } },
  ]);
});

test('preflight check never manufactures fiscal readiness or keeps private metadata', () => {
  const parsed = parseNfseHomologationPreflight({ ...preflight, certificate: 'private', readiness: 'READY' });
  assert.equal('certificate' in parsed, false); assert.equal('readiness' in parsed, false);
  assert.throws(() => parseNfseHomologationPreflight({ ...preflight, environment: 'PRODUCAO' }), NfseContractError);
  assert.throws(() => parseNfseHomologationPreflight({ ...preflight, checks: [] }), NfseContractError);
  assert.throws(() => parseNfseHomologationPreflight({ ...preflight, referenceDate: '2026-02-31' }), NfseContractError);
});

test('synthetic preview is mandatory for an enabled test and excludes extra fields', () => {
  const parsed = parseNfseHomologationPreview({ ...preview, payload: { ...preview.payload, privateKey: 'private' } });
  assert.equal('privateKey' in parsed.payload!, false);
  assert.throws(() => parseNfseHomologationPreview({ ...preview, payload: { ...preview.payload, synthetic: false } }), NfseContractError);
  assert.throws(() => parseNfseHomologationPreview({ ...preview, payload: { ...preview.payload, serviceAmount: 1 } }), NfseContractError);
  assert.throws(() => parseNfseHomologationPreview({ ...preview, payload: { ...preview.payload, serviceAmount: '2.00' } }), NfseContractError);
  assert.throws(() => parseNfseHomologationPreview({ ...preview, payload: { ...preview.payload, recipientDocument: 'Outro documento' } }), NfseContractError);
  assert.throws(() => parseNfseHomologationPreview({ ...preview, payload: null }), NfseContractError);
  assert.equal(parseNfseHomologationPreview({ ...preview, payload: null,
    capability: { available: false, reason: 'PILOT_REVIEW_INCOMPATIBLE' } }).payload, null);
});

test('another context or environment cannot supply a pilot response', async () => {
  for (const mismatch of [{ contextKey: id(9) }, { poloId: id(9) }, { month: '2026-10' }, { environment: 'PRODUCAO' as const }]) {
    const service = createNfseHomologationService(async () => envelope(preflight, { ...scope, ...mismatch }));
    await assert.rejects(service.preflight(scope), NfseContractError);
  }
});

test('pilot reflects the configured non-MEI regime and preserves the technical education service', () => {
  const parsed = parseNfseHomologationPreview(preview);
  assert.equal(parsed.payload?.opSimpNac, '3');
  assert.equal(parsed.payload?.nationalServiceCode, '080201');
  assert.equal(parsed.payload?.serviceAmount, '1.00');
  assert.equal(parseNfseHomologationPreview({ ...preview, payload: { ...preview.payload, opSimpNac: '1' } }).payload?.opSimpNac, '1');
  assert.throws(() => parseNfseHomologationPreview({ ...preview, payload: { ...preview.payload, opSimpNac: '2' } }), NfseContractError);
});

test('only confirmed authorization carries fiscal identification; ambiguity carries no success', () => {
  assert.equal(parseNfseHomologationResult(result).number, '1');
  assert.throws(() => parseNfseHomologationResult({ ...result, accessKey: null }), NfseContractError);
  assert.throws(() => parseNfseHomologationResult({ ...result, state: 'AWAITING_CONFIRMATION' }), NfseContractError);
  assert.equal(parseNfseHomologationResult({ ...result, state: 'AWAITING_CONFIRMATION', number: null, accessKey: null }).state, 'AWAITING_CONFIRMATION');
});

test('E0037 explanation is limited to the rejected homologation result and preserves the provider message', () => {
  const rejected = { state: 'REJECTED' as const, message: 'Teste rejeitado pela SEFIN: E0037.' };
  assert.match(nfseHomologationResultExplanation(rejected)!, /convênio do município emissor neste ambiente de homologação/);
  assert.match(nfseHomologationResultExplanation(rejected)!, /não comprova a situação em produção/);
  assert.equal(rejected.message, 'Teste rejeitado pela SEFIN: E0037.');
  assert.equal(nfseHomologationResultExplanation({ ...rejected, message: 'SEFIN: E00370.' }), null);
  assert.equal(nfseHomologationResultExplanation({ ...rejected, message: 'SEFIN: E0039.' }), null);
  assert.equal(nfseHomologationResultExplanation({ ...rejected, state: 'AUTHORIZED' }), null);
});
