import assert from "node:assert/strict";
import {
  buildEnrollmentReceivablePaymentPatch,
  requireEnrollmentGatewayPaymentMethod,
} from "./gateway-routing-guard.ts";

Deno.test("normaliza e prepara os dois campos do recebivel inicial", () => {
  assert.deepEqual(
    buildEnrollmentReceivablePaymentPatch(" credit_card "),
    {
      forma_pagamento: "CARTAO",
      gateway_payment_method: "CREDIT_CARD",
    },
  );
  assert.deepEqual(
    buildEnrollmentReceivablePaymentPatch("pix"),
    {
      forma_pagamento: "PIX",
      gateway_payment_method: "PIX",
    },
  );
});

Deno.test("rejeita sync de matricula sem metodo canonico explicito", () => {
  for (const invalid of [null, "", "DINHEIRO", "CARTAO"]) {
    assert.throws(
      () => requireEnrollmentGatewayPaymentMethod(invalid),
      /Escolha Pix, boleto ou cartao/i,
    );
  }
});
