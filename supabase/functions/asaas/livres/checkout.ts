import {
  buildCheckoutCharge,
  resolveCourseConfiguredPayment,
} from "../core/checkout.ts";
import { resolveInitialEnrollmentChargeValue } from "../core/enrollment-financial-terms.ts";
import type { CoursePaymentRequest } from "../core/payment-methods.ts";

export const resolveLivreCheckoutCharge = (
  course: any,
  turma: any,
  dueDate: string,
  paymentRequest: CoursePaymentRequest = {},
  matricula?: any,
) => {
  const { billingType, installmentCount } = resolveCourseConfiguredPayment(
    course,
    {
      ...paymentRequest,
      requireExplicitWhenMultiple: true,
      modalidadeLabel: "LIVRE",
    },
  );
  const value = resolveInitialEnrollmentChargeValue({
    course,
    turma,
    matricula,
  });

  return buildCheckoutCharge({
    course,
    turma,
    dueDate,
    billingType,
    value,
    matricula,
    applyTurmaAdjustments: true,
    installmentCount: billingType === "CREDIT_CARD" ? installmentCount : 1,
  });
};
