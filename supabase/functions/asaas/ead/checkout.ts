import { buildCheckoutCharge } from "../core/checkout.ts";
import { roundMoney, toNumber } from "../core/money.ts";
import { calculateEadValueWithInstallmentCost, shouldPassEadInstallmentCost } from "./fees.ts";
import { resolveEadInstallmentCount } from "./installments.ts";
import { resolveEadConfiguredPayment } from "./payment-methods.ts";

export const resolveEadCheckoutCharge = (course: any, turma: any, dueDate: string) => {
  const { billingType, financeiroConfig } = resolveEadConfiguredPayment(course);
  const baseValue = roundMoney(toNumber(course?.valor));
  const installmentCount = resolveEadInstallmentCount(financeiroConfig);
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
    installmentCount,
  });
};
