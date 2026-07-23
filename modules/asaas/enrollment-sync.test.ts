import assert from 'node:assert/strict';
import {
  buildEnrollmentSyncPayload,
  normalizeGatewayPaymentMethod,
  requireGatewayPaymentMethod,
} from './enrollment-sync.ts';

declare const Deno: {
  test: (name: string, testFunction: () => void) => void;
};

Deno.test('normaliza somente métodos aceitos pela matrícula técnica', () => {
  assert.equal(normalizeGatewayPaymentMethod(' pix '), 'PIX');
  assert.equal(normalizeGatewayPaymentMethod('boleto'), 'BOLETO');
  assert.equal(normalizeGatewayPaymentMethod('credit_card'), 'CREDIT_CARD');
  assert.equal(normalizeGatewayPaymentMethod('cartao'), null);
  assert.equal(normalizeGatewayPaymentMethod(''), null);
});

Deno.test('não escolhe método padrão quando a seleção está ausente', () => {
  assert.throws(() => requireGatewayPaymentMethod(null), /Escolha Pix, boleto ou cartão/i);
});

Deno.test('monta o payload explícito do sync-enrollment', () => {
  assert.deepEqual(
    buildEnrollmentSyncPayload('matricula-1', 'CREDIT_CARD'),
    { matriculaId: 'matricula-1', paymentMethod: 'CREDIT_CARD' },
  );
  assert.deepEqual(
    buildEnrollmentSyncPayload('matricula-sem-cobranca', null),
    { matriculaId: 'matricula-sem-cobranca', paymentMethod: null },
  );
});
