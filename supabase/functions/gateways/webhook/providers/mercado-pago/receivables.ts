import type { GatewayWebhookContext } from "../../types.ts";
import { legacyPaymentMethod } from "./mappers.ts";
import {
  installmentsFor,
  paymentDate,
  pixPayloadFor,
  transactionUrlFor,
} from "./normalizers.ts";
import {
  asRecord,
  firstNumber,
  firstString,
  MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
  normalizeRemotePaymentId,
  UUID_RE,
} from "./shared.ts";

export const mercadoPagoReviewMessage = (
  reason: string,
  remotePaymentId: string | null,
) =>
  [
    "REVISAO_MERCADO_PAGO",
    reason,
    remotePaymentId ? `payment_id=${remotePaymentId}` : null,
    "baixa preservada; exige conciliacao manual",
  ].filter(Boolean).join(" | ");

export const persistMercadoPagoReview = async (
  context: GatewayWebhookContext,
  input: {
    receivableId: string;
    remotePaymentId: string | null;
    reason: string;
  },
) => {
  const message = mercadoPagoReviewMessage(
    input.reason,
    input.remotePaymentId,
  );
  const now = new Date().toISOString();
  const { error: receivableError } = await context.admin
    .from("contas_receber")
    .update({
      gateway_last_error: message,
      gateway_synced_at: now,
      updated_at: now,
    })
    .eq("id", input.receivableId);
  if (receivableError) throw receivableError;

  if (input.remotePaymentId) {
    const { error: transactionError } = await context.admin
      .from("payment_gateway_transactions")
      .update({
        last_error: message,
        synced_at: now,
        updated_at: now,
      })
      .eq("provider_code", MERCADO_PAGO_WEBHOOK_PROVIDER_CODE)
      .eq("environment", context.environment)
      .eq("remote_payment_id", input.remotePaymentId);
    if (transactionError) throw transactionError;
  }

  return message;
};

export type MercadoPagoProjectionOutcome =
  | "apply"
  | "preserve_paid_non_settlement"
  | "duplicate_paid_same_payment"
  | "duplicate_paid_other_payment";

export const decideMercadoPagoProjection = (input: {
  currentStatus: unknown;
  currentPaymentId: unknown;
  incomingPaymentId: unknown;
  incomingLocalStatus: string | null;
}): MercadoPagoProjectionOutcome => {
  if (String(input.currentStatus || "").toUpperCase() !== "PAGO") {
    return "apply";
  }
  if (input.incomingLocalStatus !== "PAGO") {
    return "preserve_paid_non_settlement";
  }

  const currentPaymentId = normalizeRemotePaymentId(input.currentPaymentId);
  const incomingPaymentId = normalizeRemotePaymentId(input.incomingPaymentId);
  return currentPaymentId && incomingPaymentId &&
      currentPaymentId === incomingPaymentId
    ? "duplicate_paid_same_payment"
    : "duplicate_paid_other_payment";
};

