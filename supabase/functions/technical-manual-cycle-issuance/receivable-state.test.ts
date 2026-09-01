import assert from "node:assert/strict";
import { baneseDocumentFixtureAt } from "../banese/internal/testing/document-fixture.ts";
import {
  buildBanesePixImageFixture,
  buildBanesePixPayloadFixture,
} from "../banese/internal/testing/pix-fixture.ts";
import { strictTechnicalManualBaneseFinancialTerms } from "../gateways/api/banese-financial-terms.ts";
import { isStrictlyIssued } from "./receivable-state.ts";

const scope = {
  matriculaId: "11111111-1111-4111-8111-111111111111",
  turmaId: "22222222-2222-4222-8222-222222222222",
  poloId: "33333333-3333-4333-8333-333333333333",
  issuerPoloId: "44444444-4444-4444-8444-444444444444",
};

const strictFixture = () => {
  const amount = 279.9;
  const dueDate = "2026-10-15";
  const bank = baneseDocumentFixtureAt(2, dueDate, amount);
  const snapshot = {
    versao: 2,
    origem: "TURMA",
    tipoLancamento: "MENSALIDADE",
    valorBase: amount,
    descontoPontualidade: 19.9,
    jurosAtrasoPercentual: 2,
    multaAtrasoPercentual: 2,
    multaAtrasoValor: 5.6,
    aplicarDesconto: true,
    aplicarMultaJuros: true,
    identidade: { turmaRevisao: 3 },
    cicloManual: {
      cicloNumero: 2,
      requestId: "66666666-6666-4666-8666-666666666666",
      regraFingerprint: "a".repeat(64),
      politicaFingerprint: "b".repeat(64),
      cronogramaFingerprint: "c".repeat(64),
    },
  };
  const receivable: Record<string, unknown> = {
    id: "55555555-5555-4555-8555-555555555555",
    matricula_id: scope.matriculaId,
    turma_id: scope.turmaId,
    polo_id: scope.poloId,
    status: "PENDENTE",
    valor: amount,
    data_vencimento: dueDate,
    tipo_lancamento: "PARCELA",
    forma_pagamento: "BOLETO",
    regra_financeira_tecnica_snapshot: snapshot,
    gateway_provider: "banese_card",
    gateway_environment: "production",
    gateway_payment_method: "BOLETO",
    gateway_issuer_polo_id: scope.issuerPoloId,
    gateway_submission_channel: "API",
    gateway_submission_status: "API_REGISTERED",
    gateway_status: "PENDING",
    gateway_payment_id: bank.ourNumber,
    gateway_payment_link_id: null,
    gateway_boleto_nosso_numero: bank.ourNumber,
    gateway_boleto_linha_digitavel: bank.digitableLine,
    gateway_boleto_codigo_barras: bank.barcode,
    gateway_pix_payload: buildBanesePixPayloadFixture("STRICT-STATE", amount),
    gateway_pix_encoded_image: `data:image/png;base64,${
      buildBanesePixImageFixture(3)
    }`,
    gateway_boleto_issued_at: "2026-09-01T12:00:00Z",
  };
  receivable.gateway_financial_terms =
    strictTechnicalManualBaneseFinancialTerms(receivable);
  receivable.gateway_financial_terms_confirmed_at = "2026-09-01T12:00:00Z";
  const transaction = {
    provider_code: "banese_card",
    environment: "production",
    payment_method: "BOLETO",
    origin_polo_id: scope.poloId,
    issuer_polo_id: scope.issuerPoloId,
    remote_payment_id: bank.ourNumber,
    remote_status: "PENDING",
    amount,
    bank_slip_our_number: bank.ourNumber,
    bank_slip_digitable_line: bank.digitableLine,
    bank_slip_barcode: bank.barcode,
    pix_payload: receivable.gateway_pix_payload,
    pix_encoded_image: receivable.gateway_pix_encoded_image,
    raw_payload: { manualCycleIssuance: { attemptToken: "attempt" } },
  };
  return { receivable, payer: {}, transactions: [transaction] };
};

Deno.test("predicado local espelha estado Banese completo e polos distintos", () => {
  const loaded = strictFixture();
  assert.equal(isStrictlyIssued(loaded, scope), true);
  assert.equal(
    isStrictlyIssued({
      ...loaded,
      transactions: [{
        ...loaded.transactions[0],
        issuer_polo_id: scope.poloId,
      }],
    }, scope),
    false,
  );
  assert.equal(
    isStrictlyIssued({
      ...loaded,
      receivable: { ...loaded.receivable, gateway_status: "REGISTERING" },
    }, scope),
    false,
  );
  assert.equal(
    isStrictlyIssued({
      ...loaded,
      receivable: { ...loaded.receivable, valor_pago: 279.9 },
    }, scope),
    false,
  );
});
