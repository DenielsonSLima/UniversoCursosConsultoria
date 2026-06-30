const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
};

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

  return metodosAtivos.length === 1 ? metodosAtivos[0] : "UNDEFINED";
};

export const mapBillingType = (billingType?: string | null) => {
  if (billingType === "CREDIT_CARD") return "CARTAO";
  if (billingType === "PIX") return "PIX";
  if (billingType === "BOLETO") return "BOLETO";
  return null;
};

export const resolveOnlineCharge = (course: any, turma: any, dueDate: string) => {
  const financeiroConfig = normalizeCourseFinanceiroConfig(course.financeiro_config || {});
  const billingType = resolveBillingType(financeiroConfig.metodosRecebimento);
  const courseValue = roundMoney(toNumber(course.valor));
  const turmaMatriculaValue = roundMoney(toNumber(turma?.valor_matricula));
  const turmaParcelValue = roundMoney(toNumber(turma?.valor_parcela));
  const modalidade = String(course.modalidade || "").toUpperCase();

  const value = modalidade === "EAD"
    ? courseValue || turmaMatriculaValue || turmaParcelValue
    : turmaMatriculaValue || courseValue || turmaParcelValue;

  if (!value || value <= 0) {
    throw new Error("Valor do curso/turma ainda não configurado para cobrança.");
  }

  const discountValue = roundMoney(toNumber(turma?.desconto_pontualidade));
  const interestPercent = toNumber(turma?.juros_atraso);
  const fineValue = roundMoney(toNumber(turma?.multa_atraso));
  const discountEnabled = turma?.aplicar_desconto_matricula === true;
  const penaltyEnabled = turma?.aplicar_multa_juros_matricula !== false;
  const discountApplies = discountEnabled && discountValue > 0 && discountValue < value;
  const fineApplies = penaltyEnabled && fineValue > 0;
  const interestApplies = penaltyEnabled && interestPercent > 0;

  const instructionLines = [
    buildCoursePaymentDescription(course.nome),
    discountApplies
      ? `Desconto de pontualidade de ${formatCurrency(discountValue)} para pagamento até ${formatDate(dueDate)}.`
      : null,
    fineApplies || interestApplies
      ? `Após o vencimento: ${fineApplies ? `multa de ${formatCurrency(fineValue)}` : ""}${fineApplies && interestApplies ? " e " : ""}${interestApplies ? `juros de ${interestPercent}% ao mês` : ""}.`
      : null,
  ].filter(Boolean).join("\n");

  return {
    billingType,
    value,
    dueDate,
    description: buildCoursePaymentDescription(course.nome),
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
  charge: ReturnType<typeof resolveOnlineCharge>,
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
