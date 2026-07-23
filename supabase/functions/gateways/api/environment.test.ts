import assert from "node:assert/strict";
import { requireGatewayEnvironment } from "./environment.ts";

Deno.test("ambiente de titulo existente falha fechado", () => {
  assert.equal(requireGatewayEnvironment("sandbox"), "sandbox");
  assert.equal(requireGatewayEnvironment("production"), "production");
  for (const value of [null, "", "homologacao", "SANDBOX"]) {
    assert.throws(
      () => requireGatewayEnvironment(value, "titulo Banese"),
      /ambiente ausente ou invalido/i,
    );
  }
});
