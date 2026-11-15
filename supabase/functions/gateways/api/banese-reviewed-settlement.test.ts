import assert from "node:assert/strict";
import { reconcileBaneseReceivable } from "./banese.ts";
import { baneseDocumentFixtureAt } from "../../banese/internal/testing/document-fixture.ts";
import { normalizeBaneseFinancialTerms } from "../../banese/internal/financial-terms.ts";
import { boletoSnapshot, fakeAdmin, receivableFixture, RECEIVABLE_ID } from "./banese-test-harness.ts";
import type { BaneseReviewedSettlement, BaneseReviewedSettlementFacts } from "./banese-reviewed-settlement.ts";

const document = baneseDocumentFixtureAt(0, "2026-10-15", 100);
const terms = {
  nominalAmount: 100, dueDate: "2026-10-15",
  penalty: { type: "percentage" as const, value: 2, startsOn: "2026-10-16" },
  interest: { type: "monthly-percentage" as const, value: 2, startsOn: "2026-10-16" },
};
const setup = () => fakeAdmin(receivableFixture({
  valor: 100, data_vencimento: terms.dueDate, gateway_financial_terms: normalizeBaneseFinancialTerms(terms),
  gateway_boleto_nosso_numero: document.ourNumber, gateway_payment_id: document.ourNumber,
  gateway_boleto_linha_digitavel: document.digitableLine,
  gateway_boleto_codigo_barras: document.barcode,
  gateway_pix_payload: null, gateway_pix_encoded_image: null,
  juros: null, multa: null,
}));
const official = () => boletoSnapshot({
  nossoNumero: document.ourNumber, paid: true, situationCode: 3, remoteStatus: "PAID",
  financialTerms: terms, pixPayload: null, pixEncodedImage: null,
  payments: [{ ValorPago: 103.26, DataPagamento: "2026-11-01", BancoRecebedor: "047" }],
  raw: { CodigoSituacaoBoleto: 3, NossoNumero: document.ourNumber,
    NumeroLinhaDigitavel: document.digitableLine, NumeroCodigoBarras: document.barcode },
});
const approval = (facts: BaneseReviewedSettlementFacts) => ({
  ...facts,
  authority: "EXPLICIT_MANAGER_REVIEW" as const,
  reason: "OFFICIAL_PAYMENT_CONFIRMED_WITH_UNITEMIZED_VARIANCE" as const,
  reviewedAt: "2026-11-15T08:00:00.000Z",
});
const queryBoleto = () => Promise.resolve(official() as any);

Deno.test("automático continua bloqueando a mesma variância sem aprovação interna", async () => {
  const admin = setup();
  await assert.rejects(() => reconcileBaneseReceivable(admin, RECEIVABLE_ID, { queryBoleto }), /Valor pago.*diverge/);
  assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
  assert.equal(admin.tables.payment_gateway_transactions[0].raw_payload?.paymentVarianceReview, undefined);
  assert.equal(admin.updateAttempts.length, 0);
});

Deno.test("revisão exata persiste evidência junto à baixa sem inventar composição; replay não duplica", async () => {
  const admin = setup();
  const beforeTerms = JSON.stringify(admin.tables.contas_receber[0].gateway_financial_terms);
  let reviews = 0;
  const reviewedSettlement: BaneseReviewedSettlement = async (facts) => {
    reviews++;
    assert.equal(facts.receivableId, RECEIVABLE_ID);
    assert.equal(facts.environment, "sandbox");
    assert.equal(facts.nossoNumero, document.ourNumber);
    assert.equal(facts.amount, 103.26);
    assert.equal(facts.paymentDate, "2026-11-01");
    assert.deepEqual(facts.calculatedRange, { minimumAmount: 103.13, expectedAmount: 103.13, maximumAmount: 103.14 });
    return approval(facts);
  };
  for (let replay = 0; replay < 2; replay++) {
    const result = await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
      queryBoleto: (_client, _environment, input) => {
        assert.equal(input.strictEffectivePayments, true);
        assert.equal(input.skipEffectivePaymentsWhenOfficiallyUnpaid, false);
        return queryBoleto();
      },
      reviewedSettlement,
    });
    assert.equal(result.paid, true);
    assert.equal(admin.tables.contas_receber[0].status, "PAGO");
    assert.equal(admin.tables.contas_receber[0].valor_pago, 103.26);
    assert.equal(admin.tables.contas_receber[0].data_pagamento, "2026-11-01");
    assert.equal(admin.tables.contas_receber[0].juros, null);
    assert.equal(admin.tables.contas_receber[0].multa, null);
    assert.equal(JSON.stringify(admin.tables.contas_receber[0].gateway_financial_terms), beforeTerms);
    assert.equal(admin.tables.payment_gateway_transactions.length, 1);
    const evidence = admin.tables.payment_gateway_transactions[0].raw_payload.paymentVarianceReview;
    assert.equal(evidence.authority, "EXPLICIT_MANAGER_REVIEW");
    assert.equal(evidence.reason, "OFFICIAL_PAYMENT_CONFIRMED_WITH_UNITEMIZED_VARIANCE");
    assert.equal(evidence.amount, 103.26);
    assert.equal(evidence.varianceFromCalculatedExpected, 0.13);
    assert.equal(evidence.varianceFromNominal, 3.26);
    assert.equal(evidence.paidComponents, null);
    assert.equal(evidence.financialTerms.nominalAmount, 100);
  }
  assert.equal(reviews, 2);
});

