import assert from "node:assert/strict";
import {
  assertLegacyReceivableCompatibility,
  proveLegacyAsaasCustomer,
  proveLegacyCoursePaymentLink,
} from "./legacy-payment-link-integrity.ts";

const course = {
  id: "course-1",
  valor: 99.9,
  asaas_payment_link_id: "link-1",
  financeiro_config: {
    metodosRecebimento: { pix: true, boleto: true, cartao: false },
    cartao: { aceitar: false },
  },
};

const payment = {
  id: "pay-1",
  paymentLink: "link-1",
  externalReference: "course-1",
  customer: "cus-1",
  billingType: "BOLETO",
  value: 99.9,
  currency: "BRL",
};

const remoteLink = {
  id: "link-1",
  externalReference: "course-1",
  billingType: "UNDEFINED",
  chargeType: "DETACHED",
  value: 99.9,
  currency: "BRL",
  deleted: false,
};

Deno.test("link legado rejeita prova de outro ambiente", () => {
  assert.throws(
    () =>
      proveLegacyCoursePaymentLink({
        course,
        payment,
        remoteLink: { ...remoteLink, environment: "production" },
        environment: "sandbox",
      }),
    /outro ambiente/i,
  );
});

Deno.test("link legado rejeita valor divergente sem arredondamento frouxo", () => {
  assert.throws(
    () =>
      proveLegacyCoursePaymentLink({
        course,
        payment: { ...payment, value: 99.89 },
        remoteLink,
        environment: "sandbox",
      }),
    /valor do curso, do link e do pagamento/i,
  );
});

Deno.test("link legado rejeita moeda e metodo nao autorizados", () => {
  assert.throws(
    () =>
      proveLegacyCoursePaymentLink({
        course,
        payment: { ...payment, currency: "USD" },
        remoteLink,
        environment: "sandbox",
      }),
    /moeda.*diverge de BRL/i,
  );
  assert.throws(
    () =>
      proveLegacyCoursePaymentLink({
        course,
        payment: { ...payment, billingType: "CREDIT_CARD" },
        remoteLink,
        environment: "sandbox",
      }),
    /nao esta explicitamente habilitada/i,
  );
});

Deno.test("link legado rejeita ausencia de identidade canonica", () => {
  assert.throws(
    () =>
      proveLegacyCoursePaymentLink({
        course,
        payment: { ...payment, externalReference: null },
        remoteLink,
        environment: "sandbox",
      }),
    /externalReference do pagamento/i,
  );
  assert.throws(
    () =>
      proveLegacyAsaasCustomer({
        paymentCustomerId: "cus-1",
        customer: { id: "cus-1", cpfCnpj: null },
      }),
    /sem CPF ou CNPJ identificavel/i,
  );
});

Deno.test("retry do mesmo pagamento e compativel e conflito cruza ambiente", () => {
  const proof = proveLegacyCoursePaymentLink({
    course,
    payment,
    remoteLink,
    environment: "sandbox",
  });
  const existing = {
    valor: 99.9,
    status: "PAGO",
    origem_pagamento: "ASAAS",
    tipo_lancamento: "MATRICULA",
    cliente_id: "student-1",
    matricula_id: "enrollment-1",
    turma_id: "class-1",
    asaas_payment_id: "pay-1",
    asaas_payment_link_id: "link-1",
    nosso_numero_asaas: "pay-1",
    gateway_provider: "asaas",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_payment_id: "pay-1",
    gateway_payment_link_id: "link-1",
    gateway_customer_id: "cus-1",
  };

  const retry = () =>
    assertLegacyReceivableCompatibility({
      existing,
      proof,
      alunoId: "student-1",
      matriculaId: "enrollment-1",
      turmaId: "class-1",
    });
  assert.doesNotThrow(retry);
  assert.doesNotThrow(retry);

  assert.throws(
    () =>
      assertLegacyReceivableCompatibility({
        existing: { ...existing, gateway_environment: "production" },
        proof,
        alunoId: "student-1",
        matriculaId: "enrollment-1",
        turmaId: "class-1",
      }),
    /outro ambiente/i,
  );
});
