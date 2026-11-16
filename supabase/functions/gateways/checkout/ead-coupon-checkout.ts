import type { EadCheckoutContext } from './types.ts';

type CouponCheckoutContext = Omit<EadCheckoutContext, 'matricula' | 'checkoutAttempt'>;
export const assertCouponCheckoutRoute = (context: CouponCheckoutContext) => {
  // buildEadCheckoutContext resolves this route from trusted bank settings,
  // never from a browser environment/provider/amount. The coupon RPC repeats
  // the configuration checks under locks and owns production capability.
  if (!['sandbox', 'production'].includes(context.environment)
    || context.route.providerCode !== 'banese_card' || context.charge.method !== 'BOLETO') {
    throw new Error('O cupom exige a rota BolePix Banese homologada.');
  }
};

export const couponCheckoutArguments = (
  context: CouponCheckoutContext,
  requestId: string,
) => {
  const raw = context.body.couponCode;
  if (raw == null || raw === '') return null;
  assertCouponCheckoutRoute(context);
  if (typeof raw !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(raw.trim().toUpperCase())) {
    throw new Error('Código do cupom inválido.');
  }
  if (context.managerEnrollment || context.body.receivableId) {
    throw new Error('Aplique o cupom antes da cobrança e na compra do próprio aluno.');
  }
  if (!context.body.requestId) throw new Error('Identificador estável do resgate obrigatório.');
  return {
    p_code: raw.trim().toUpperCase(),
    p_aluno_id: context.aluno.id,
    p_turma_id: context.turma.id,
    p_request_id: requestId,
    p_provider: context.route.providerCode,
    p_environment: context.environment,
    p_payment_method: context.charge.method,
    p_due_date: context.charge.dueDate,
    p_description: context.charge.description,
  };
};
