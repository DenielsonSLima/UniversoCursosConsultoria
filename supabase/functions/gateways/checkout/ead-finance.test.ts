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