export const findMercadoPagoReceivable = async (
  context: GatewayWebhookContext,
  payment: Record<string, unknown>,
) => {
  const metadata = asRecord(payment.metadata);
  const receivableId = firstString(
    payment.external_reference,
    metadata.receivable_id,
    metadata.receivableId,
  );

  if (UUID_RE.test(receivableId)) {
    const { data, error } = await context.admin
      .from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .eq("gateway_provider", MERCADO_PAGO_WEBHOOK_PROVIDER_CODE)
      .eq("gateway_environment", context.environment)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const paymentId = normalizeRemotePaymentId(
    firstString(payment.id, context.remotePaymentId),
  );
  if (paymentId) {
    const { data: transaction, error } = await context.admin
      .from("payment_gateway_transactions")
      .select("receivable_id")
      .eq("provider_code", MERCADO_PAGO_WEBHOOK_PROVIDER_CODE)
      .eq("environment", context.environment)
      .eq("remote_payment_id", paymentId)
      .maybeSingle();
    if (error) throw error;
    if (transaction?.receivable_id) {
      const { data, error: receivableError } = await context.admin
        .from("contas_receber")
        .select("*")
        .eq("id", transaction.receivable_id)
        .maybeSingle();
      if (receivableError) throw receivableError;
      if (data) return data;
    }
  }

  return null;
};

export const updateMercadoPagoReceivable = async (
  context: GatewayWebhookContext,
  input: {
    receivable: Record<string, unknown>;
    payment: Record<string, unknown>;
    localStatus: string | null;
    paymentMethod: string | null;
  },
) => {
  const { receivable, payment, localStatus, paymentMethod } = input;
  const incomingPaymentId = normalizeRemotePaymentId(
    firstString(payment.id, context.remotePaymentId),
  );
  const invoiceUrl = transactionUrlFor(payment) ||
    receivable.gateway_invoice_url ||
    null;
  const pix = pixPayloadFor(payment);
  const installments = installmentsFor(payment, receivable);
  const initialProjection = decideMercadoPagoProjection({
    currentStatus: receivable.status,
    currentPaymentId: receivable.gateway_payment_id,
    incomingPaymentId,
    incomingLocalStatus: localStatus,
  });

  const projectionResult = (
    projection: MercadoPagoProjectionOutcome,
    projectedReceivable: Record<string, unknown>,
    applied: boolean,
  ) => ({
    invoiceUrl,
    installments,
    pixPayload: pix.payload,
    pixEncodedImage: pix.encodedImage,
    projection,
    applied,
    reviewRequired: projection === "duplicate_paid_other_payment",
    receivable: projectedReceivable,
  });

  if (initialProjection !== "apply") {
    return projectionResult(initialProjection, receivable, false);
  }

  const updates: Record<string, unknown> = {
    gateway_provider: MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
    gateway_environment: context.environment,
    gateway_payment_method: paymentMethod || receivable.gateway_payment_method,
    gateway_installments: installments,
    gateway_payment_id: incomingPaymentId || receivable.gateway_payment_id,
    gateway_payment_link_id: firstString(
      payment.preference_id,
      receivable.gateway_payment_link_id,
    ),
    gateway_invoice_url: invoiceUrl,
    gateway_bank_slip_url: paymentMethod === "BOLETO"
      ? invoiceUrl || receivable.gateway_bank_slip_url
      : null,
    gateway_pix_payload: paymentMethod === "PIX"
      ? pix.payload || receivable.gateway_pix_payload
      : null,
    gateway_pix_encoded_image: paymentMethod === "PIX"
      ? pix.encodedImage || receivable.gateway_pix_encoded_image
      : null,
    gateway_transaction_receipt_url: firstString(
      asRecord(payment.transaction_details).external_resource_url,
      receivable.gateway_transaction_receipt_url,
    ) || null,
    gateway_status: firstString(payment.status, receivable.gateway_status),
    gateway_last_error: null,
    gateway_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (localStatus === "PAGO") {
    updates.status = "PAGO";
    updates.valor_pago = firstNumber(
      payment.transaction_amount,
      payment.total_paid_amount,
      receivable.valor,
    );
    updates.data_pagamento = paymentDate(payment);
    updates.forma_pagamento = legacyPaymentMethod(paymentMethod);
    updates.origem_pagamento = "MERCADO_PAGO";
  } else if (localStatus === "CANCELADO") {
    updates.status = "CANCELADO";
  }

  const { data: updatedReceivable, error } = await context.admin
    .from("contas_receber")
    .update(updates)
    .eq("id", receivable.id)
    .neq("status", "PAGO")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (updatedReceivable) {
    return projectionResult("apply", updatedReceivable, true);
  }

  // Uma notificacao concorrente pode ter liquidado o recebivel depois da
  // leitura inicial. Releia e derive o resultado sem sobrescrever a baixa.
  const { data: currentReceivable, error: currentError } = await context.admin
    .from("contas_receber")
    .select("*")
    .eq("id", receivable.id)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!currentReceivable) {
    throw new Error("Recebivel Mercado Pago nao encontrado apos concorrencia.");
  }

  const concurrentProjection = decideMercadoPagoProjection({
    currentStatus: currentReceivable.status,
    currentPaymentId: currentReceivable.gateway_payment_id,
    incomingPaymentId,
    incomingLocalStatus: localStatus,
  });
  if (concurrentProjection === "apply") {
    throw new Error("Falha ao projetar pagamento Mercado Pago no recebivel.");
  }
  return projectionResult(concurrentProjection, currentReceivable, false);
};
