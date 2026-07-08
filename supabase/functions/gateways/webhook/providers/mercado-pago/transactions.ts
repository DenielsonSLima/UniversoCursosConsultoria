import type { GatewayWebhookContext } from "../../types.ts";
import { installmentsFor } from "./normalizers.ts";
import {
  firstNumber,
  firstString,
  MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
  normalizeRemotePaymentId,
} from "./shared.ts";

export const syncMercadoPagoTransaction = async (
  context: GatewayWebhookContext,
  input: {
    receivable: any;
    payment: Record<string, unknown>;
    paymentMethod: string | null;
    invoiceUrl: string | null;
    pixPayload: string | null;
    pixEncodedImage: string | null;
  },
) => {
  const remotePaymentId = normalizeRemotePaymentId(
    firstString(input.payment.id, context.remotePaymentId),
  );
  if (!remotePaymentId) return;

  const preferenceId = firstString(
    input.payment.preference_id,
    input.receivable.gateway_payment_link_id,
  );
  const amount = firstNumber(
    input.payment.transaction_amount,
    input.payment.total_paid_amount,
    input.receivable.valor,
  );
  const installments = installmentsFor(input.payment, input.receivable);
  const payload = {
    receivable_id: input.receivable.id,
    provider_code: MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
    environment: context.environment,
    payment_method: input.paymentMethod || input.receivable.gateway_payment_method,
    installments,
    remote_payment_id: remotePaymentId,
    remote_payment_link_id: preferenceId ||
      input.receivable.gateway_payment_link_id,
    remote_status: firstString(input.payment.status, input.receivable.gateway_status),
    amount: amount ?? input.receivable.valor,
    invoice_url: input.invoiceUrl || input.receivable.gateway_invoice_url,
    bank_slip_url: input.paymentMethod === "BOLETO"
      ? input.invoiceUrl || input.receivable.gateway_bank_slip_url
      : null,
    pix_payload: input.paymentMethod === "PIX"
      ? input.pixPayload || input.receivable.gateway_pix_payload
      : null,
    pix_encoded_image: input.paymentMethod === "PIX"
      ? input.pixEncodedImage || input.receivable.gateway_pix_encoded_image
      : null,
    raw_payload: input.payment,
    last_error: null,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await context.admin
    .from("payment_gateway_transactions")
    .select("id")
    .eq("provider_code", MERCADO_PAGO_WEBHOOK_PROVIDER_CODE)
    .eq("environment", context.environment)
    .eq("receivable_id", input.receivable.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const result = existing?.id
    ? await context.admin.from("payment_gateway_transactions").update(payload)
      .eq("id", existing.id)
    : await context.admin.from("payment_gateway_transactions").insert(payload);
  if (result.error) throw result.error;
};
