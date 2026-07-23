export const MERCADO_PAGO_WEBHOOK_PROVIDER_CODE = "mercado_pago" as const;
export const PENDENTE_INSCRICAO_STATUS = "AGUARDANDO_PAGAMENTO";
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

export const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
};

export const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
  }
  return null;
};

export const normalizeRemotePaymentId = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const paymentPathMatch = text.match(/\/payments?\/([^/?#]+)/i);
  if (paymentPathMatch?.[1]) return decodeURIComponent(paymentPathMatch[1]);
  const urlLikeMatch = text.match(/(?:^|[?&])id=([^&#]+)/i);
  if (urlLikeMatch?.[1]) return decodeURIComponent(urlLikeMatch[1]);
  return text;
};
