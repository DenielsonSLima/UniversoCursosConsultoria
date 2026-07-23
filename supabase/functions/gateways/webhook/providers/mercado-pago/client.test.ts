import assert from "node:assert/strict";
import type { GatewayWebhookContext } from "../../types.ts";
import { unsupportedMercadoPagoEventReason } from "./client.ts";

const contextFor = (type: string): GatewayWebhookContext => ({
  admin: {},
  supabaseUrl: "https://example.supabase.co",
  providerCode: "mercado_pago",
  environment: "sandbox",
  eventId: "event-id",
  payload: { type },
  remotePaymentId: "123",
});

Deno.test("aceita somente eventos do recurso Payment", () => {
  assert.equal(
    unsupportedMercadoPagoEventReason(contextFor("payment"), "123"),
    null,
  );
  assert.equal(
    unsupportedMercadoPagoEventReason(contextFor("payment.updated"), "123"),
    null,
  );
});

Deno.test("ignora Merchant Order e Orders API explicitamente", () => {
  assert.equal(
    unsupportedMercadoPagoEventReason(contextFor("merchant_order"), "123"),
    "unsupported_merchant_order",
  );
  assert.equal(
    unsupportedMercadoPagoEventReason(contextFor("orders"), "ORD-123"),
    "unsupported_orders_api",
  );
});

Deno.test("prefixo ORD permanece bloqueado mesmo sem tipo", () => {
  assert.equal(
    unsupportedMercadoPagoEventReason(contextFor(""), "ORD-123"),
    "unsupported_orders_api",
  );
});
