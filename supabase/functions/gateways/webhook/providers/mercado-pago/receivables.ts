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
    receivable: any;
    payment: Record<string, unknown>;
    localStatus: string | null;
    paymentMethod: string | null;
  },
) => {
  const { receivable, payment, localStatus, paymentMethod } = input;
  const currentPaid = String(receivable.status || "").toUpperCase() === "PAGO";
  const invoiceUrl = transactionUrlFor(payment) ||
    receivable.gateway_invoice_url ||
    null;
  const pix = pixPayloadFor(payment);
  const installments = installmentsFor(payment, receivable);

  const updates: Record<string, unknown> = {
    gateway_provider: MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
    gateway_environment: context.environment,
    gateway_payment_method: paymentMethod || receivable.gateway_payment_method,
    gateway_installments: installments,
    gateway_payment_id: normalizeRemotePaymentId(
      firstString(payment.id, context.remotePaymentId, receivable.gateway_payment_id),
    ),
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
  } else if (localStatus === "CANCELADO" && !currentPaid) {
    updates.status = "CANCELADO";
  }

  const { error } = await context.admin
    .from("contas_receber")
    .update(updates)
    .eq("id", receivable.id);
  if (error) throw error;

  return {
    invoiceUrl,
    installments,
    pixPayload: pix.payload,
    pixEncodedImage: pix.encodedImage,
  };
};
