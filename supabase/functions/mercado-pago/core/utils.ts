import { MERCADO_PAGO_PROVIDER_CODE } from "./constants.ts";
import type { AdapterPayer, Environment } from "./types.ts";

export const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

export const stringValue = (value: unknown) => String(value ?? "").trim();

export const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return "";
};

export const onlyDigits = (value: unknown) =>
  stringValue(value).replace(/\D/g, "");

const cpfDigit = (base: string, weight: number) => {
  const rest =
    (base.split("").reduce((sum, item) => sum + Number(item) * weight--, 0) *
      10) % 11;
  return rest === 10 ? 0 : rest;
};

export const isValidCpf = (value: unknown) => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  return cpfDigit(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    cpfDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

export const readResponseBody = async (response: Response) => {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const endpointUrl = (
  baseSupabaseUrl: string,
  providerCode: string,
  environment: Environment,
) => {
  const normalizedBase = baseSupabaseUrl.replace(/\/+$/, "");
  return `${normalizedBase}/functions/v1/payment-gateway-webhook/${providerCode}?environment=${environment}`;
};

export const mercadoPagoWebhookUrl = (
  baseSupabaseUrl: string,
  environment: Environment,
) => endpointUrl(baseSupabaseUrl, MERCADO_PAGO_PROVIDER_CODE, environment);

export const payerNameParts = (payer: AdapterPayer) => {
  const fullName = firstString(payer.name, payer.nome);
  const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: firstName || undefined,
    lastName: rest.join(" ") || undefined,
  };
};

export const payerIdentification = (payer: AdapterPayer) => {
  const document = onlyDigits(
    payer.cpfCnpj ?? payer.cpf_cnpj ?? payer.cpf ?? payer.cnpj,
  );
  if (!document) return undefined;
  if (document.length === 11 && !isValidCpf(document)) return undefined;
  if (document.length !== 11 && document.length !== 14) return undefined;
  return {
    type: document.length > 11 ? "CNPJ" : "CPF",
    number: document,
  };
};

export const pixExpirationDuration = (dueDate?: string | null) => {
  if (!dueDate) return undefined;
  const due = new Date(`${dueDate}T23:59:59-03:00`);
  if (Number.isNaN(due.getTime())) return undefined;

  const diffMs = due.getTime() - Date.now();
  const minMs = 30 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs <= minMs) return "PT30M";

  const days = Math.min(30, Math.max(1, Math.ceil(diffMs / dayMs)));
  return `P${days}D`;
};
