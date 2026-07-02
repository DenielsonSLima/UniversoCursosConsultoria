import { formatCurrency, formatDate, roundMoney, toNumber } from "./money.ts";

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
}

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export const normalizeCourseFinanceiroConfig = (config: any = {}) => {
  const metodos = config?.metodosRecebimento || {};
  const cartao = config?.cartao || {};
  const parcelasPadrao = Math.max(1, toNumber(config?.parcelasPadrao, 1));
  const maxParcelas = cartao?.aceitar
    ? Math.max(parcelasPadrao, toNumber(cartao?.maxParcelas, parcelasPadrao))
    : 1;

  return {
    metodosRecebimento: {
      pix: metodos.pix !== false,
      boleto: metodos.boleto !== false,
      cartao: metodos.cartao !== false,
    },
    parcelasPadrao,
    cartao: {
      aceitar: cartao.aceitar !== false,
      maxParcelas,
    },
  };
};

export const resolveBillingType = (metodos: { pix: boolean; boleto: boolean; cartao: boolean }) => {
  const metodosAtivos = [
    metodos.pix ? "PIX" : null,
    metodos.boleto ? "BOLETO" : null,
    metodos.cartao ? "CREDIT_CARD" : null,
  ].filter(Boolean);

  if (metodosAtivos.length === 0) {
    throw new Error("Nenhuma forma de recebimento configurada para este curso.");
  }

  return metodosAtivos.length === 1 ? String(metodosAtivos[0]) : "UNDEFINED";
};

export const resolveCourseConfiguredPayment = (course: any) => {
  const financeiroConfig = normalizeCourseFinanceiroConfig(course?.financeiro_config || {});
  return {
    financeiroConfig,
    billingType: resolveBillingType(financeiroConfig.metodosRecebimento),
  };
};

export const buildCheckoutCharge = (input: {
  course: any;
  dueDate: string;
  billingType: string;
  value: number;
  turma?: any;
  applyTurmaAdjustments: boolean;
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
    value: charge.value,
    dueDate: charge.dueDate,
    description: charge.asaasDescription,
    externalReference: receivableId,
    postalService: false,
  };

  if (charge.discount) payload.discount = charge.discount;
  if (charge.interest) payload.interest = charge.interest;
  if (charge.fine) payload.fine = charge.fine;
  if (charge.interest || charge.fine) payload.daysAfterDueDateToRegistrationCancellation = 30;
  if (successUrl) payload.callback = { successUrl };

  return payload;
};
