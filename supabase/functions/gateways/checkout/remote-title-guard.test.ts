import assert from "node:assert/strict";
import {
  assertGatewayTitleCanBeReset,
  boletoIssuedAtAfterReset,
  hasActiveRemoteTitleReference,
  isRemoteTitleNonPayable,
} from "./remote-title-guard.ts";

Deno.test("bloqueia substituicao de titulo remoto ativo", () => {
  const receivable = {
    gateway_provider: "banese_card",
    gateway_payment_id: "000000015",
    gateway_status: "PENDING",
  };
  assert.equal(hasActiveRemoteTitleReference(receivable), true);
  assert.throws(
    () => assertGatewayTitleCanBeReset(receivable),
    /titulo bancario ativo/i,
  );
});

Deno.test("permite recuperacao idempotente do mesmo titulo Banese", () => {
  assert.doesNotThrow(() =>
    assertGatewayTitleCanBeReset({
      gateway_boleto_nosso_numero: "000000015",
      gateway_status: "CREATING",
    }, { allowBaneseRecovery: true })
  );
});

Deno.test("permite limpar referencia confirmada como nao pagavel", () => {
  const receivable = {
    gateway_payment_id: "000000015",
    gateway_status: "CANCELED",
  };
  assert.equal(isRemoteTitleNonPayable(receivable), true);
  assert.equal(hasActiveRemoteTitleReference(receivable), false);
  assert.doesNotThrow(() => assertGatewayTitleCanBeReset(receivable));
});

Deno.test("status pago continua bloqueado", () => {
  assert.throws(
    () =>
      assertGatewayTitleCanBeReset({
        asaas_payment_id: "pay_123",
        asaas_status: "RECEIVED",
      }),
    /titulo bancario ativo/i,
  );
});

Deno.test("data de emissao so e preservada na recuperacao do mesmo boleto", () => {
  const receivable = { gateway_boleto_issued_at: "2026-07-16T12:00:00Z" };
  assert.equal(
    boletoIssuedAtAfterReset(receivable, true),
    "2026-07-16T12:00:00Z",
  );
  assert.equal(boletoIssuedAtAfterReset(receivable, false), null);
});
