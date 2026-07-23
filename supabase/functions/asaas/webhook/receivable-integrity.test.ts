import assert from "node:assert/strict";
import {
  buildCanonicalAsaasWebhookFields,
  terminalReceivableConflictReason,
  validateAsaasWebhookPayment,
} from "./receivable-integrity.ts";

const receivable = {
  id: "00000000-0000-4000-8000-000000000101",
  valor: 99.9,
  status: "PENDENTE",
  gateway_provider: "asaas",
  gateway_environment: "sandbox",
  gateway_payment_method: "BOLETO",
  gateway_payment_id: null,
  asaas_payment_id: null,
  nosso_numero_asaas: null,
  gateway_customer_id: "cus_1",
  gateway_payment_link_id: null,
  asaas_payment_link_id: null,
  gateway_installment_id: null,
  asaas_installment_id: null,
  asaas_status: "PENDING",
  gateway_status: "PENDING",
};

const payment = {
  id: "pay_1",
  externalReference: receivable.id,
  customer: "cus_1",
  billingType: "BOLETO",
  value: 99.9,
  currency: "BRL",
  status: "RECEIVED",
  invoiceUrl: "https://sandbox.asaas.com/i/pay_1",
};

Deno.test("externalReference aceita somente provedor Asaas e ambiente real", () => {
  assert.equal(
    validateAsaasWebhookPayment({
      receivable,
      payment,
      environment: "sandbox",
      lookupSource: "external_reference",
    }),
    null,
  );
  assert.match(
    String(
      validateAsaasWebhookPayment({
        receivable,
        payment,
        environment: "production",
        lookupSource: "external_reference",
      }),
    ),
    /outro ambiente/i,
  );
  assert.match(
    String(
      validateAsaasWebhookPayment({
        receivable: { ...receivable, gateway_provider: "banese_card" },
        payment,
        environment: "sandbox",
        lookupSource: "external_reference",
      }),
    ),
    /outro provedor/i,
  );
  assert.equal(
    validateAsaasWebhookPayment({
      receivable: { ...receivable, gateway_environment: "production" },
      payment,
      environment: "production",
      lookupSource: "external_reference",
    }),
    null,
  );
});

Deno.test("baixa falha fechada para valor ou moeda divergente", () => {
  const validate = (candidate: Record<string, unknown>) =>
    validateAsaasWebhookPayment({
      receivable,
      payment: candidate,
      environment: "sandbox",
      lookupSource: "external_reference",
    });
  assert.match(String(validate({ ...payment, value: 99.89 })), /valor/i);
  assert.match(String(validate({ ...payment, value: undefined })), /valor/i);
  assert.match(String(validate({ ...payment, currency: "USD" })), /moeda/i);
  assert.equal(validate({ ...payment, currency: undefined }), null);
});

Deno.test("baixa valida identidade completa antes de adotar fallback", () => {
  const validate = (
    nextReceivable: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ) =>
    validateAsaasWebhookPayment({
      receivable: nextReceivable,
      payment: candidate,
      environment: "sandbox",
      lookupSource: "external_reference",
    });
  assert.match(
    String(validate(receivable, { ...payment, externalReference: "other" })),
    /externalReference/i,
  );
  assert.match(
    String(validate(receivable, { ...payment, customer: "cus_other" })),
    /cliente Asaas/i,
  );
  assert.match(
    String(
      validate(
        { ...receivable, gateway_payment_id: "pay_other" },
        payment,
      ),
    ),
    /identificador do pagamento/i,
  );
  assert.match(
    String(
      validate(
        { ...receivable, gateway_payment_method: "PIX" },
        payment,
      ),
    ),
    /forma de pagamento/i,
  );
});

Deno.test("paymentId nunca dispensa externalReference exato", () => {
  const identifiedReceivable = {
    ...receivable,
    gateway_payment_id: payment.id,
    asaas_payment_id: payment.id,
  };
  const validate = (candidate: Record<string, unknown>) =>
    validateAsaasWebhookPayment({
      receivable: identifiedReceivable,
      payment: candidate,
      environment: "sandbox",
      lookupSource: "gateway_payment_id",
    });

  assert.equal(validate(payment), null);
  assert.match(
    String(validate({ ...payment, externalReference: undefined })),
    /externalReference/i,
  );
  assert.match(
    String(validate({ ...payment, externalReference: "outro-recebivel" })),
    /externalReference/i,
  );
});

Deno.test("snapshot mantém campos Asaas e gateway canônicos em sincronia", () => {
  const fields = buildCanonicalAsaasWebhookFields({
    receivable,
    payment: {
      ...payment,
      netValue: 97.4,
      transactionReceiptUrl: "https://asaas.com/r/pay_1",
    },
    environment: "sandbox",
    eventType: "PAYMENT_RECEIVED",
    syncedAt: "2026-07-22T10:00:00.000Z",
  });
  assert.equal(fields.asaas_payment_id, fields.gateway_payment_id);
  assert.equal(fields.asaas_status, fields.gateway_status);
  assert.equal(fields.asaas_invoice_url, fields.gateway_invoice_url);
  assert.equal(
    fields.asaas_transaction_receipt_url,
    fields.gateway_transaction_receipt_url,
  );
  assert.equal(fields.asaas_fee_value, fields.gateway_fee_value);
  assert.equal(fields.asaas_net_value, fields.gateway_net_value);
  assert.equal(fields.gateway_provider, "asaas");
  assert.equal(fields.gateway_environment, "sandbox");
});

Deno.test("estados terminais locais e remotos não regridem", () => {
  assert.match(
    String(
      terminalReceivableConflictReason(
        { ...receivable, status: "PAGO" },
        "VENCIDO",
      ),
    ),
    /terminal PAGO/i,
  );
  assert.equal(
    terminalReceivableConflictReason(
      { ...receivable, status: "PAGO" },
      "PAGO",
    ),
    null,
  );
  const fields = buildCanonicalAsaasWebhookFields({
    receivable: {
      ...receivable,
      status: "PAGO",
      asaas_status: "RECEIVED",
      gateway_status: "RECEIVED",
    },
    payment: { ...payment, status: "OVERDUE" },
    environment: "sandbox",
    eventType: "PAYMENT_OVERDUE",
    syncedAt: "2026-07-22T10:00:00.000Z",
    transactionStatus: "REFUNDED",
  });
  assert.equal(fields.asaas_status, "REFUNDED");
  assert.equal(fields.gateway_status, "REFUNDED");
});
