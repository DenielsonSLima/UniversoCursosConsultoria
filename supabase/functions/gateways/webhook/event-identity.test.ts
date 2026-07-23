import assert from "node:assert/strict";
import { resolveGatewayWebhookEventId } from "./event-identity.ts";

Deno.test("prioriza o id da notificacao e nao o id do pagamento", () => {
  assert.equal(
    resolveGatewayWebhookEventId({
      payload: { id: "notification-1", data: { id: "payment-1" } },
      requestId: "request-1",
      remotePaymentId: "payment-1",
    }),
    "notification-1",
  );
});

Deno.test("usa x-request-id quando a notificacao nao traz id proprio", () => {
  assert.equal(
    resolveGatewayWebhookEventId({
      payload: { data: { id: "payment-1" } },
      requestId: "request-1",
      remotePaymentId: "payment-1",
    }),
    "request:request-1",
  );
});

Deno.test("pending e approved do mesmo pagamento nao colidem", () => {
  const pending = resolveGatewayWebhookEventId({
    payload: { action: "payment.updated", data: { id: "payment-1" } },
    requestId: "request-pending",
    remotePaymentId: "payment-1",
  });
  const approved = resolveGatewayWebhookEventId({
    payload: { action: "payment.updated", data: { id: "payment-1" } },
    requestId: "request-approved",
    remotePaymentId: "payment-1",
  });

  assert.notEqual(pending, approved);
});

Deno.test("deriva identidade apenas com tipo, recurso e instante completos", () => {
  assert.equal(
    resolveGatewayWebhookEventId({
      payload: {
        action: "payment.updated",
        date_created: "2026-07-21T10:00:00Z",
      },
      remotePaymentId: "payment-1",
    }),
    "derived:payment.updated:payment-1:2026-07-21T10:00:00Z",
  );
  assert.equal(
    resolveGatewayWebhookEventId({
      payload: { data: { id: "payment-1" } },
      remotePaymentId: "payment-1",
      generatedId: "random-1",
    }),
    "generated:random-1",
  );
});
