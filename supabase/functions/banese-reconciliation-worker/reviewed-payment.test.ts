import assert from "node:assert/strict";
import { queryBaneseBoleto } from "../banese/core/adapter/boleto-query.ts";
import { BANESE_DOCUMENT_FIXTURE as fixture } from "../banese/internal/testing/document-fixture.ts";
import { mapBaneseFinancialTermsToPayload, normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { fakeAdmin, receivableFixture, RECEIVABLE_ID, PAYER_DOCUMENT } from "../gateways/api/banese-test-harness.ts";
import { BANESE_DISCOUNT_REMOVAL_PENDING } from "../gateways/api/banese-discount-removal.ts";
import { isReviewedPaymentInput, reconcileReviewedPayment } from "./reviewed-payment.ts";
import { handleWorkerActionRequest } from "./worker-action.ts";

const input = { receivableId: RECEIVABLE_ID, expectedAmount: fixture.amount - 10, expectedPaymentDate: fixture.dueDate };
const reviewAdmin = () => {
  const row = receivableFixture({
    gateway_environment: "production", gateway_boleto_convenio: fixture.beneficiary.agreement,
    gateway_boleto_agencia: fixture.beneficiary.agency,
    gateway_boleto_linha_digitavel: fixture.digitableLine,
    gateway_boleto_codigo_barras: fixture.barcode,
    gateway_last_error: "Consulta Banese requer revisão financeira.",
  });
  const admin = fakeAdmin(row);
  Object.assign(admin.tables.payment_gateway_transactions[0], {
    bank_slip_digitable_line: fixture.digitableLine, bank_slip_barcode: fixture.barcode,
    raw_payload: { response: { recorded: true } },
  });
  Object.assign(admin.tables.payment_gateway_credentials[0], {
    environment: "production", metadata: {
      baneseBoletoConvenio: fixture.beneficiary.agreement,
      baneseAgencia: fixture.beneficiary.agency, baneseConta: fixture.beneficiary.account,
    },
  });
  admin.tables.banese_reconciliation_queue = [{ receivable_id: RECEIVABLE_ID, environment: "production",
    state: "QUARANTINED", last_error_class: "REVIEW_REQUIRED", last_result: "ERROR", modality: "TECNICO" }];
  return admin;
};

const withBank = async (
  work: (query: typeof queryBaneseBoleto, requests: string[]) => Promise<void>,
  paymentValue = input.expectedAmount, paymentDate = input.expectedPaymentDate,
  titleOverrides: Record<string, unknown> = {},
) => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const title = {
    ...mapBaneseFinancialTermsToPayload(normalizeBaneseFinancialTerms(fixture.financialTerms!)),
    NossoNumero: fixture.ourNumber, NumeroLinhaDigitavel: fixture.digitableLine,
    NumeroCodigoBarras: fixture.barcode, ValorNominal: fixture.amount,
    DataVencimento: fixture.dueDate, CodigoSituacaoBoleto: 3,
    NumeroDocumento: RECEIVABLE_ID.slice(0, 15), IdTituloEmpresa: RECEIVABLE_ID.slice(0, 25),
    Pagador: { TipoPessoa: "F", NumeroCPFCNPJ: PAYER_DOCUMENT }, ...titleOverrides,
  };
  globalThis.fetch = async (value, init) => {
    const url = value instanceof Request ? value.url : String(value);
    const payments = url.endsWith("/pagamentos/efetivados");
    requests.push(`${init?.method ?? "GET"} ${payments ? "payments" : "title"}`);
    return new Response(JSON.stringify(payments ? { PagamentosEfetivados: [{
      ValorPago: paymentValue, DataPagamento: paymentDate, BancoRecebedor: "047",
    }] } : title), { status: 200 });
  };
  const query: typeof queryBaneseBoleto = (admin, environment, request) => {
    assert.equal(request.validateTitleIdentity, true);
    assert.equal(request.recoverPix, false);
    assert.equal(request.strictEffectivePayments, true);
    assert.equal(request.skipEffectivePaymentsWhenOfficiallyUnpaid, false);
    assert.equal(request.expectedDocumentNumber, RECEIVABLE_ID.slice(0, 15));
    assert.equal(request.expectedCompanyTitleId, RECEIVABLE_ID.slice(0, 25));
    return queryBaneseBoleto(admin, environment, { ...request, accessToken: {
      accessToken: "synthetic-token", tokenType: "Bearer", expiresIn: 3600, scope: null, raw: null,
    } });
  };
  try { await work(query, requests); } finally { globalThis.fetch = originalFetch; }
};

