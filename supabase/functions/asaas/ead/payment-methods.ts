import { resolveCourseConfiguredPayment } from "../core/payment-methods.ts";

export const resolveEadConfiguredPayment = (course: any) => {
  const resolved = resolveCourseConfiguredPayment(course);
  return {
    ...resolved,
    metodosRecebimento: resolved.financeiroConfig.metodosRecebimento,
  };
};

export const eadUsesOnlyCreditCard = (metodos: { pix: boolean; boleto: boolean; cartao: boolean }) =>
  metodos.cartao === true && metodos.pix !== true && metodos.boleto !== true;
