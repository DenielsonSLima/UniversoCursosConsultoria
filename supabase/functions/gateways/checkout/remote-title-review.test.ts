import assert from "node:assert/strict";
import {
  assertNoAmbiguousRemoteCreation,
  hasAmbiguousRemoteCreation,
  hasGatewaySubmissionReview,
} from "./remote-title-guard.ts";

Deno.test("API_REVIEW é terminal mesmo com reserva e status CREATING", () => {
  const receivable = {
    gateway_provider: "banese_card",
    gateway_status: "CREATING",
    gateway_boleto_nosso_numero: "000000015",
    gateway_submission_channel: "API",
    gateway_submission_status: "API_REVIEW",
  };
  assert.equal(hasGatewaySubmissionReview(receivable), true);
  assert.equal(hasAmbiguousRemoteCreation(receivable), true);
  assert.throws(
    () => assertNoAmbiguousRemoteCreation(receivable),
    /bloqueada para revisão.*não pode ser retomada/i,
  );
});
