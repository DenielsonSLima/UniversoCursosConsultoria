import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE as bank } from "../banese/internal/testing/document-fixture.ts";
import {
  buildOtherCreditPaymentDto,
  safeOtherCreditInvoiceUrl,
} from "./payment-reader.ts";

const link =
  `https://universocc.com.br/aluno?module=financeiro&banesePayment=${bank.receivableId}`;
const rowAt = (changes: Record<string, unknown> = {}) => ({
  id: bank.receivableId,
  polo_id: "11111111-1111-1111-1111-111111111111",
  categoria: "OUTROS_CREDITOS",
  origem_pagamento: "BANESE",
  status: "PENDENTE",
  matricula_id: null,
  turma_id: null,
  valor: bank.amount,
  data_vencimento: bank.dueDate,
  gateway_provider: "banese_card",
  gateway_environment: "production",
  gateway_payment_method: "BOLETO",
  gateway_status: "REGISTERED",
  gateway_payment_id: bank.ourNumber,
  gateway_invoice_url: link,
  gateway_boleto_linha_digitavel: bank.digitableLine,
  gateway_boleto_codigo_barras: bank.barcode,
  gateway_boleto_nosso_numero: bank.ourNumber,
  ...changes,
});

Deno.test("Nosso Número deve coincidir com código de barras e ID bancário canônico", () => {
  assert.equal(buildOtherCreditPaymentDto(rowAt()).boletoAvailable, true);
  for (
    const changes of [
      {
        gateway_boleto_nosso_numero: "999999999",
        gateway_payment_id: "999999999",
      },
      { gateway_payment_id: "999999999" },
      { gateway_boleto_nosso_numero: "1234567890", gateway_payment_id: null },
    ]
  ) {
    const result = buildOtherCreditPaymentDto(rowAt(changes));
    assert.equal(result.boletoAvailable, false);
    assert.equal(result.canPay, false);
    assert.equal(result.payment.gateway_pix_payload, null);
    assert.equal(result.needsReview, true);
  }
});

Deno.test("capacidade de consulta preserva recuperação ambígua sem expor ID bancário", () => {
  for (
    const changes of [{}, { gateway_submission_status: "API_AMBIGUOUS" }, {
      gateway_boleto_nosso_numero: null,
    }, { gateway_payment_id: null }]
  ) {
    const result = buildOtherCreditPaymentDto(rowAt(changes));
    assert.equal(result.canRefresh, true);
    assert.equal("gateway_payment_id" in result.payment, false);
  }
  for (
    const changes of [
      { gateway_boleto_nosso_numero: null, gateway_payment_id: null },
      { gateway_payment_id: "999999999" },
      { status: "PAGO" },
      { status: "CANCELADO" },
      { gateway_status: "CONFIRMED" },
      { gateway_status: "CANCELED_BY_BANK" },
    ]
  ) assert.equal(buildOtherCreditPaymentDto(rowAt(changes)).canRefresh, false);
});

Deno.test("link exige HTTPS institucional, sem credenciais, e exatamente o mesmo recebível", () => {
  assert.equal(safeOtherCreditInvoiceUrl(link, bank.receivableId), link);
  for (
    const candidate of [
      link.replace("https:", "http:"),
      link.replace("universocc.com.br", "example.test"),
      link.replace("https://", "https://user:secret@"),
      link.replace("universocc.com.br", "universocc.com.br:8443"),
      link.replace(bank.receivableId, "22222222-2222-4222-8222-222222222222"),
      `${link}&token=secret`,
      `${link}&banesePayment=${bank.receivableId}`,
      `${link}#token=secret`,
      "javascript:alert(1)",
      "https://universocc.com.br",
    ]
  ) assert.equal(safeOtherCreditInvoiceUrl(candidate, bank.receivableId), null);
});

Deno.test("link só acompanha boleto disponível, nunca pagamento encerrado ou ambíguo", () => {
  assert.equal(
    buildOtherCreditPaymentDto(rowAt()).payment.gateway_invoice_url,
    link,
  );
  for (
    const changes of [{ status: "PAGO" }, { status: "CANCELADO" }, {
      gateway_submission_status: "API_AMBIGUOUS",
    }, {
      gateway_boleto_linha_digitavel: null,
      gateway_boleto_codigo_barras: null,
    }]
  ) {
    assert.equal(
      buildOtherCreditPaymentDto(rowAt(changes)).payment.gateway_invoice_url,
      null,
    );
  }
});
