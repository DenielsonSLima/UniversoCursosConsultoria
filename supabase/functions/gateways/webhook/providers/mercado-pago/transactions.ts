import type { GatewayWebhookContext } from "../../types.ts";
import { installmentsFor } from "./normalizers.ts";
import {
  firstNumber,
  firstString,
  MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
  normalizeRemotePaymentId,
} from "./shared.ts";

const preferenceIdFromUrl = (value: unknown) => {
  const raw = firstString(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return firstString(
      url.searchParams.get("pref_id"),
      url.searchParams.get("preference_id"),
    );
  } catch {
    return "";
  }
};

const looksLikeMercadoPagoPreferenceId = (value: string) =>
  value.includes("-") && !/^https?:\/\//i.test(value);

export const mercadoPagoPreferenceIdFor = (
  payment: Record<string, unknown>,
  receivable: Record<string, unknown>,
) => {
  const explicitPreferenceId = firstString(payment.preference_id);
  if (explicitPreferenceId) return explicitPreferenceId;

  const preferenceIdInUrl = firstString(
    preferenceIdFromUrl(receivable.gateway_payment_link_id),
    preferenceIdFromUrl(receivable.gateway_invoice_url),
  );
  if (preferenceIdInUrl) return preferenceIdInUrl;

  const initialRemoteId = firstString(receivable.gateway_payment_id);
  return looksLikeMercadoPagoPreferenceId(initialRemoteId)
    ? initialRemoteId
    : "";
};

const findTransactionByRemotePaymentId = async (
  context: GatewayWebhookContext,
  value: string,
  receivableId?: string,
) => {
  let query = context.admin
    .from("payment_gateway_transactions")
    .select("id, receivable_id, remote_payment_id, remote_payment_link_id")
    .eq("provider_code", MERCADO_PAGO_WEBHOOK_PROVIDER_CODE)
    .eq("environment", context.environment)
    .eq("remote_payment_id", value);
  if (receivableId) query = query.eq("receivable_id", receivableId);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
};

export const findMercadoPagoTransactionForPayment = async (
  context: GatewayWebhookContext,
  input: {
    receivableId: string;
    remotePaymentId: string;
    preferenceId?: string | null;
  },
) => {
  const exact = await findTransactionByRemotePaymentId(
    context,
    input.remotePaymentId,
  );
  if (exact) {
    if (
      exact.receivable_id &&
      String(exact.receivable_id) !== String(input.receivableId)
    ) {
      throw new Error(
        "Pagamento Mercado Pago ja associado a outro recebivel.",
      );
    }
    return exact;
  }

  const preferenceId = firstString(input.preferenceId);
  if (!preferenceId) return null;

  const preferencePlaceholder = await findTransactionByRemotePaymentId(
    context,
    preferenceId,
  );
  if (
    preferencePlaceholder?.receivable_id &&
    String(preferencePlaceholder.receivable_id) !== String(input.receivableId)
  ) {
    throw new Error(
      "Preferencia Mercado Pago ja associada a outro recebivel.",
    );
  }
  return preferencePlaceholder;
};

const updateTransaction = async (
  context: GatewayWebhookContext,
  transactionId: string,
  payload: Record<string, unknown>,
) => {
  const { error } = await context.admin.from("payment_gateway_transactions")
    .update(payload)
    .eq("id", transactionId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
};

export const tryConsumeMercadoPagoPreferencePlaceholder = async (
  context: GatewayWebhookContext,
  input: {
    transactionId: string;
    preferenceId: string;
    payload: Record<string, unknown>;
  },
) => {
  const { data, error } = await context.admin
    .from("payment_gateway_transactions")
    .update(input.payload)
    .eq("id", input.transactionId)
    .eq("remote_payment_id", input.preferenceId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
};

export const syncMercadoPagoTransaction = async (
  context: GatewayWebhookContext,
  input: {
    receivable: Record<string, unknown>;
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

  const preferenceId = mercadoPagoPreferenceIdFor(
    input.payment,
    input.receivable,
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
    payment_method: input.paymentMethod ||
      input.receivable.gateway_payment_method,
    installments,
    remote_payment_id: remotePaymentId,
    remote_payment_link_id: preferenceId ||
      input.receivable.gateway_payment_link_id,
    remote_status: firstString(
      input.payment.status,
      input.receivable.gateway_status,
    ),
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

  const existing = await findMercadoPagoTransactionForPayment(context, {
    receivableId: String(input.receivable.id),
    remotePaymentId,
    preferenceId,
  });

  if (!existing?.id) {
    const result = await context.admin.from("payment_gateway_transactions")
      .insert(payload);
    if (result.error) throw result.error;
    return;
  }

  if (String(existing.remote_payment_id) === remotePaymentId) {
    await updateTransaction(context, String(existing.id), payload);
    return;
  }

  const consumed = preferenceId &&
      String(existing.remote_payment_id) === preferenceId
    ? await tryConsumeMercadoPagoPreferencePlaceholder(context, {
      transactionId: String(existing.id),
      preferenceId,
      payload,
    })
    : false;
  if (consumed) return;

  // Outra notificacao pode ter consumido o placeholder entre a leitura e o
  // update. Reaproveite somente se foi o mesmo pagamento; tentativas distintas
  // devem manter linhas de auditoria independentes.
  const concurrentExact = await findMercadoPagoTransactionForPayment(context, {
    receivableId: String(input.receivable.id),
    remotePaymentId,
  });
  if (concurrentExact?.id) {
    await updateTransaction(context, String(concurrentExact.id), payload);
    return;
  }

  const insertResult = await context.admin
    .from("payment_gateway_transactions")
    .insert(payload);
  if (insertResult.error) throw insertResult.error;
};
