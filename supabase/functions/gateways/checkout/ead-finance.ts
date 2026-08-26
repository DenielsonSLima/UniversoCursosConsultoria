import {
  normalizeCourseFinanceiroConfig,
  resolveCoursePaymentSelection,
} from "../../asaas/core/payment-methods.ts";
import {
  calculateEadCheckoutFeeBreakdown,
  shouldPassEadInstallmentCost,
} from "../../asaas/ead/fees.ts";
import type { EadCharge, GatewayProviderCode } from "./types.ts";
import { dueDateInDays, roundMoney } from "./utils.ts";

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export const resolveEadCharge = (
  course: any,
  input: {
    method?: unknown;
    installments?: unknown;
    presentation?: unknown;
  },
  providerCode?: GatewayProviderCode,
): EadCharge => {
  const configuredFinanceiro = normalizeCourseFinanceiroConfig(
    course?.financeiro_config || {},
  );
  const usesPixPresentationOnBoletoRail =
    String(input.method || "").trim().toUpperCase() === "BOLETO" &&
    String(input.presentation || "").trim().toUpperCase() === "PIX" &&
    configuredFinanceiro.metodosRecebimento.pix;
  const financeiroConfig = usesPixPresentationOnBoletoRail
    ? {
      ...configuredFinanceiro,
      metodosRecebimento: {
        ...configuredFinanceiro.metodosRecebimento,
        boleto: true,
      },
    }
    : configuredFinanceiro;
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

  // O Banese confirma o valor pago do título, mas não fornece uma tarifa por
  // cobrança nesta integração. A taxa fixa abaixo pertence ao legado Asaas e
  // não pode ser usada para reduzir ou majorar boleto/Pix Banese.
  if (providerCode === "banese_card") {
    return {
      method,
      installmentCount,
      value: baseValue,
      feeValue: 0,
      netValue: baseValue,
      description: buildCoursePaymentDescription(
        String(course?.nome || "Curso EAD"),
      ),
      dueDate: dueDateInDays(7),
    };
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

export const resolveTargetedEadCharge = (
  configuredCharge: EadCharge,
  receivable: any,
): EadCharge => {
  const value = roundMoney(receivable?.valor);
  const dueDate = String(receivable?.data_vencimento || "").slice(0, 10);
  const description = String(receivable?.descricao || "").trim();
  if (value <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !description) {
    throw new Error(
      "Cobranca EAD existente sem valor, vencimento ou descricao canonicos.",
    );
  }
  return {
    ...configuredCharge,
    value,
    feeValue: 0,
    netValue: value,
    dueDate,
    description,
  };
};
