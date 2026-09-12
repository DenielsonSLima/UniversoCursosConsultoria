import assert from 'node:assert/strict';
import test from 'node:test';
import { hasProescEvidence, isProescPaymentUnderReview, parseProescReceivableEvidence } from './financeiro.proesc-evidence';

test('projeção ausente não confunde legado genérico com Proesc', () => {
  for (const value of [null, undefined, [], 'PROESC']) assert.equal(parseProescReceivableEvidence(value), undefined);
  assert.equal(hasProescEvidence({ status: 'PENDENTE' }), false);
});

test('parser publica apenas campos reconhecidos e trata fonte desconhecida como revisão', () => {
  assert.deepEqual(parseProescReceivableEvidence({ sourceStatus: 'UNKNOWN', verification: 'VERIFIED',
    observedAt: '2026-09-12T18:00:00Z', cpf: 'never-return', token: 'never-return' }), {
    sourceStatus: 'UNKNOWN', verification: 'REVIEW', observedAt: '2026-09-12T18:00:00Z',
  });
  assert.deepEqual(parseProescReceivableEvidence({ sourceStatus: 'unexpected', observedAt: 'private' }), {
    sourceStatus: 'UNKNOWN', verification: 'REVIEW', observedAt: null,
  });
});

test('revisão de parcela não depende da cobertura de ciclo nem reabre pagamento aplicado', () => {
  const unknown = parseProescReceivableEvidence({ sourceStatus: 'UNKNOWN', verification: 'REVIEW' });
  assert.equal(isProescPaymentUnderReview({ status: 'PENDENTE', proescEvidence: unknown }), true);
  assert.equal(isProescPaymentUnderReview({ status: 'VENCIDO', proescEvidence: unknown }), true);
  assert.equal(isProescPaymentUnderReview({ status: 'PAGO', proescEvidence: unknown }), false);
  const open = parseProescReceivableEvidence({ sourceStatus: 'OPEN', verification: 'VERIFIED' });
  assert.equal(isProescPaymentUnderReview({ status: 'PENDENTE', proescEvidence: open }), false);
});

test('identidade bancária existente tem precedência sobre metadado Proesc incompatível', () => {
  const item = { status: 'PENDENTE', proescEvidence: parseProescReceivableEvidence({ sourceStatus: 'UNKNOWN' }) };
  assert.equal(isProescPaymentUnderReview({ ...item, gatewayProvider: 'banese_card' }), false);
  assert.equal(hasProescEvidence({ ...item, asaasPaymentId: 'synthetic-bank-id' }), false);
});