Deno.test("erro ou aprovação divergente recusa baixa antes de persistir", async () => {
  const mutations = [
    (facts: BaneseReviewedSettlementFacts) => ({ ...approval(facts), receivableId: "22222222-2222-4222-8222-222222222222" }),
    (facts: BaneseReviewedSettlementFacts) => ({ ...approval(facts), environment: "production" }),
    (facts: BaneseReviewedSettlementFacts) => ({ ...approval(facts), nossoNumero: "999999999" }),
    (facts: BaneseReviewedSettlementFacts) => ({ ...approval(facts), amount: 103.27 }),
    (facts: BaneseReviewedSettlementFacts) => ({ ...approval(facts), paymentDate: "2026-11-02" }),
    (facts: BaneseReviewedSettlementFacts) => ({ ...approval(facts), financialTerms: { ...facts.financialTerms, nominalAmount: 101 } }),
    (facts: BaneseReviewedSettlementFacts) => ({ ...approval(facts), calculatedRange: { ...facts.calculatedRange, maximumAmount: 103.26 } }),
    (facts: BaneseReviewedSettlementFacts) => ({ ...approval(facts), authority: "AUTOMATIC" }),
    (facts: BaneseReviewedSettlementFacts) => ({ ...approval(facts), reason: "INFERRED_INTEREST" }),
    (facts: BaneseReviewedSettlementFacts) => ({ ...approval(facts), reviewedAt: "invalid" }),
    () => { throw new Error("review unavailable"); },
    (facts: BaneseReviewedSettlementFacts) => {
      facts.financialTerms.nominalAmount = 999;
      facts.calculatedRange.maximumAmount = 103.26;
      return approval(facts);
    },
  ];
  for (const mutation of mutations) {
    const admin = setup();
    await assert.rejects(() => reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
      queryBoleto, reviewedSettlement: (async facts => mutation(facts)) as BaneseReviewedSettlement,
    }));
    assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
    assert.equal(admin.tables.contas_receber[0].gateway_financial_terms.nominalAmount, 100);
    assert.equal(admin.tables.payment_gateway_transactions[0].raw_payload?.paymentVarianceReview, undefined);
    assert.equal(admin.updateAttempts.length, 0);
  }
});

Deno.test("conflito CAS conserva pendência e não grava evidência isoladamente", async () => {
  for (const kind of ["receivable", "transaction"]) {
    const admin = setup();
    if (kind === "receivable") admin.beforeReceivableUpdate = row => { row.updated_at = "2026-11-15T08:01:00.000Z"; };
    else admin.beforeTransactionUpdate = row => { row.updated_at = "2026-11-15T08:01:00.000Z"; };
    await assert.rejects(() => reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
      queryBoleto, reviewedSettlement: async facts => approval(facts),
    }), /mudou durante/);
    assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
    assert.equal(admin.tables.payment_gateway_transactions[0].raw_payload?.paymentVarianceReview, undefined);
  }
});

Deno.test("revisão não é chamada sem pagamento ou quando valor já está na faixa", async () => {
  for (const paid of [true, false]) {
    const admin = setup();
    let called = false;
    await reconcileBaneseReceivable(admin, RECEIVABLE_ID, {
      queryBoleto: () => Promise.resolve(boletoSnapshot({
        ...official(), paid, remoteStatus: paid ? "PAID" : "PENDING", situationCode: paid ? 3 : 2,
        payments: paid ? [{ ValorPago: 103.13, DataPagamento: "2026-11-01" }] : [],
      }) as any),
      reviewedSettlement: async () => { called = true; throw new Error("must not review"); },
    });
    assert.equal(called, false);
    assert.equal(admin.tables.contas_receber[0].status, paid ? "PAGO" : "PENDENTE");
    assert.equal(admin.tables.payment_gateway_transactions[0].raw_payload?.paymentVarianceReview, undefined);
  }
});
