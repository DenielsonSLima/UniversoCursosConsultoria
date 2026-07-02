import { formatCurrency, formatDate, roundMoney, toNumber } from "./money.ts";
import { resolveCourseConfiguredPayment } from "./payment-methods.ts";

export {
  normalizeCourseFinanceiroConfig,
  resolveBillingType,
  resolveCourseConfiguredPayment,
} from "./payment-methods.ts";

export interface CheckoutCharge {
  billingType: string;
  value: number;
  dueDate: string;
  description: string;
  asaasDescription: string;
  discount: Record<string, unknown> | null;
  interest: Record<string, unknown> | null;
  fine: Record<string, unknown> | null;
  installments: {
    parcelasPadrao: number;
    maxParcelasCartao: number;
  };
  installmentCount?: number | null;
  totalValue?: number | null;
  returnCallbackEnabled: boolean;
  daysAfterDueDateToRegistrationCancellation?: number | null;
}

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export const buildCheckoutCharge = (input: {
  course: any;
  dueDate: string;
  billingType: string;
  value: number;
  turma?: any;
  applyTurmaAdjustments: boolean;
  returnCallbackEnabled?: boolean;
  daysAfterDueDateToRegistrationCancellation?: number | null;
  installmentCount?: number | null;
}): CheckoutCharge => {
  const value = roundMoney(input.value);
  if (!value || value <= 0) {
    throw new Error("Valor do curso/turma ainda nao configurado para cobranca.");
  }

  const { financeiroConfig } = resolveCourseConfiguredPayment(input.course);
  const turma = input.turma || {};
  const discountValue = roundMoney(toNumber(turma?.desconto_pontualidade));
  const interestPercent = toNumber(turma?.juros_atraso);
  const fineValue = roundMoney(toNumber(turma?.multa_atraso));
  const discountEnabled = input.applyTurmaAdjustments && turma?.aplicar_desconto_matricula === true;
  const penaltyEnabled = input.applyTurmaAdjustments && turma?.aplicar_multa_juros_matricula !== false;
  const discountApplies = discountEnabled && discountValue > 0 && discountValue < value;
  const fineApplies = penaltyEnabled && fineValue > 0;
  const interestApplies = penaltyEnabled && interestPercent > 0;
  const requestedInstallments = Math.floor(toNumber(input.installmentCount, 1));
  const installmentCount = requestedInstallments > 1 ? requestedInstallments : null;

  const instructionLines = [
    buildCoursePaymentDescription(input.course.nome),
    discountApplies
      ? `Desconto de pontualidade de ${formatCurrency(discountValue)} para pagamento ate ${formatDate(input.dueDate)}.`
      : null,
    fineApplies || interestApplies
      ? `Apos o vencimento: ${fineApplies ? `multa de ${formatCurrency(fineValue)}` : ""}${fineApplies && interestApplies ? " e " : ""}${interestApplies ? `juros de ${interestPercent}% ao mes` : ""}.`
      : null,
  ].filter(Boolean).join("\n");

  return {
    billingType: input.billingType,
    value,
    dueDate: input.dueDate,
    description: buildCoursePaymentDescription(input.course.nome),
    asaasDescription: instructionLines.slice(0, 500),
    discount: discountApplies ? { value: discountValue, dueDateLimitDays: 0, type: "FIXED" } : null,
    interest: interestApplies ? { value: interestPercent } : null,
    fine: fineApplies ? { value: fineValue, type: "FIXED" } : null,
    installments: {
      parcelasPadrao: financeiroConfig.parcelasPadrao,
      maxParcelasCartao: financeiroConfig.cartao.maxParcelas,
    },
    installmentCount,
    totalValue: installmentCount ? value : null,
    returnCallbackEnabled: input.returnCallbackEnabled !== false,
    daysAfterDueDateToRegistrationCancellation: input.daysAfterDueDateToRegistrationCancellation ?? null,
  };
};

export const buildOnlinePaymentPayload = (
  customerId: string,
  receivableId: string,
  charge: CheckoutCharge,
  successUrl?: string | null,
) => {
  const payload: Record<string, unknown> = {
    customer: customerId,
    billingType: charge.billingType,
    dueDate: charge.dueDate,
    description: charge.asaasDescription,
    externalReference: receivableId,
    postalService: false,
  };

  if (charge.installmentCount && charge.totalValue) {
    payload.installmentCount = charge.installmentCount;
    payload.totalValue = charge.totalValue;
  } else {
    payload.value = charge.value;
  }

  if (charge.discount) payload.discount = charge.discount;
  if (charge.interest) payload.interest = charge.interest;
  if (charge.fine) payload.fine = charge.fine;
  if (typeof charge.daysAfterDueDateToRegistrationCancellation === "number") {
    payload.daysAfterDueDateToRegistrationCancellation = charge.daysAfterDueDateToRegistrationCancellation;
  } else if (charge.interest || charge.fine) {
    payload.daysAfterDueDateToRegistrationCancellation = 30;
  }
  if (successUrl) payload.callback = { successUrl };

  return payload;
};
