import { PENDENTE_INSCRICAO_STATUS } from "./shared.ts";

export const statusForMercadoPago = (status: unknown) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (["approved", "paid"].includes(normalized)) return "PAGO";
  if (
    [
      "pending",
      "in_process",
      "authorized",
      "action_required",
      "cancelled",
      "rejected",
      "refunded",
      "charged_back",
      "in_mediation",
    ].includes(normalized)
  ) {
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

export const requiresMercadoPagoReversalReview = (status: unknown) =>
  ["refunded", "charged_back", "in_mediation"].includes(
    String(status || "").trim().toLowerCase(),
  );

const positiveNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export type MercadoPagoReviewReason =
  | "payment_in_mediation"
  | "payment_refunded"
  | "payment_charged_back"
  | "payment_partially_refunded";

export const mercadoPagoReviewReason = (
  payment: Record<string, unknown>,
): MercadoPagoReviewReason | null => {
  const status = String(payment.status || "").trim().toLowerCase();
  if (status === "in_mediation") return "payment_in_mediation";
  if (status === "refunded") return "payment_refunded";
  if (status === "charged_back") return "payment_charged_back";

  const statusDetail = String(payment.status_detail || "")
    .trim()
    .toLowerCase();
  if (
    positiveNumber(payment.transaction_amount_refunded) !== null ||
    statusDetail === "partially_refunded"
  ) {
    return "payment_partially_refunded";
  }
  return null;
};
