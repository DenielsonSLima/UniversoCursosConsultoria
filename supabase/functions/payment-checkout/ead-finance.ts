import type { EadCharge, GatewayPaymentMethod } from "./types.ts";
import { dueDateInDays, normalizePaymentMethod, roundMoney } from "./utils.ts";

type CourseFinanceiroConfig = {
  parcelasPadrao: number;
  metodosRecebimento: {
    pix: boolean;
    boleto: boolean;
    cartao: boolean;
  };
  cartao: {
    aceitar: boolean;
    maxParcelas: number;
  };
};

const normalizeFinanceiroConfig = (
  config: any = {},
): CourseFinanceiroConfig => {
  const metodos = config?.metodosRecebimento || {};
  const cartao = config?.cartao || {};
  const parcelasPadrao = Math.max(
    1,
    Math.floor(Number(config?.parcelasPadrao || 1)),
  );
  const cartaoAtivo = metodos.cartao !== false && cartao.aceitar !== false;
  const maxParcelas = cartaoAtivo
    ? Math.max(
      parcelasPadrao,
      Math.floor(Number(cartao?.maxParcelas || parcelasPadrao || 1)),
    )
    : 1;

  return {
    parcelasPadrao,
    metodosRecebimento: {
      pix: metodos.pix !== false,
      boleto: metodos.boleto !== false,
      cartao: metodos.cartao !== false,
    },
    cartao: {
      aceitar: cartao.aceitar !== false,
      maxParcelas: Math.max(1, Math.min(21, maxParcelas)),
    },
  };
};

const activeMethodsFor = (
  financeiroConfig: CourseFinanceiroConfig,
): GatewayPaymentMethod[] => {
  const methods: GatewayPaymentMethod[] = [];
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

const methodLabel = (method: GatewayPaymentMethod) => {
  if (method === "PIX") return "Pix";
  if (method === "BOLETO") return "boleto";
  return "cartao";
};

const resolveInstallmentCount = (
  financeiroConfig: CourseFinanceiroConfig,
  method: GatewayPaymentMethod,
  requestedInstallments: unknown,
) => {
  if (method !== "CREDIT_CARD") return 1;
  const maxInstallments = Math.max(
    1,
    Math.min(21, Math.floor(financeiroConfig.cartao.maxParcelas || 1)),
  );
  const defaultInstallments = Math.max(
    1,
    Math.min(maxInstallments, Math.floor(financeiroConfig.parcelasPadrao || 1)),
  );
  if (
    requestedInstallments === undefined || requestedInstallments === null ||
    requestedInstallments === ""
  ) {
    return defaultInstallments;
  }

  const requested = Number(requestedInstallments);
  if (
    !Number.isFinite(requested) || !Number.isInteger(requested) || requested < 1
  ) {
    throw new Error("Quantidade de parcelas invalida para o cartao.");
  }
  if (requested > maxInstallments) {
    throw new Error(
      `Este curso EAD permite no maximo ${maxInstallments} parcelas no cartao.`,
    );
  }

  return requested;
};

export const buildCoursePaymentDescription = (courseName: string) =>
  `${courseName} - Inscricao Online - Universo Cursos e Consultoria`;

export const resolveEadCharge = (
  course: any,
  input: { method?: unknown; installments?: unknown },
): EadCharge => {
  const financeiroConfig = normalizeFinanceiroConfig(
    course?.financeiro_config || {},
  );
  const activeMethods = activeMethodsFor(financeiroConfig);
  if (activeMethods.length === 0) {
    throw new Error(
      "Nenhuma forma de recebimento configurada para este curso EAD.",
    );
  }

  const requestedMethod = normalizePaymentMethod(input.method);
  if (input.method && !requestedMethod) {
    throw new Error("Forma de pagamento EAD invalida.");
  }
  if (!requestedMethod && activeMethods.length > 1) {
    throw new Error(
      "Escolha Pix, boleto ou cartao antes de iniciar o pagamento do EAD.",
    );
  }

  const method = requestedMethod || activeMethods[0];
  if (!activeMethods.includes(method)) {
    throw new Error(
      `Este curso EAD nao permite pagamento por ${methodLabel(method)}.`,
    );
  }

  const value = roundMoney(course?.valor);
  if (!value || value <= 0) {
    throw new Error("Valor do curso EAD ainda nao configurado para cobranca.");
  }

  return {
    method,
    installmentCount: resolveInstallmentCount(
      financeiroConfig,
      method,
      input.installments,
    ),
    value,
    description: buildCoursePaymentDescription(
      String(course?.nome || "Curso EAD"),
    ),
    dueDate: dueDateInDays(7),
  };
};
