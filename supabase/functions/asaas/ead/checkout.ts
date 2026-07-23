import { buildCheckoutCharge } from "../core/checkout.ts";
import { roundMoney, toNumber } from "../core/money.ts";
import {
  calculateEadCheckoutFeeBreakdown,
  shouldPassEadInstallmentCost,
} from "./fees.ts";
import type { EadCheckoutPaymentRequest } from "./payment-request.ts";
import { resolveEadPaymentSelection } from "./payment-request.ts";
import { resolveEadConfiguredPayment } from "./payment-methods.ts";

export const resolveEadCheckoutCharge = (
  course: any,
  turma: any,
  dueDate: string,
  paymentRequest?: EadCheckoutPaymentRequest,
) => {
  const { financeiroConfig } = resolveEadConfiguredPayment(course);
  const baseValue = roundMoney(toNumber(course?.valor));
  if (!baseValue || baseValue <= 0) {
    throw new Error("Valor do curso EAD ainda nao configurado para cobranca.");
  }
  const paymentSelection = resolveEadPaymentSelection(
    financeiroConfig,
    paymentRequest,
  );
  const { billingType, installmentCount } = paymentSelection;
  const includeFeeInCheckout = financeiroConfig.considerarTaxaNoCheckout ===
    true;
  const shouldApplyFeeInCheckout = billingType === "CREDIT_CARD"
    ? includeFeeInCheckout || shouldPassEadInstallmentCost({
      financeiroConfig,
      billingType,
      installmentCount,
    })
    : includeFeeInCheckout;
  const feeBreakdown = calculateEadCheckoutFeeBreakdown(
    baseValue,
    billingType,
    installmentCount,
    shouldApplyFeeInCheckout,
  );
  const value = feeBreakdown.grossValue;

  return {
    ...buildCheckoutCharge({
      course,
      turma,
      dueDate,
      billingType,
      value,
      applyTurmaAdjustments: false,
      returnCallbackEnabled: true,
      daysAfterDueDateToRegistrationCancellation: 0,
      installmentCount: billingType === "CREDIT_CARD" ? installmentCount : 1,
    }),
    feeValue: feeBreakdown.feeValue,
    netValue: feeBreakdown.netValue,
  };
};
