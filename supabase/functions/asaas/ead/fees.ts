import type { AsaasBillingType, CourseFinanceiroConfig } from "../core/payment-methods.ts";
import { roundMoney } from "../core/money.ts";

const CARD_FIXED_FEE = 0.49;

export const resolveEadCardFeeRate = (installmentCount: number) => {
  if (installmentCount <= 1) return 0.0299;
  if (installmentCount <= 6) return 0.0349;
  if (installmentCount <= 12) return 0.0399;
  return 0.0429;
};

export const shouldPassEadInstallmentCost = (input: {
  financeiroConfig: CourseFinanceiroConfig;
  billingType: AsaasBillingType;
  installmentCount: number;
}) =>
  input.financeiroConfig.cartao.repassarCustoParcelamento === true
  && input.billingType === "CREDIT_CARD"
  && input.installmentCount > 1;

export const calculateEadValueWithInstallmentCost = (baseValue: number, installmentCount: number) => {
  const rate = resolveEadCardFeeRate(installmentCount);
  if (rate <= 0 || rate >= 1) return roundMoney(baseValue);
  return roundMoney((baseValue + CARD_FIXED_FEE) / (1 - rate));
};
