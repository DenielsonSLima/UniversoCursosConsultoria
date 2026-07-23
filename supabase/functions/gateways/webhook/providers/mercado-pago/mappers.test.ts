import assert from "node:assert/strict";
import {
  mercadoPagoReviewReason,
  requiresMercadoPagoReversalReview,
  statusForMercadoPago,
} from "./mappers.ts";

Deno.test("refund e chargeback exigem politica explicita de reversao", () => {
  assert.equal(requiresMercadoPagoReversalReview("refunded"), true);
  assert.equal(requiresMercadoPagoReversalReview("charged_back"), true);
  assert.equal(requiresMercadoPagoReversalReview("in_mediation"), true);
  assert.equal(requiresMercadoPagoReversalReview("rejected"), false);
  assert.equal(requiresMercadoPagoReversalReview("cancelled"), false);
});

Deno.test("nao mistura status processed da Orders API com Payment", () => {
  assert.equal(statusForMercadoPago("processed"), null);
  assert.equal(statusForMercadoPago("in_mediation"), "AGUARDANDO_PAGAMENTO");
  assert.equal(statusForMercadoPago("rejected"), "AGUARDANDO_PAGAMENTO");
  assert.equal(statusForMercadoPago("cancelled"), "AGUARDANDO_PAGAMENTO");
});

Deno.test("identifica disputa, estorno integral e estorno parcial", () => {
  assert.equal(
    mercadoPagoReviewReason({ status: "in_mediation" }),
    "payment_in_mediation",
  );
  assert.equal(
    mercadoPagoReviewReason({ status: "refunded" }),
    "payment_refunded",
  );
  assert.equal(
    mercadoPagoReviewReason({ status: "charged_back" }),
    "payment_charged_back",
  );
  assert.equal(
    mercadoPagoReviewReason({
      status: "approved",
      transaction_amount_refunded: 25.5,
    }),
    "payment_partially_refunded",
  );
  assert.equal(
    mercadoPagoReviewReason({
      status: "approved",
      status_detail: "partially_refunded",
    }),
    "payment_partially_refunded",
  );
  assert.equal(
    mercadoPagoReviewReason({
      status: "approved",
      transaction_amount_refunded: 0,
    }),
    null,
  );
});
