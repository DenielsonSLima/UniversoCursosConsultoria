import type { AsaasBillingType, CourseFinanceiroConfig } from "../core/payment-methods.ts";
import { resolveEadInstallmentCount } from "./installments.ts";

export type EadCheckoutMethod = "PIX" | "BOLETO" | "CREDIT_CARD";

export interface EadCheckoutPaymentRequest {
  method?: unknown;
  installments?: unknown;
}

export interface ResolvedEadPaymentSelection {
  billingType: EadCheckoutMethod;
  installmentCount: number;
  requestedExplicitly: boolean;
}

const METHOD_ALIASES: Record<string, EadCheckoutMethod> = {
  PIX: "PIX",
  BOLETO: "BOLETO",
  CARTAO: "CREDIT_CARD",
  CARTÃO: "CREDIT_CARD",
  CARD: "CREDIT_CARD",
  CREDIT_CARD: "CREDIT_CARD",
};

const normalizeMethod = (method: unknown): EadCheckoutMethod | null => {
  const normalized = String(method || "").trim().toUpperCase();
  if (!normalized) return null;
  return METHOD_ALIASES[normalized] || null;
};

const activeMethodsFor = (financeiroConfig: CourseFinanceiroConfig): EadCheckoutMethod[] => {
  const methods: EadCheckoutMethod[] = [];
  if (financeiroConfig.metodosRecebimento.pix) methods.push("PIX");
  if (financeiroConfig.metodosRecebimento.boleto) methods.push("BOLETO");
  if (financeiroConfig.metodosRecebimento.cartao && financeiroConfig.cartao.aceitar) methods.push("CREDIT_CARD");
  return methods;
};

const methodLabel = (method: AsaasBillingType) => {
  if (method === "PIX") return "Pix";
  if (method === "BOLETO") return "boleto";
  if (method === "CREDIT_CARD") return "cartão";
  return "pagamento";
};

export const resolveEadPaymentSelection = (
  financeiroConfig: CourseFinanceiroConfig,
  request: EadCheckoutPaymentRequest = {},
): ResolvedEadPaymentSelection => {
  const activeMethods = activeMethodsFor(financeiroConfig);
  if (activeMethods.length === 0) {
    throw new Error("Nenhuma forma de recebimento configurada para este curso EAD.");
  }

  const requestedMethod = normalizeMethod(request.method);
  if (request.method && !requestedMethod) {
    throw new Error("Forma de pagamento EAD inválida.");
  }

  if (!requestedMethod && activeMethods.length > 1) {
    throw new Error("Escolha Pix, boleto ou cartão antes de iniciar o pagamento do EAD.");
  }

  const billingType = requestedMethod || activeMethods[0];
  if (!activeMethods.includes(billingType)) {
    throw new Error(`Este curso EAD não permite pagamento por ${methodLabel(billingType)}.`);
  }

  return {
    billingType,
    installmentCount: billingType === "CREDIT_CARD"
      ? resolveEadInstallmentCount(financeiroConfig, request.installments)
      : 1,
    requestedExplicitly: Boolean(requestedMethod),
  };
};
