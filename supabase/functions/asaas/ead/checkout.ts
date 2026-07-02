import { buildCheckoutCharge, resolveCourseConfiguredPayment } from "../core/checkout.ts";
import { roundMoney, toNumber } from "../core/money.ts";

export const resolveEadCheckoutCharge = (course: any, turma: any, dueDate: string) => {
  const { billingType } = resolveCourseConfiguredPayment(course);
  const value = roundMoney(toNumber(course?.valor));

  return buildCheckoutCharge({
    course,
    turma,
    dueDate,
    billingType,
    value,
    applyTurmaAdjustments: false,
  });
};