Deno.test("revisão explícita baixa total/data autorizados com evidência atômica e replay sem duplicar", async () => {
  const admin = reviewAdmin();
  let reviewedAt = "";
  await withBank(async (queryBoleto, requests) => {
    for (let replay = 0; replay < 2; replay++) {
      const result = await reconcileReviewedPayment(admin, input, { queryBoleto });
      assert.equal(result.success, true);
      assert.equal(result.paid, true);
      assert.equal(result.reviewRecorded, true);
      assert.equal(admin.tables.contas_receber[0].valor_pago, input.expectedAmount);
      assert.equal(admin.tables.contas_receber[0].data_pagamento, input.expectedPaymentDate);
      assert.equal(admin.tables.contas_receber[0].gateway_last_error, null);
      assert.equal(admin.tables.payment_gateway_transactions.length, 1);
      const receipt = admin.tables.payment_gateway_transactions[0].raw_payload.paymentVarianceReview;
      assert.equal(receipt.authority, "EXPLICIT_MANAGER_REVIEW");
      assert.equal(receipt.reason, "OFFICIAL_PAYMENT_CONFIRMED_WITH_UNITEMIZED_VARIANCE");
      assert.equal(receipt.amount, input.expectedAmount);
      assert.equal(receipt.paymentDate, input.expectedPaymentDate);
      assert.equal(receipt.varianceFromNominal, -10);
      assert.equal(receipt.varianceFromCalculatedExpected, 9.9);
      assert.equal(receipt.paidComponents, null);
      if (replay) assert.equal(receipt.reviewedAt, reviewedAt);
      reviewedAt = receipt.reviewedAt;
      admin.tables.banese_reconciliation_queue[0].state = "DONE";
      const serialized = JSON.stringify(result);
      for (const secret of [PAYER_DOCUMENT, fixture.digitableLine, fixture.barcode, fixture.ourNumber, "synthetic-token"]) {
        assert.equal(serialized.includes(secret), false);
      }
    }
    assert.deepEqual(requests, ["GET title", "GET payments", "GET title", "GET payments"]);
    assert.equal(admin.updateAttempts.some((attempt) => /queue|run|attempt/.test(attempt.table)), false);
    assert.deepEqual(admin.tables.inscricoes_online, []);
  });
});

Deno.test("revisão rejeita total/data diferentes, identidade remota divergente e corrida CAS", async () => {
  for (const [amount, date] of [[input.expectedAmount + .01, input.expectedPaymentDate],
    [input.expectedAmount + .001, input.expectedPaymentDate],
    [input.expectedAmount, "2026-08-16"]] as const) {
    const admin = reviewAdmin();
    await withBank(async (queryBoleto) => {
      await assert.rejects(() => reconcileReviewedPayment(admin, input, { queryBoleto }), /OFFICIAL_EVIDENCE_DIVERGENCE/);
      assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
      assert.equal(admin.updateAttempts.length, 0);
    }, amount, date);
  }
  for (const title of [{ Pagador: { TipoPessoa: "F", NumeroCPFCNPJ: "11111111111" } },
    { NumeroDocumento: "another-title" }, { IdTituloEmpresa: "another-company-title" }]) {
    const admin = reviewAdmin();
    await withBank(async (queryBoleto, requests) => {
      await assert.rejects(() => reconcileReviewedPayment(admin, input, { queryBoleto }));
      assert.deepEqual(requests, ["GET title"]);
      assert.equal(admin.updateAttempts.length, 0);
    }, input.expectedAmount, input.expectedPaymentDate, title);
  }
  const concurrent = reviewAdmin();
  concurrent.beforeReceivableUpdate = (row) => { row.updated_at = "2026-08-16T12:00:00Z"; };
  await withBank(async (queryBoleto) => {
    await assert.rejects(() => reconcileReviewedPayment(concurrent, input, { queryBoleto }), /mudou durante/);
    assert.equal(concurrent.tables.contas_receber[0].status, "PENDENTE");
    assert.equal(concurrent.tables.payment_gateway_transactions[0].raw_payload.paymentVarianceReview, undefined);
  });
});

