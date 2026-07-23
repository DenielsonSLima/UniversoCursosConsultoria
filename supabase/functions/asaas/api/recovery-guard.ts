const normalized = (value: unknown) => String(value || "").trim().toUpperCase();
const normalizedDate = (value: unknown) => String(value || "").slice(0, 10);
const moneyInCents = (value: unknown) =>
  Math.round((Number(value) + Number.EPSILON) * 100);

export const remoteAsaasPaymentMatchesReceivable = (input: {
  payment: any;
  receivableId: unknown;
  value: unknown;
  billingType: unknown;
  dueDate: unknown;
}) => {
  const { payment } = input;
  if (String(payment?.externalReference || "") !== String(input.receivableId)) {
    return false;
  }
  if (
    !normalized(input.billingType) ||
    normalized(input.billingType) === "UNDEFINED"
  ) {
    return false;
  }
  if (normalized(payment?.billingType) !== normalized(input.billingType)) {
    return false;
  }
  if (moneyInCents(payment?.value) !== moneyInCents(input.value)) return false;
  if (normalizedDate(payment?.dueDate) !== normalizedDate(input.dueDate)) {
    return false;
  }
  // Este serviço emite cada recebível individualmente. Um installment remoto
  // identifica outro contrato e nunca pode ser adotado por externalReference.
  return !payment?.installment && !payment?.installmentId;
};

export const remoteDetachedLinkMatchesReceivable = (input: {
  paymentLink: any;
  receivableId: unknown;
  value: unknown;
  billingType: unknown;
}) => {
  const { paymentLink } = input;
  if (
    String(paymentLink?.externalReference || "") !==
      String(input.receivableId)
  ) return false;
  if (
    !normalized(input.billingType) ||
    normalized(input.billingType) === "UNDEFINED"
  ) {
    return false;
  }
  if (normalized(paymentLink?.billingType) !== normalized(input.billingType)) {
    return false;
  }
  if (moneyInCents(paymentLink?.value) !== moneyInCents(input.value)) {
    return false;
  }
  if (normalized(paymentLink?.chargeType) !== "DETACHED") return false;
  if (!String(paymentLink?.url || "").trim()) return false;
  return String(paymentLink?.deleted || "false").toLowerCase() !== "true";
};

export const selectUniqueAsaasRecoveryCandidate = <T>(input: {
  candidates: T[];
  externalReference: unknown;
  isInactive: (candidate: T) => boolean;
  matches: (candidate: T) => boolean;
  label: string;
}): T | null => {
  const relevant = (input.candidates || []).filter((candidate: any) =>
    String(candidate?.externalReference || "") ===
      String(input.externalReference) && !input.isInactive(candidate)
  );
  if (!relevant.length) return null;
  const matching = relevant.filter(input.matches);
  if (relevant.length !== 1 || matching.length !== 1) {
    throw new Error(
      `REVISAO_ASAAS_RECOVERY: ${input.label} por externalReference possui candidato divergente ou duplicado; nenhum vínculo foi adotado.`,
    );
  }
  return matching[0];
};
