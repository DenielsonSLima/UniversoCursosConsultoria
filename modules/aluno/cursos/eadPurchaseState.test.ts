import assert from 'node:assert/strict';
import test from 'node:test';
import { eadPurchaseNeedsRefresh, getEadBlockedCheckoutUi, getEadPurchaseUi, parseEadPurchaseStates } from './eadPurchaseState.ts';
import { buildEadRefundResolution } from '../../gestor/gestao/ead/ead-payment-review.model.ts';

const state = (attemptState: string, overrides = {}) => ({ matriculaId: 'm', cursoId: 'c', turmaId: 't',
  attemptId: 'a', receivableId: 'r', inscricaoId: 'i', attemptState, canRebuy: false, canPay: false,
  reviewRequired: false, ...overrides });

test('só expiração confirmada com canRebuy permite nova compra', () => {
  assert.equal(getEadPurchaseUi(state('EXPIRED', { canRebuy: true })).label, 'Nova compra');
  assert.equal(getEadPurchaseUi(state('EXPIRED')).disabled, true);
  assert.equal(getEadPurchaseUi(state('OPEN')).label, 'Aguardando confirmação');
  assert.equal(getEadPurchaseUi(state('OPEN', { canPay: true })).label, 'Continuar pagamento');
  assert.equal(getEadPurchaseUi(state('PAYMENT_RECOVERY_FENCED', { canRebuy: true })).disabled, true);
});

test('pagamento em revisão bloqueia outra emissão mesmo com flags antigas', () => {
  assert.equal(getEadPurchaseUi(state('PAID_REVIEW', { canPay: true, canRebuy: true, reviewRequired: true })).disabled, true);
  assert.equal(getEadPurchaseUi(state('PAID')).label, 'Pagamento confirmado');
  assert.throws(() => parseEadPurchaseStates(null), /confirmar o estado/);
  assert.throws(() => parseEadPurchaseStates([state('OPEN', { canPay: 'true' })]), /incompletos/);
});

test('feedback de checkout legado mantém confirmação visível e baixa aguarda projeção do acesso', () => {
  assert.equal(getEadBlockedCheckoutUi({ awaitingConfirmation: true })?.label, 'Aguardando confirmação');
  assert.equal(getEadBlockedCheckoutUi({ paymentReviewRequired: true })?.disabled, true);
  assert.equal(getEadBlockedCheckoutUi({}), null);
  assert.equal(eadPurchaseNeedsRefresh(state('PAID'), false), true);
  assert.equal(eadPurchaseNeedsRefresh(state('PAID'), true), false);
});

test('revisão só oferece vínculo financeiro efetivo com comprovante', () => {
  const input = { reviewId: 'review', requestId: 'request', expenseId: 'expense', evidenceReference: ' receipt ', note: '' };
  assert.deepEqual(buildEadRefundResolution(input), { p_review_id: 'review', p_request_id: 'request',
    p_resolution: 'LINK_CONFIRMED_REFUND', p_refund_expense_id: 'expense', p_evidence_reference: 'receipt', p_note: null });
  assert.throws(() => buildEadRefundResolution({ ...input, expenseId: '' }), /devolução já paga/);
  assert.throws(() => buildEadRefundResolution({ ...input, evidenceReference: ' ' }), /comprovante/);
});
