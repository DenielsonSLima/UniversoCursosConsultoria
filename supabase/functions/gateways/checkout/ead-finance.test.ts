import assert from "node:assert/strict";
import { resolveEadCharge, resolveTargetedEadCharge } from "./ead-finance.ts";

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

Deno.test("apresentacao Pix usa BOLETO Banese mesmo em curso somente Pix", () => {
  const pixOnlyCourse = {
    nome: "Curso EAD Pix",
    valor: 99.9,
    financeiro_config: {
      metodosRecebimento: { pix: true, boleto: false, cartao: false },
      cartao: { aceitar: false, maxParcelas: 1 },
    },
  };

  const charge = resolveEadCharge(
    pixOnlyCourse,
    { method: "BOLETO", installments: 1, presentation: "PIX" },
    "banese_card",
  );

  assert.equal(charge.method, "BOLETO");
  assert.equal(charge.value, 99.9);
  assert.throws(
    () =>
      resolveEadCharge(pixOnlyCourse, {
        method: "BOLETO",
        installments: 1,
        presentation: "BOLETO",
      }),
    /nao permite pagamento por boleto/i,
  );
});

Deno.test("checkout de titulo existente preserva termos do contas_receber", () => {
  const configured = resolveEadCharge(
    {
      nome: "Curso reajustado",
      valor: 250,
      financeiro_config: {
        metodosRecebimento: { pix: true, boleto: true, cartao: false },
      },
    },
    { method: "BOLETO", presentation: "PIX" },
    "banese_card",
  );

  const targeted = resolveTargetedEadCharge(configured, {
    valor: 99.9,
    data_vencimento: "2026-07-10",
    descricao: "Inscricao EAD original",
  });

  assert.equal(targeted.method, "BOLETO");
  assert.equal(targeted.value, 99.9);
  assert.equal(targeted.netValue, 99.9);
  assert.equal(targeted.dueDate, "2026-07-10");
  assert.equal(targeted.description, "Inscricao EAD original");
});
