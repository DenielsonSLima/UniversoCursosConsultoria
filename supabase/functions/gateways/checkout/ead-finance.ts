import {
  normalizeCourseFinanceiroConfig,
  resolveCoursePaymentSelection,
} from "../../asaas/core/payment-methods.ts";
import {
  calculateEadCheckoutFeeBreakdown,
  shouldPassEadInstallmentCost,
} from "../../asaas/ead/fees.ts";
import type { EadCharge } from "./types.ts";
import { dueDateInDays, roundMoney } from "./utils.ts";

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export const resolveEadCharge = (
  course: any,
  input: { method?: unknown; installments?: unknown },
): EadCharge => {
  const financeiroConfig = normalizeCourseFinanceiroConfig(
    course?.financeiro_config || {},
  );
  const { billingType: method, installmentCount } =
    resolveCoursePaymentSelection(financeiroConfig, {
      method: input.method,
      installments: input.installments,
      requireExplicitWhenMultiple: true,
      modalidadeLabel: "EAD",
    });

  const baseValue = roundMoney(course?.valor);
  if (!baseValue || baseValue <= 0) {
    throw new Error("Valor do curso EAD ainda nao configurado para cobranca.");
  }

  const includeFeeInCheckout = financeiroConfig.considerarTaxaNoCheckout ===
    true;
  const shouldApplyFeeInCheckout = method === "CREDIT_CARD"
    ? includeFeeInCheckout || shouldPassEadInstallmentCost({
      financeiroConfig,
      billingType: method,
      installmentCount,
    })
    : includeFeeInCheckout;
  const feeBreakdown = calculateEadCheckoutFeeBreakdown(
    baseValue,
    method,
    installmentCount,
    shouldApplyFeeInCheckout,
  );

  return {
    method,
    installmentCount,
    value: feeBreakdown.grossValue,
    feeValue: feeBreakdown.feeValue,
    netValue: feeBreakdown.netValue,
    description: buildCoursePaymentDescription(
      String(course?.nome || "Curso EAD"),
    ),
    dueDate: dueDateInDays(7),
  };
};
