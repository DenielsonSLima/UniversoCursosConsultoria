import assert from "node:assert/strict";
import {
  duplicateWebhookEventAction,
  duplicateWebhookHttpStatus,
  GATEWAY_WEBHOOK_PROCESSING_LEASE_MS,
  webhookReviewMarker,
} from "./event-idempotency.ts";

Deno.test("duplicata em processamento recebe status retentavel", () => {
  assert.equal(duplicateWebhookHttpStatus(true), 503);
  assert.equal(duplicateWebhookHttpStatus(false), 200);
});

const NOW_MS = Date.UTC(2026, 6, 21, 12, 0, 0);

Deno.test("evento de webhook ja processado recebe apenas confirmacao", () => {
  assert.equal(
    duplicateWebhookEventAction({ processed: true }, NOW_MS),
    "acknowledge",
  );
});

Deno.test("evento de webhook anteriormente falho permanece retentavel", () => {
  assert.equal(
    duplicateWebhookEventAction({
      processed: false,
      processing_error: "timeout",
      processed_at: new Date(NOW_MS - 1000).toISOString(),
      received_at: new Date(NOW_MS - 2000).toISOString(),
    }, NOW_MS),
    "retry",
  );
});

Deno.test("duplicata nao reprocessa evento que ainda esta em andamento", () => {
  assert.equal(
    duplicateWebhookEventAction({
      processed: false,
      processing_error: null,
      processed_at: null,
      received_at: new Date(NOW_MS - 1000).toISOString(),
    }, NOW_MS),
    "processing",
  );
});

Deno.test("evento abandonado pode repetir depois da janela de processamento", () => {
  assert.equal(
    duplicateWebhookEventAction({
      processed: false,
      processing_error: null,
      processed_at: null,
      received_at: new Date(
        NOW_MS - GATEWAY_WEBHOOK_PROCESSING_LEASE_MS,
      ).toISOString(),
    }, NOW_MS),
    "retry",
  );
});

Deno.test("resultado que exige revisao deixa marcador duravel no journal", () => {
  assert.equal(
    webhookReviewMarker({
      reviewRequired: true,
      reviewReason: "payment_partially_refunded",
      receivableId: "receivable-1",
    }),
    "REVIEW_REQUIRED | payment_partially_refunded | receivable_id=receivable-1",
  );
  assert.equal(webhookReviewMarker({ reviewRequired: false }), null);
  assert.equal(webhookReviewMarker(null), null);
});
