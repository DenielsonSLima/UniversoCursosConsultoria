import { buildCheckoutCharge, resolveCourseConfiguredPayment } from "../core/checkout.ts";
import { roundMoney, toNumber } from "../core/money.ts";
import type { CoursePaymentRequest } from "../core/payment-methods.ts";

export const resolveTecnicoInitialEnrollmentCharge = (
  course: any,
  turma: any,
  dueDate: string,
  paymentRequest: CoursePaymentRequest = {},
) => {
  const { billingType, installmentCount } = resolveCourseConfiguredPayment(course, {
    ...paymentRequest,
    requireExplicitWhenMultiple: true,
    modalidadeLabel: "TECNICO",
  });
  const value = roundMoney(
    toNumber(turma?.valor_matricula)
    || toNumber(course?.valor)
    || toNumber(turma?.valor_parcela),
  );

  return buildCheckoutCharge({
    course,
    turma,
    dueDate,
    billingType,
    value,
    applyTurmaAdjustments: true,
    installmentCount: billingType === "CREDIT_CARD" ? installmentCount : 1,
  });
};
