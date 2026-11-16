import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCouponCheckoutRoute, couponCheckoutArguments } from './ead-coupon-checkout.ts';
const context = (body: Record<string, unknown> = {}) => ({
  body, aluno: { id: 'aluno-ficticio' }, turma: { id: 'turma-ficticia' },
  route: { providerCode: 'banese_card' }, environment: 'sandbox', managerEnrollment: false,
  charge: { method: 'BOLETO', value: 999, dueDate: '2090-01-07', description: 'Curso fictício' },
}) as unknown as Parameters<typeof couponCheckoutArguments>[0];

test('checkout comum preserva o contrato sem consultar a rota de cupom', () => {
  for (const body of [{}, { couponCode: '' }, { couponCode: null }]) {
    const invalidCouponRoute = {...context(body), environment:'invalid',route:null} as never;
    assert.equal(couponCheckoutArguments(invalidCouponRoute, 'request'), null);
  }
});

test('cupom usa somente rota canônica BOLETO Banese em sandbox ou produção', () => {
  for (const environment of ['sandbox','production']) {
    assert.doesNotThrow(() => assertCouponCheckoutRoute({...context(),environment} as never));
  }
  for (const overrides of [{environment:'invalid'},{route:{providerCode:'asaas'}},
    {route:{providerCode:'mercado_pago'}},{charge:{method:'PIX'}},{charge:{method:'CREDIT_CARD'}}]) {
    assert.throws(() => assertCouponCheckoutRoute({...context(),...overrides} as never), /BolePix Banese/);
  }
});

test('RPC recebe intenção e identidades, nunca valor fornecido pelo cliente', () => {
  const args = couponCheckoutArguments(context({ couponCode: ' desconto50 ', requestId: 'request' }), 'request');
  assert.deepEqual(args, { p_code: 'DESCONTO50', p_aluno_id: 'aluno-ficticio', p_turma_id: 'turma-ficticia',
    p_request_id: 'request', p_provider: 'banese_card', p_environment: 'sandbox', p_payment_method: 'BOLETO',
    p_due_date: '2090-01-07', p_description: 'Curso fictício' });
  assert.equal('p_amount' in args!, false);
});

test('cupom não substitui cobrança emitida, não usa compra de gestor e exige request id', () => {
  const body = { couponCode: 'CUPOM50', requestId: 'request' };
  for (const overrides of [{ managerEnrollment: true }, { body: { ...body, receivableId: 'existente' } }]) {
    assert.throws(() => couponCheckoutArguments({ ...context(body), ...overrides } as never, 'request'), /antes da cobrança/);
  }
  assert.throws(() => couponCheckoutArguments(context({ couponCode: 'CUPOM50' }), 'request'), /Identificador/);
  assert.throws(() => couponCheckoutArguments(context({ couponCode: {}, requestId: 'request' }), 'request'), /inválido/);
});
