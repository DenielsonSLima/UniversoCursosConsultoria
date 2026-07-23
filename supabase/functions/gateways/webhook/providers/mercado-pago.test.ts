import assert from "node:assert/strict";
import { shouldReplayMercadoPagoSettlementEffects } from "./mercado-pago.ts";

Deno.test("retry do mesmo pagamento completa efeitos depois da baixa local", () => {
  assert.equal(
    shouldReplayMercadoPagoSettlementEffects({
      projection: "duplicate_paid_same_payment",
      localStatus: "PAGO",
      reviewRequired: false,
    }),
    true,
  );
});

Deno.test("nao repete efeitos para outro pagamento ou evento de revisao", () => {
  assert.equal(
    shouldReplayMercadoPagoSettlementEffects({
      projection: "duplicate_paid_other_payment",
      localStatus: "PAGO",
      reviewRequired: true,
    }),
    false,
  );
  assert.equal(
    shouldReplayMercadoPagoSettlementEffects({
      projection: "duplicate_paid_same_payment",
      localStatus: "PAGO",
      reviewRequired: true,
    }),
    false,
  );
});
