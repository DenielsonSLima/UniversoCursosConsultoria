import assert from "node:assert/strict";
import { resolveEadCheckoutCharge } from "./checkout.ts";
import { resolveEadCharge } from "../../gateways/checkout/ead-finance.ts";

const makeCourse = (input: {
  includeFee?: boolean;
  passInstallmentCost?: boolean;
  methods?: { pix: boolean; boleto: boolean; cartao: boolean };
  maxInstallments?: number;
} = {}) => ({
  nome: "Curso EAD",
  valor: 120,
  financeiro_config: {
    parcelasPadrao: 3,
    considerarTaxaNoCheckout: input.includeFee === true,
    metodosRecebimento: input.methods || {
      pix: true,
      boleto: true,
      cartao: true,
    },
    cartao: {
      aceitar: true,
      maxParcelas: input.maxInstallments ?? 6,
      repassarCustoParcelamento: input.passInstallmentCost === true,
    },
  },
});

const resolveBoth = (
  course: ReturnType<typeof makeCourse>,
  payment: { method: "PIX" | "BOLETO" | "CREDIT_CARD"; installments?: number },
) => ({
  checkoutApi: resolveEadCheckoutCharge(
    course,
    {},
    "2026-08-10",
    payment,
  ),
  paymentCheckout: resolveEadCharge(course, payment),
});

Deno.test("EAD mantem preco base quando as duas flags de taxa estao desligadas", () => {
  const { checkoutApi, paymentCheckout } = resolveBoth(
    makeCourse(),
    { method: "CREDIT_CARD", installments: 3 },
  );

  assert.equal(checkoutApi.value, 120);
  assert.equal(paymentCheckout.value, 120);
  assert.equal(checkoutApi.installmentCount, 3);
  assert.equal(paymentCheckout.installmentCount, 3);
  assert.equal(checkoutApi.feeValue, 4.68);
  assert.equal(paymentCheckout.feeValue, 4.68);
  assert.equal(checkoutApi.netValue, 115.32);
  assert.equal(paymentCheckout.netValue, 115.32);
});

Deno.test("EAD considerarTaxaNoCheckout inclui taxa no Pix e no cartao sem duplicar", () => {
  const course = makeCourse({
    includeFee: true,
    passInstallmentCost: true,
  });
  const pix = resolveBoth(course, { method: "PIX" });
  const card = resolveBoth(course, {
    method: "CREDIT_CARD",
    installments: 3,
  });

  assert.equal(pix.checkoutApi.value, 121.99);
  assert.equal(pix.paymentCheckout.value, 121.99);
  assert.equal(pix.checkoutApi.netValue, 120);
  assert.equal(card.checkoutApi.value, 124.85);
  assert.equal(card.paymentCheckout.value, 124.85);
  assert.equal(card.checkoutApi.netValue, 120);
  assert.equal(card.paymentCheckout.netValue, 120);
});

Deno.test("EAD repassarCustoParcelamento afeta apenas cartao com mais de uma parcela", () => {
  const course = makeCourse({ passInstallmentCost: true });
  const pix = resolveBoth(course, { method: "PIX" });
  const cardOnce = resolveBoth(course, {
    method: "CREDIT_CARD",
    installments: 1,
  });
  const cardInstallments = resolveBoth(course, {
    method: "CREDIT_CARD",
    installments: 3,
  });

  assert.equal(pix.checkoutApi.value, 120);
  assert.equal(pix.paymentCheckout.value, 120);
  assert.equal(cardOnce.checkoutApi.value, 120);
  assert.equal(cardOnce.paymentCheckout.value, 120);
  assert.equal(cardInstallments.checkoutApi.value, 124.85);
  assert.equal(cardInstallments.paymentCheckout.value, 124.85);
});

Deno.test("EAD valida metodo e limite de parcelas no servidor nos dois endpoints", () => {
  const course = makeCourse({
    methods: { pix: false, boleto: false, cartao: true },
    maxInstallments: 6,
  });

  for (
    const resolve of [
      () =>
        resolveEadCheckoutCharge(course, {}, "2026-08-10", {
          method: "CREDIT_CARD",
          installments: 7,
        }),
      () =>
        resolveEadCharge(course, {
          method: "CREDIT_CARD",
          installments: 7,
        }),
    ]
  ) {
    assert.throws(resolve, /no maximo 6 parcelas/i);
  }

  for (
    const resolve of [
      () =>
        resolveEadCheckoutCharge(course, {}, "2026-08-10", { method: "PIX" }),
      () => resolveEadCharge(course, { method: "PIX" }),
    ]
  ) {
    assert.throws(resolve, /n.o permite pagamento por Pix/i);
  }
});

Deno.test("EAD nunca gera cobranca apenas com a taxa quando o curso esta sem valor", () => {
  const course = { ...makeCourse({ includeFee: true }), valor: 0 };
  for (
    const resolve of [
      () =>
        resolveEadCheckoutCharge(course, {}, "2026-08-10", { method: "PIX" }),
      () => resolveEadCharge(course, { method: "PIX" }),
    ]
  ) {
    assert.throws(resolve, /valor do curso EAD ainda nao configurado/i);
  }
});
