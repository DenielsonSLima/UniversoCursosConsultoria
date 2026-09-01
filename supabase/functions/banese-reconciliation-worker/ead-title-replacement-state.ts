type ReplacementIdentity = { nossoNumero?: string };

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export const hasPixPair = (receivable: any) =>
  Boolean(
    String(receivable?.gateway_pix_payload || "").trim() &&
      String(receivable?.gateway_pix_encoded_image || "").trim(),
  );

export const hasPartialPix = (receivable: any) =>
  Boolean(String(receivable?.gateway_pix_payload || "").trim()) !==
    Boolean(String(receivable?.gateway_pix_encoded_image || "").trim());

export const hasRecoverablePendingPix = (reconciliation: any) =>
  reconciliation?.paid === false &&
  String(reconciliation?.remoteStatus || "").trim().toUpperCase() ===
    "PENDING" &&
  hasPixPair(reconciliation?.receivable) &&
  String(reconciliation?.receivable?.gateway_status || "").trim()
      .toUpperCase() === "PENDING";

export const reconciliationIsPaid = (reconciliation: any) =>
  reconciliation?.paid === true ||
  String(reconciliation?.receivable?.status || "").trim().toUpperCase() ===
    "PAGO";

type ReissueState =
  | "RESET"
  | "RESERVED"
  | "AMBIGUOUS"
  | "REGISTERED_INCOMPLETE"
  | "REGISTERED_COMPLETE";

export const classifyReissueState = (
  claim: ReplacementIdentity,
  receivable: any,
): { state: ReissueState; nossoNumero: string | null } => {
  const nossoNumero = digits(receivable.gateway_boleto_nosso_numero);
  if (!/^\d{9}$/.test(nossoNumero) || nossoNumero === claim.nossoNumero) {
    return { state: "RESET", nossoNumero: null };
  }
  const submission = String(receivable.gateway_submission_status || "")
    .trim().toUpperCase();
  if (submission === "API_AMBIGUOUS") {
    return { state: "AMBIGUOUS", nossoNumero };
  }
  const complete = digits(receivable.gateway_payment_id) === nossoNumero &&
    digits(receivable.gateway_boleto_linha_digitavel).length === 47 &&
    digits(receivable.gateway_boleto_codigo_barras).length === 44;
  if (submission === "API_REGISTERED") {
    return {
      state: complete ? "REGISTERED_COMPLETE" : "REGISTERED_INCOMPLETE",
      nossoNumero,
    };
  }
  const creating = String(receivable.gateway_status || "").toUpperCase() ===
      "CREATING" && !receivable.gateway_boleto_linha_digitavel &&
    !receivable.gateway_boleto_codigo_barras;
  return { state: creating ? "RESERVED" : "REGISTERED_INCOMPLETE", nossoNumero };
};
