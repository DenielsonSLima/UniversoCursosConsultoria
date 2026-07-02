import { buildCheckoutCharge, resolveCourseConfiguredPayment } from "../core/checkout.ts";
import { roundMoney, toNumber } from "../core/money.ts";

export const resolveLivreCheckoutCharge = (course: any, turma: any, dueDate: string) => {
  const { billingType } = resolveCourseConfiguredPayment(course);
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
  });
};
