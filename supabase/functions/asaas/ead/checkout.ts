import { buildCheckoutCharge } from "../core/checkout.ts";
import { roundMoney, toNumber } from "../core/money.ts";
import { calculateEadValueWithInstallmentCost, shouldPassEadInstallmentCost } from "./fees.ts";
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
  const paymentSelection = resolveEadPaymentSelection(financeiroConfig, paymentRequest);
  const { billingType, installmentCount } = paymentSelection;
  const value = shouldPassEadInstallmentCost({ financeiroConfig, billingType, installmentCount })
    ? calculateEadValueWithInstallmentCost(baseValue, installmentCount)
    : baseValue;

  return buildCheckoutCharge({
    course,
    turma,
    dueDate,
    billingType,
    value,
    applyTurmaAdjustments: false,
    returnCallbackEnabled: true,
    daysAfterDueDateToRegistrationCancellation: 0,
    installmentCount: billingType === "CREDIT_CARD" ? installmentCount : 1,
  });
};
