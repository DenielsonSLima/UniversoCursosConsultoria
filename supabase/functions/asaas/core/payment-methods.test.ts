import assert from "node:assert/strict";
import {
  normalizeCourseFinanceiroConfig,
  resolveCoursePaymentSelection,
} from "./payment-methods.ts";

Deno.test("normalizador principal respeita maximo menor que parcelas padrao", () => {
  const config = normalizeCourseFinanceiroConfig({
    parcelasPadrao: 12,
    metodosRecebimento: { pix: false, boleto: false, cartao: true },
    cartao: { aceitar: true, maxParcelas: 6 },
  });
  assert.equal(config.parcelasPadrao, 6);
  assert.equal(config.cartao.maxParcelas, 6);
  assert.equal(resolveCoursePaymentSelection(config).installmentCount, 6);
  assert.throws(
    () => resolveCoursePaymentSelection(config, { installments: 7 }),
    /no maximo 6 parcelas/i,
  );
});

Deno.test("cartao com aceitar ausente preserva o default habilitado", () => {
  const config = normalizeCourseFinanceiroConfig({
    parcelasPadrao: 6,
    metodosRecebimento: { pix: false, boleto: false, cartao: true },
    cartao: { maxParcelas: 10 },
  });
  assert.equal(config.cartao.aceitar, true);
  assert.equal(config.cartao.maxParcelas, 10);
  assert.equal(resolveCoursePaymentSelection(config).installmentCount, 6);
});
