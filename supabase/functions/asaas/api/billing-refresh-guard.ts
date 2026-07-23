const TERMINAL_RECEIVABLE_STATUSES = new Set([
  "PAGO",
  "CANCELADO",
  "ESTORNADO",
  "DEVOLVIDO",
]);

export const ASAAS_REFRESH_IDENTITY_FIELDS = [
  "gateway_provider",
  "gateway_environment",
  "gateway_payment_method",
  "gateway_payment_id",
  "gateway_payment_link_id",
  "gateway_boleto_nosso_numero",
  "gateway_customer_id",
  "gateway_installment_id",
  "asaas_payment_id",
  "asaas_payment_link_id",
  "nosso_numero_asaas",
  "asaas_installment_id",
] as const;

const normalizedValue = (value: unknown) =>
  value === null || value === undefined ? null : String(value);

export const hasAsaasRefreshIdentityChanged = (
  before: Record<string, unknown>,
  current: Record<string, unknown>,
) =>
  ASAAS_REFRESH_IDENTITY_FIELDS.some((field) =>
    normalizedValue(before?.[field]) !== normalizedValue(current?.[field])
  );

export const isManualReceivableSettlement = (
  receivable: Record<string, unknown>,
) =>
  String(receivable?.status || "").toUpperCase() === "PAGO" &&
  String(receivable?.origem_pagamento || "").toUpperCase() === "PRESENCIAL";

export const isTerminalReceivable = (receivable: Record<string, unknown>) =>
  TERMINAL_RECEIVABLE_STATUSES.has(
    String(receivable?.status || "").toUpperCase(),
  );

export const shouldPreserveReceivableAfterRefreshConflict = (
  receivable: Record<string, unknown>,
) =>
  isManualReceivableSettlement(receivable) || isTerminalReceivable(receivable);

export const asaasRefreshReviewMessage = (input: {
  reason: string;
  paymentId?: unknown;
  paymentStatus?: unknown;
}) =>
  [
    "REVISAO_ASAAS_REFRESH",
    input.reason,
    input.paymentId ? `payment_id=${String(input.paymentId)}` : null,
    input.paymentStatus ? `remote_status=${String(input.paymentStatus)}` : null,
    "estado local preservado; exige conciliacao manual",
  ].filter(Boolean).join(" | ");
