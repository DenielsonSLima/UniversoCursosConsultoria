import assert from "node:assert/strict";
import { resolveEadCharge } from "./ead-finance.ts";

const course = {
  nome: "Curso EAD",
  valor: 120,
  financeiro_config: {
    parcelasPadrao: 12,
    metodosRecebimento: { pix: false, boleto: false, cartao: true },
    cartao: { aceitar: true, maxParcelas: 6 },
  },
};

Deno.test("parcelamento EAD limita o padrao ao maximo contratual", () => {
  assert.equal(
    resolveEadCharge(course, { method: "CREDIT_CARD" }).installmentCount,
    6,
  );
  assert.throws(
    () =>
      resolveEadCharge(course, {
        method: "CREDIT_CARD",
        installments: 7,
      }),
    /no maximo 6 parcelas/i,
  );
});

Deno.test("boleto Banese usa o valor bruto sem tarifa estimada do Asaas", () => {
  const baneseCourse = {
    nome: "Curso EAD Banese",
    valor: 14.9,
    financeiro_config: {
      parcelasPadrao: 1,
      considerarTaxaNoCheckout: true,
      metodosRecebimento: { pix: false, boleto: true, cartao: false },
      cartao: { aceitar: false, maxParcelas: 1 },
    },
  };

  const charge = resolveEadCharge(
    baneseCourse,
    { method: "BOLETO", installments: 1 },
    "banese_card",
  );

  assert.equal(charge.value, 14.9);
  assert.equal(charge.feeValue, 0);
  assert.equal(charge.netValue, 14.9);
});
