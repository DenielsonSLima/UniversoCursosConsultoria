import type {
  GatewayEnvironment,
  GatewayPaymentMethod,
  GatewayProviderCode,
} from "./types.ts";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PENDENTE_INSCRICAO_STATUS = "AGUARDANDO_PAGAMENTO";

export const onlyDigits = (value: unknown) =>
  String(value || "").replace(/\D/g, "");

export const roundMoney = (value: unknown) => {
  const parsed = Number(value || 0);
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100) / 100;
};

export const dueDateInDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const normalizeErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message || "Erro interno.";
  if (typeof error === "string") return error;
  const message = (error as Record<string, unknown>)?.message;
  return message ? String(message) : "Erro interno.";
};

export const isValidCpf = (value: unknown) => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (base: string, weight: number) => {
    const rest =
      (base.split("").reduce((sum, item) => sum + Number(item) * weight--, 0) *
        10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    digit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

export const documentForGateway = (value: unknown) => {
  const document = onlyDigits(value);
  if (!document) return "";
  if (document.length === 11) return isValidCpf(document) ? document : "";
  if (document.length === 14) return document;
  return "";
};

export const normalizeEnvironment = (value: unknown): GatewayEnvironment =>
  value === "production" ? "production" : "sandbox";

export const normalizePaymentMethod = (
  value: unknown,
): GatewayPaymentMethod | null => {
  const method = String(value || "").trim().toUpperCase();
  if (method === "PIX" || method === "BOLETO" || method === "CREDIT_CARD") {
    return method;
  }
  if (method === "CARTAO" || method === "CARTÃO" || method === "CARD") {
    return "CREDIT_CARD";
  }
  return null;
};

export const normalizeProviderCode = (
  value: unknown,
): GatewayProviderCode | null => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "asaas" || raw === "asaas-checkout" || raw === "asaas_checkout") {
    return "asaas";
  }
  if (
    raw === "mercado_pago" || raw === "mercado-pago" || raw === "mercado pago" ||
    raw === "mercado pago checkout" || raw === "mercadopago"
  ) {
    return "mercado_pago";
  }
  if (
    raw === "banese_card" || raw === "banese" || raw === "banese-card" ||
    raw === "banese checkout" || raw === "banese_card_checkout" ||
    raw === "banesecard"
  ) {
    return "banese_card";
  }
  return null;
};

export const paymentMethodForLegacyField = (method: GatewayPaymentMethod) =>
  method === "CREDIT_CARD" ? "CARTAO" : method;

export const providerLabelFor = (
  providerCode: GatewayProviderCode | string,
) => {
  if (providerCode === "mercado_pago") return "Mercado Pago";
  if (providerCode === "banese_card") return "Banese Card";
  if (providerCode === "asaas") return "Asaas";
  return "Gateway desconhecido";
};

export const publicBaseUrl = () => {
  const candidates = [
    Deno.env.get("PUBLIC_SITE_URL"),
    Deno.env.get("SITE_URL"),
    Deno.env.get("APP_URL"),
    Deno.env.get("VITE_PUBLIC_SITE_URL"),
    "https://universocc.com.br",
  ];
  for (const candidate of candidates) {
    try {
      const url = new URL(String(candidate || ""));
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.origin.replace(/\/+$/, "");
      }
    } catch {
      // Try next candidate.
    }
  }
  return "https://universocc.com.br";
};

export const gatewayWebhookBaseUrl = (supabaseUrl: string) =>
  supabaseUrl.replace(/\/+$/, "");
