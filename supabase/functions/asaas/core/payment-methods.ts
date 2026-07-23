import { toNumber } from "./money.ts";

export type AsaasBillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";
export type CoursePaymentMethod = Exclude<AsaasBillingType, "UNDEFINED">;

export interface CoursePaymentRequest {
  method?: unknown;
  installments?: unknown;
  requireExplicitWhenMultiple?: boolean;
  modalidadeLabel?: string;
}

export interface CourseFinanceiroConfig {
  parcelasPadrao: number;
  taxaPagaPor: "aluno" | "instituicao";
  considerarTaxaNoCheckout?: boolean;
  metodosRecebimento: {
    pix: boolean;
    boleto: boolean;
    cartao: boolean;
  };
  cartao: {
    aceitar: boolean;
    maxParcelas: number;
    aplicarDescontoPontualidade: boolean;
    repassarCustoParcelamento: boolean;
  };
}

export const normalizeCourseFinanceiroConfig = (config: any = {}): CourseFinanceiroConfig => {
  const metodos = config?.metodosRecebimento || {};
  const cartao = config?.cartao || {};
  const configuredDefaultInstallments = Math.max(
    1,
    Math.floor(toNumber(config?.parcelasPadrao, 1)),
  );
  const cardEnabled = metodos.cartao !== false && cartao.aceitar !== false;
  const maxParcelas = cardEnabled
    ? Math.max(
      1,
      Math.min(
        21,
        Math.floor(
          toNumber(cartao?.maxParcelas, configuredDefaultInstallments),
        ),
      ),
    )
    : 1;
  const parcelasPadrao = Math.min(configuredDefaultInstallments, maxParcelas);

  return {
    parcelasPadrao,
    taxaPagaPor: config?.taxaPagaPor === "instituicao" ? "instituicao" : "aluno",
    considerarTaxaNoCheckout: config?.considerarTaxaNoCheckout === true,
    metodosRecebimento: {
      pix: metodos.pix !== false,
      boleto: metodos.boleto !== false,
      cartao: metodos.cartao !== false,
    },
    cartao: {
      aceitar: cartao.aceitar !== false,
      maxParcelas,
      aplicarDescontoPontualidade: cartao.aplicarDescontoPontualidade === true,
      repassarCustoParcelamento: cartao.repassarCustoParcelamento === true,
    },
  };
};

export const resolveBillingType = (
  metodos: CourseFinanceiroConfig["metodosRecebimento"],
): AsaasBillingType => {
  const metodosAtivos = [
    metodos.pix ? "PIX" : null,
    metodos.boleto ? "BOLETO" : null,
    metodos.cartao ? "CREDIT_CARD" : null,
  ].filter(Boolean);

  if (metodosAtivos.length === 0) {
    throw new Error("Nenhuma forma de recebimento configurada para este curso.");
  }

  return metodosAtivos.length === 1 ? metodosAtivos[0] as AsaasBillingType : "UNDEFINED";
};

export const activeCoursePaymentMethods = (
  financeiroConfig: CourseFinanceiroConfig,
): CoursePaymentMethod[] => {
  const methods: CoursePaymentMethod[] = [];
  if (financeiroConfig.metodosRecebimento.pix) methods.push("PIX");
  if (financeiroConfig.metodosRecebimento.boleto) methods.push("BOLETO");
  if (
    financeiroConfig.metodosRecebimento.cartao &&
    financeiroConfig.cartao.aceitar
  ) {
    methods.push("CREDIT_CARD");
  }
  return methods;
};

const normalizeRequestedPaymentMethod = (
  method: unknown,
): CoursePaymentMethod | null => {
  const normalized = String(method || "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "PIX" || normalized === "BOLETO" || normalized === "CREDIT_CARD") {
    return normalized;
  }
  if (normalized === "CARTAO" || normalized === "CARTÃO" || normalized === "CARD") {
    return "CREDIT_CARD";
  }
  return null;
};

const paymentMethodLabel = (method: CoursePaymentMethod) => {
  if (method === "PIX") return "Pix";
  if (method === "BOLETO") return "boleto";
  return "cartao";
};

const resolveCardInstallments = (
  financeiroConfig: CourseFinanceiroConfig,
  requestedInstallments: unknown,
) => {
  const maxInstallments = Math.max(
    1,
    Math.min(21, Math.floor(toNumber(financeiroConfig.cartao.maxParcelas, 1))),
  );
  const defaultInstallments = Math.max(
    1,
    Math.min(maxInstallments, Math.floor(toNumber(financeiroConfig.parcelasPadrao, 1))),
  );

  if (
    requestedInstallments === undefined || requestedInstallments === null ||
    requestedInstallments === ""
  ) {
    return defaultInstallments;
  }

  const parsed = Number(requestedInstallments);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Quantidade de parcelas invalida para o cartao.");
  }
  if (parsed > maxInstallments) {
    throw new Error(`Este curso permite no maximo ${maxInstallments} parcelas no cartao.`);
  }
  return parsed;
};

export const resolveCoursePaymentSelection = (
  financeiroConfig: CourseFinanceiroConfig,
  request: CoursePaymentRequest = {},
) => {
  const activeMethods = activeCoursePaymentMethods(financeiroConfig);
  if (activeMethods.length === 0) {
    throw new Error("Nenhuma forma de recebimento configurada para este curso.");
  }

  const requestedMethod = normalizeRequestedPaymentMethod(request.method);
  if (request.method && !requestedMethod) {
    throw new Error("Forma de pagamento invalida para este curso.");
  }

  if (
    request.requireExplicitWhenMultiple === true &&
    !requestedMethod &&
    activeMethods.length > 1
  ) {
    throw new Error(
      `Escolha Pix, boleto ou cartao antes de iniciar o checkout ${request.modalidadeLabel || "do curso"}.`,
    );
  }

  const billingType = requestedMethod || activeMethods[0];
  if (!activeMethods.includes(billingType)) {
    throw new Error(
      `Este curso nao permite pagamento por ${paymentMethodLabel(billingType)}.`,
    );
  }

  return {
    billingType,
    installmentCount: billingType === "CREDIT_CARD"
      ? resolveCardInstallments(financeiroConfig, request.installments)
      : 1,
    requestedExplicitly: Boolean(requestedMethod),
  };
};

export const resolveCourseConfiguredPayment = (
  course: any,
  request: CoursePaymentRequest = {},
) => {
  const financeiroConfig = normalizeCourseFinanceiroConfig(course?.financeiro_config || {});
  if (request.method !== undefined || request.requireExplicitWhenMultiple === true) {
    const selection = resolveCoursePaymentSelection(financeiroConfig, request);
    return {
      financeiroConfig,
      ...selection,
    };
  }
  return {
    financeiroConfig,
    billingType: resolveBillingType(financeiroConfig.metodosRecebimento),
    installmentCount: null,
    requestedExplicitly: false,
  };
};
