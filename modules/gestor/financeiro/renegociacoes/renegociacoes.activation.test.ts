import assert from 'node:assert/strict';
import test from 'node:test';
import { latestActivationProgress, parseActivationOperation, parseActivationResult, resumeActivationInput, type ActivateRenegociacaoInput } from './renegociacoes.activation.ts';

const input: ActivateRenegociacaoInput = {
  agreementId: 'agreement-1', requestId: 'request-1', expectedVersion: 2,
  expectedFingerprint: 'fingerprint', confirm: true, approveCustomTerms: false,
};
const progress = {
  agreementId: input.agreementId, operationId: 'operation-1', requestId: input.requestId,
  state: 'CANCELING_SOURCES', sourcesTotal: 3, sourcesCanceled: 1, replacementsTotal: 2, replacementsIssued: 0,
  retryable: true, success: false, code: null, message: 'Cancelamento em andamento.',
};

test('progresso parcial não vira sucesso; ACTIVE exige todos os cancelamentos e emissões confirmados', () => {
  assert.equal(parseActivationResult(progress, input).success, false);
  assert.throws(() => parseActivationResult({ ...progress, success: true }, input), /não confirmou a conclusão/);
  assert.throws(() => parseActivationResult({ ...progress, state: 'ACTIVE', retryable: false }, input), /todos os títulos/);
  assert.equal(parseActivationResult({ ...progress, state: 'ACTIVE', retryable: false, success: true,
    sourcesCanceled: 3, replacementsIssued: 2 }, input).state, 'ACTIVE');
});

test('resposta de outra proposta, chave ou estado desconhecido falha fechada', () => {
  assert.throws(() => parseActivationResult({ ...progress, agreementId: 'other' }, input), /não pertence/);
  assert.throws(() => parseActivationResult({ ...progress, requestId: 'other' }, input), /não pertence/);
  assert.throws(() => parseActivationResult({ ...progress, state: 'PAID' }, input), /desconhecida/);
  assert.throws(() => parseActivationResult({ ...progress, sourcesCanceled: null }, input), /contador inválido/);
  assert.throws(() => parseActivationResult({ ...progress, state: 'REVIEW_REQUIRED' }, input), /inconsistente/);
});

test('retomada usa o mesmo requestId e CAS original, não a versão atual do acordo', () => {
  const operation = parseActivationOperation({ ...progress, approvedCustomTerms: false, expectedVersion: 2, agreementVersion: 5,
    expectedFingerprint: 'fingerprint', proposalFingerprint: 'fingerprint',
    createdAt: '2026-10-03T10:00:00Z', updatedAt: '2026-10-03T10:01:00Z', completedAt: null }, 'agreement-1');
  assert.deepEqual(resumeActivationInput(operation!), input);
  assert.equal(operation?.agreementVersion, 5);
  assert.equal(parseActivationOperation(null, 'agreement-1'), null);
  assert.throws(() => parseActivationOperation(undefined, 'agreement-1'), /aprovação original/);
});

test('retomada preserva aprovação customizada original e rejeita aprovação desconhecida', () => {
  const payload = { ...progress, approvedCustomTerms: true, expectedVersion: 2, agreementVersion: 5,
    expectedFingerprint: 'fingerprint', proposalFingerprint: 'fingerprint',
    createdAt: '2026-10-03T10:00:00Z', updatedAt: '2026-10-03T10:01:00Z', completedAt: null };
  assert.deepEqual(resumeActivationInput(parseActivationOperation(payload, 'agreement-1')!), { ...input, approveCustomTerms: true });
  for (const approvedCustomTerms of [undefined, null, 'true', 1]) {
    assert.throws(() => parseActivationOperation({ ...payload, approvedCustomTerms }, 'agreement-1'), /aprovação original/);
  }
});

test('retorno ACTIVE da Edge não fica mascarado por GET antigo; revisão e identidade falham fechado', () => {
  const partial = parseActivationResult(progress, input);
  const active = parseActivationResult({ ...progress, success: true, state: 'ACTIVE', retryable: false,
    sourcesCanceled: 3, replacementsIssued: 2 }, input);
  assert.equal(latestActivationProgress(partial, active)?.state, 'ACTIVE');
  assert.equal(latestActivationProgress(active, partial)?.state, 'ACTIVE');
  const review = { ...partial, state: 'REVIEW_REQUIRED' as const, retryable: false };
  assert.equal(latestActivationProgress(active, review)?.state, 'REVIEW_REQUIRED');
  assert.equal(latestActivationProgress(partial, { ...active, operationId: 'other' }), partial);
});
