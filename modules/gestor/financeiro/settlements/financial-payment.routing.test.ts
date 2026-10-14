import assert from 'node:assert/strict';
import test from 'node:test';
import { usesLegacyFullSettlement } from './financial-payment.routing.ts';
import type { ContasReceber } from '../financeiro.types';

const receipt = (overrides: Partial<ContasReceber> = {}): ContasReceber => ({
  id: 'synthetic', poloId: 'polo', descricao: 'Título', valor: 100, status: 'PENDENTE',
  categoria: 'OUTROS_CREDITOS', dataVencimento: '2026-12-31', gatewayProvider: 'banese_card',
  operationCapabilities: { sourceSystem: 'BANESE', provenanceKind: 'BANESE_LEGACY_IMPORTED',
    canSettle: true, canCancel: true, canEmit: false, canOpenExisting: true, canReconcile: true, readOnlyReason: null },
  ...overrides,
});

test('Banese importado autorizado e Asaas continuam na baixa integral existente', () => {
  assert.equal(usesLegacyFullSettlement(receipt()), true);
  assert.equal(usesLegacyFullSettlement(receipt({ status: 'VENCIDO' })), true);
  const capabilities = receipt().operationCapabilities!;
  assert.equal(usesLegacyFullSettlement(receipt({ gatewayProvider: 'asaas', operationCapabilities: { ...capabilities, sourceSystem: 'OTHER', provenanceKind: 'OTHER' } })), true);
  assert.equal(usesLegacyFullSettlement(receipt({ gatewayProvider: 'asaas', operationCapabilities: { ...capabilities, sourceSystem: 'LOCAL', provenanceKind: 'LOCAL' } })), true);
});

test('ledger sempre exclui caminho integral legado, mesmo após estorno de todos eventos', () => {
  const paymentSummary = { originalAmount: '100.00', previouslyPaid: '70.00', remainingBefore: '30.00', status: 'PENDENTE', hasEvents: true };
  assert.equal(usesLegacyFullSettlement(receipt({ paymentSummary })), false);
  assert.equal(usesLegacyFullSettlement(receipt({ paymentSummary: { ...paymentSummary, previouslyPaid: '0.00', remainingBefore: '100.00' } })), false);
});

test('metadata ausente, negada ou origem bloqueada não concede baixa integral', () => {
  const capabilities = receipt().operationCapabilities!;
  assert.equal(usesLegacyFullSettlement(receipt({ operationCapabilities: undefined })), false);
  assert.equal(usesLegacyFullSettlement(receipt({ operationCapabilities: { ...capabilities, canSettle: false } })), false);
  assert.equal(usesLegacyFullSettlement(receipt({ operationCapabilities: { ...capabilities, canSettle: 'true' as unknown as boolean } })), false);
  for (const sourceSystem of ['PROESC', 'CONFLICT'] as const) {
    assert.equal(usesLegacyFullSettlement(receipt({ operationCapabilities: { ...capabilities, sourceSystem } })), false);
  }
  for (const status of ['PAGO', 'CANCELADO', 'ESTORNADO'] as const) assert.equal(usesLegacyFullSettlement(receipt({ status })), false);
});

test('Banese nativo e local permanecem no novo fluxo e não usam fallback monetário', () => {
  const capabilities = receipt().operationCapabilities!;
  assert.equal(usesLegacyFullSettlement(receipt({ operationCapabilities: { ...capabilities, provenanceKind: 'NATIVE_ISSUED' } })), false);
  assert.equal(usesLegacyFullSettlement(receipt({ gatewayProvider: undefined, operationCapabilities: { ...capabilities, provenanceKind: 'LOCAL', sourceSystem: 'LOCAL' } })), false);
});
