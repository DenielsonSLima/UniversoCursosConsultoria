import assert from "node:assert/strict";
import {
  assertMercadoPagoPaymentMatches,
  type PaymentValidationInput,
} from "./validation.ts";

const RECEIVABLE_ID = "11111111-1111-4111-8111-111111111111";

const validInput = (): PaymentValidationInput => ({
  environment: "sandbox" as const,
  receivable: { id: RECEIVABLE_ID, valor: "99.90" },
  payment: {
    external_reference: RECEIVABLE_ID,
    transaction_amount: 99.9,
    currency_id: "BRL",
    live_mode: false,
    collector_id: 3523270816,
  },
  merchantId: "3523270816",
});

Deno.test("aceita pagamento que corresponde integralmente ao recebivel", () => {
  assert.doesNotThrow(() => assertMercadoPagoPaymentMatches(validInput()));
});

Deno.test("bloqueia external_reference de outro recebivel", () => {
  const input = validInput();
  input.payment.external_reference = "22222222-2222-4222-8222-222222222222";

  assert.throws(
    () => assertMercadoPagoPaymentMatches(input),
    /external_reference divergente/,
  );
});

Deno.test("bloqueia diferenca de um centavo", () => {
  const input = validInput();
  input.payment.transaction_amount = 99.89;

  assert.throws(
    () => assertMercadoPagoPaymentMatches(input),
    /valor divergente/,
  );
});

Deno.test("bloqueia moeda diferente de BRL", () => {
  const input = validInput();
  input.payment.currency_id = "USD";

  assert.throws(
    () => assertMercadoPagoPaymentMatches(input),
    /moeda diferente de BRL/,
  );
});

Deno.test("bloqueia live_mode de producao em webhook sandbox", () => {
  const input = validInput();
  input.payment.live_mode = true;

  assert.throws(
    () => assertMercadoPagoPaymentMatches(input),
    /ambiente diferente/,
  );
});

Deno.test("bloqueia collector_id diferente do merchantId configurado", () => {
  const input = validInput();
  input.payment.collector_id = 9999999999;

  assert.throws(
    () => assertMercadoPagoPaymentMatches(input),
    /collector_id diferente/,
  );
});

Deno.test("bloqueia liquidacao quando merchantId nao foi configurado", () => {
  const input = validInput();
  input.merchantId = null;
  delete (input.payment as Record<string, unknown>).collector_id;

  assert.throws(
    () => assertMercadoPagoPaymentMatches(input),
    /sem merchantId configurado/,
  );
});

Deno.test("exige live_mode explicito para confirmar o ambiente", () => {
  const input = validInput();
  delete (input.payment as Record<string, unknown>).live_mode;

  assert.throws(
    () => assertMercadoPagoPaymentMatches(input),
    /ambiente diferente/,
  );
});
