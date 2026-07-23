import { getMercadoPagoAccessToken } from "../../../../mercado-pago/core/adapter.ts";
import type { GatewayWebhookContext } from "../../types.ts";
import { asRecord, firstString, normalizeRemotePaymentId } from "./shared.ts";

const MERCADO_PAGO_PAYMENT_URL = "https://api.mercadopago.com/v1/payments";

const parseResponseBody = (text: string) => text ? JSON.parse(text) : {};

export const fetchMercadoPagoPayment = async (
  context: GatewayWebhookContext,
  paymentId: string,
) => {
  const normalizedPaymentId = normalizeRemotePaymentId(paymentId);
  if (!normalizedPaymentId) {
    throw new Error("Webhook Mercado Pago sem id de pagamento.");
  }
  const token = await getMercadoPagoAccessToken(
    context.admin,
    context.environment,
  );
  const response = await fetch(
    `${MERCADO_PAGO_PAYMENT_URL}/${encodeURIComponent(normalizedPaymentId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const text = await response.text().catch(() => "");
  const body = parseResponseBody(text);
  if (!response.ok) {
    throw new Error(
      `Mercado Pago recusou consulta do pagamento (${response.status}): ${text}`,
    );
  }
  return asRecord(body);
};

export const unsupportedMercadoPagoEventReason = (
  context: GatewayWebhookContext,
  remoteId: string,
) => {
  const eventType = firstString(context.payload?.type, context.payload?.topic)
    .toLowerCase();
  const normalizedRemoteId = normalizeRemotePaymentId(remoteId);
  if (eventType === "merchant_order") {
    return "unsupported_merchant_order";
  }
  if (
    eventType === "order" || eventType === "orders" ||
    normalizedRemoteId.toUpperCase().startsWith("ORD")
  ) {
    return "unsupported_orders_api";
  }
  if (
    eventType && eventType !== "payment" && eventType !== "payments" &&
    !eventType.startsWith("payment.")
  ) {
    return "unsupported_event_type";
  }
  return null;
};
