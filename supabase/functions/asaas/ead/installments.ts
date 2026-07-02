import type { CourseFinanceiroConfig } from "../core/payment-methods.ts";
import { toNumber } from "../core/money.ts";

export const MAX_EAD_CARD_INSTALLMENTS = 21;

const clampInstallments = (value: number) =>
  Math.max(1, Math.min(MAX_EAD_CARD_INSTALLMENTS, Math.floor(value || 1)));

export const resolveEadInstallmentCount = (financeiroConfig: CourseFinanceiroConfig) => {
  if (!financeiroConfig.metodosRecebimento.cartao || !financeiroConfig.cartao.aceitar) {
    return 1;
  }

  return clampInstallments(toNumber(financeiroConfig.cartao.maxParcelas, 1));
};
