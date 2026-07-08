import { getMercadoPagoAccessToken } from "../../../../mercado-pago/core/adapter.ts";
import type { GatewayWebhookContext } from "../../types.ts";
import { paymentFromOrder } from "./normalizers.ts";
import { asRecord, firstString, normalizeRemotePaymentId } from "./shared.ts";

const MERCADO_PAGO_PAYMENT_URL = "https://api.mercadopago.com/v1/payments";
const MERCADO_PAGO_ORDER_URL = "https://api.mercadopago.com/v1/orders";

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

export const fetchMercadoPagoOrder = async (
  context: GatewayWebhookContext,
  orderId: string,
) => {
  const normalizedOrderId = normalizeRemotePaymentId(orderId);
  if (!normalizedOrderId) throw new Error("Webhook Mercado Pago sem id da order.");
  const token = await getMercadoPagoAccessToken(
    context.admin,
    context.environment,
  );
  const response = await fetch(
    `${MERCADO_PAGO_ORDER_URL}/${encodeURIComponent(normalizedOrderId)}`,
    {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const text = await response.text().catch(() => "");
  const body = parseResponseBody(text);
  if (!response.ok) {
    throw new Error(
      `Mercado Pago recusou consulta da order (${response.status}): ${text}`,
    );
  }
  return paymentFromOrder(asRecord(body));
};

export const fetchMercadoPagoResource = async (
  context: GatewayWebhookContext,
  remoteId: string,
) => {
  const eventType = firstString(context.payload?.type, context.payload?.topic);
  const normalizedRemoteId = normalizeRemotePaymentId(remoteId);
  if (
    eventType.toLowerCase() === "order" ||
    normalizedRemoteId.toUpperCase().startsWith("ORD")
  ) {
    return fetchMercadoPagoOrder(context, normalizedRemoteId);
  }
  return fetchMercadoPagoPayment(context, normalizedRemoteId);
};
