import type { CourseFinanceiroConfig } from "../core/payment-methods.ts";
import { toNumber } from "../core/money.ts";

export const MAX_EAD_CARD_INSTALLMENTS = 21;

export const clampEadInstallments = (value: number, maxInstallments = MAX_EAD_CARD_INSTALLMENTS) =>
  Math.max(1, Math.min(maxInstallments, Math.floor(value || 1)));

export const resolveEadInstallmentCount = (
  financeiroConfig: CourseFinanceiroConfig,
  requestedInstallments?: unknown,
) => {
  if (!financeiroConfig.metodosRecebimento.cartao || !financeiroConfig.cartao.aceitar) {
    return 1;
  }

  const maxInstallments = clampEadInstallments(toNumber(financeiroConfig.cartao.maxParcelas, 1));
  const defaultInstallments = clampEadInstallments(toNumber(financeiroConfig.parcelasPadrao, 1), maxInstallments);
  if (requestedInstallments === undefined || requestedInstallments === null || requestedInstallments === "") {
    return defaultInstallments;
  }

  return clampEadInstallments(toNumber(requestedInstallments, defaultInstallments), maxInstallments);
};
