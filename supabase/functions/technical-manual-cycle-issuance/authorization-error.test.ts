import assert from "node:assert/strict";
import { manualCycleAuthorizationDiagnostic } from "./authorization-error.ts";

Deno.test("diagnóstico usa somente código PostgREST e detalhe estável reconhecidos", () => {
  for (const code of [
    "CYCLE_AUTHORIZATION_FINGERPRINT_MISMATCH",
    "CYCLE_AUTHORIZATION_CONTEXT_MISMATCH",
  ]) {
    const result = manualCycleAuthorizationDiagnostic({ code: "PT422", details: code });
    assert.equal(result?.code, code);
    assert.match(result?.message ?? "", /revisão/);
    assert.doesNotMatch(result?.message ?? "", /Tente novamente/);
  }
});

Deno.test("mensagem livre, outro SQLSTATE ou detalhe desconhecido não viram diagnóstico", () => {
  for (const value of [
    null,
    "CYCLE_AUTHORIZATION_FINGERPRINT_MISMATCH",
    { code: "42501", details: "CYCLE_AUTHORIZATION_FINGERPRINT_MISMATCH" },
    { code: "PT422", message: "CYCLE_AUTHORIZATION_FINGERPRINT_MISMATCH" },
    { code: "PT422", details: "UNKNOWN" },
    { code: "PT422", details: { code: "CYCLE_AUTHORIZATION_CONTEXT_MISMATCH" } },
  ]) assert.equal(manualCycleAuthorizationDiagnostic(value), null);
});
