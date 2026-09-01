import assert from "node:assert/strict";
import {
  manualCycleRecoveryFailure,
  reconciliationClaimError,
  skipManualCycleFailureMutation,
} from "./recovery-policy.ts";

Deno.test("somente rede, timeout, 429 e 5xx permitem novo GET", () => {
  for (
    const error of [
      new Error("fetch failed: network connection reset"),
      new Error("request aborted by timeout"),
      new Error("Banese recusou consulta (429)"),
      new Error("Banese indisponível (503)"),
    ]
  ) assert.equal(manualCycleRecoveryFailure(error).retryable, true);
});

Deno.test("401, 4xx, identidade, termos e Pix incompleto exigem revisão", () => {
  for (
    const error of [
      new Error("Banese recusou consulta (401)"),
      new Error("Banese recusou consulta (404)"),
      new Error("Nosso Numero remoto diverge"),
      new Error("Desconto, multa ou juros divergem"),
      new Error("snapshot Pix incompleto"),
      new Error("A consulta oficial confirmou boleto pago"),
    ]
  ) assert.equal(manualCycleRecoveryFailure(error).retryable, false);
});

Deno.test("cooldown e idade máxima não reclassificam o estado já persistido", () => {
  for (const code of ["COOLDOWN", "MAX_AGE"] as const) {
    const error = reconciliationClaimError("aguarde", code);
    assert.equal(skipManualCycleFailureMutation(error), true);
    assert.equal((error as Error & { code: string }).code, code);
  }
});
