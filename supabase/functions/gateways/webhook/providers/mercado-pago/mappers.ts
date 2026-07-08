import { PENDENTE_INSCRICAO_STATUS } from "./shared.ts";

export const statusForMercadoPago = (status: unknown) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (["approved", "paid", "processed"].includes(normalized)) return "PAGO";
  if (["cancelled", "rejected", "refunded", "charged_back"].includes(normalized)) {
    return "CANCELADO";
  }
  if (["pending", "in_process", "authorized", "action_required"].includes(normalized)) {
    return PENDENTE_INSCRICAO_STATUS;
  }
  return null;
};

export const methodForMercadoPago = (
  payment: Record<string, unknown>,
  fallback?: string | null,
) => {
  const methodId = String(payment.payment_method_id || "").toLowerCase();
  const typeId = String(payment.payment_type_id || "").toLowerCase();
  if (methodId === "pix" || typeId === "bank_transfer") return "PIX";
  if (typeId === "credit_card") return "CREDIT_CARD";
  if (typeId === "ticket") return "BOLETO";
  return fallback || null;
};

export const legacyPaymentMethod = (method: string | null) => {
  if (method === "CREDIT_CARD") return "CARTAO";
  if (method === "BOLETO") return "BOLETO";
  return "PIX";
};