Deno.test("revisão exige quarentena, origem API, transação única e beneficiário válido", async () => {
  for (const change of [
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.banese_reconciliation_queue[0].state = "READY"; },
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.banese_reconciliation_queue[0].last_error_class = "TIMEOUT"; },
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.contas_receber[0].gateway_submission_status = "API_AMBIGUOUS"; },
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.payment_gateway_transactions.push({ ...admin.tables.payment_gateway_transactions[0] }); },
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.payment_gateway_transactions[0].raw_payload.importSource = "BANESE_PORTAL_LEGACY_PDF"; },
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.payment_gateway_transactions[0].raw_payload.importSource = "BANESE_API_LEGACY_DISCOVERY"; },
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.contas_receber[0].gateway_environment = "sandbox"; },
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.contas_receber[0].gateway_boleto_agencia = "000"; },
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.payment_gateway_credentials[0].metadata.baneseConta = "000000000"; },
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.contas_receber[0].gateway_last_error = BANESE_DISCOUNT_REMOVAL_PENDING; },
    (admin: ReturnType<typeof reviewAdmin>) => { admin.tables.contas_receber[0].status = "PAGO"; },
  ]) {
    const admin = reviewAdmin(); change(admin);
    let queried = false;
    const queryBoleto = (() => { queried = true; throw new Error("must not query"); }) as typeof queryBaneseBoleto;
    await assert.rejects(() => reconcileReviewedPayment(admin, input, { queryBoleto }));
    assert.equal(queried, false);
    assert.equal(admin.updateAttempts.length, 0);
  }
});

Deno.test("revisão bloqueia corrida para manutenção antes de qualquer GET/PUT", async () => {
  const admin = reviewAdmin();
  const originalFrom = admin.from.bind(admin);
  let reads = 0;
  admin.from = (table: string) => {
    if (table === "contas_receber" && ++reads === 2) admin.tables.contas_receber[0].gateway_last_error = BANESE_DISCOUNT_REMOVAL_PENDING;
    return originalFrom(table);
  };
  let queried = false;
  const queryBoleto = (() => { queried = true; throw new Error("must not query"); }) as typeof queryBaneseBoleto;
  await assert.rejects(() => reconcileReviewedPayment(admin, input, { queryBoleto }), /REVIEWED_PAYMENT_MAINTENANCE_NOT_ALLOWED/);
  assert.equal(queried, false);
  assert.equal(admin.updateAttempts.length, 0);
});

const request = (body: unknown) => new Request("https://worker.test", { method: "POST", body: JSON.stringify(body) });
Deno.test("dispatcher valida centavos/data e recusa authority/motivo arbitrários", async () => {
  let calls = 0;
  const failure = async () => { calls++; throw new Error("private bank response"); };
  for (const change of [{ expectedAmount: 0 }, { expectedAmount: 10.001 }, { expectedAmount: "100" },
    { expectedPaymentDate: "2026-02-30" }, { expectedPaymentDate: "2026-15-11" },
    { authority: "arbitrary" }, { reason: "arbitrary" }, { receivableId: "invalid" }]) {
    const response = await handleWorkerActionRequest(request({ action: "reconcile_reviewed_payment", ...input, ...change }), {}, undefined, failure);
    assert.equal(response?.status, 400);
  }
  assert.equal(calls, 0);
  const response = await handleWorkerActionRequest(request({ action: "reconcile_reviewed_payment", ...input }), {}, undefined, failure);
  assert.equal(response?.status, 422);
  assert.equal((await response!.text()).includes("private"), false);
  assert.equal(calls, 1);
  assert.equal(isReviewedPaymentInput(input), true);
});
