import assert from "node:assert/strict";
import { queryBaneseBoleto } from "../banese/core/adapter/boleto-query.ts";
import { BANESE_DOCUMENT_FIXTURE as fixture } from "../banese/internal/testing/document-fixture.ts";
import { mapBaneseFinancialTermsToPayload, normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { fakeAdmin, receivableFixture, RECEIVABLE_ID, PAYER_DOCUMENT } from "../gateways/api/banese-test-harness.ts";
import { BANESE_POST_SETTLEMENT_PENDING_MESSAGE } from "../gateways/api/banese-post-settlement.ts";
import { BANESE_DISCOUNT_REMOVAL_PENDING } from "../gateways/api/banese-discount-removal.ts";
import { reconcilePortalPdfReceivable } from "./portal-pdf-reconciliation.ts";
import { handleWorkerActionRequest } from "./worker-action.ts";

const portalAdmin = () => {
  const row = receivableFixture({
    gateway_environment: "production", gateway_boleto_convenio: fixture.beneficiary.agreement,
    gateway_boleto_agencia: fixture.beneficiary.agency,
    gateway_boleto_linha_digitavel: fixture.digitableLine,
    gateway_boleto_codigo_barras: fixture.barcode,
  });
  const admin = fakeAdmin(row);
  Object.assign(admin.tables.payment_gateway_transactions[0], {
    bank_slip_digitable_line: fixture.digitableLine,
    bank_slip_barcode: fixture.barcode,
    raw_payload: { importSource: "BANESE_PORTAL_LEGACY_PDF" },
  });
  Object.assign(admin.tables.payment_gateway_credentials[0], {
    environment: "production", metadata: {
      baneseBoletoConvenio: fixture.beneficiary.agreement,
      baneseAgencia: fixture.beneficiary.agency,
      baneseConta: fixture.beneficiary.account,
    },
  });
  return admin;
};

const withBank = async (
  work: (query: typeof queryBaneseBoleto, requests: string[]) => Promise<void>,
  paymentValue = fixture.amount - 19.9,
) => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const title = {
    ...mapBaneseFinancialTermsToPayload(normalizeBaneseFinancialTerms(fixture.financialTerms!)),
    NossoNumero: fixture.ourNumber, NumeroLinhaDigitavel: fixture.digitableLine,
    NumeroCodigoBarras: fixture.barcode, ValorNominal: fixture.amount,
    DataVencimento: fixture.dueDate, CodigoSituacaoBoleto: 3,
    Pagador: { TipoPessoa: "F", NumeroCPFCNPJ: PAYER_DOCUMENT },
  };
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const payments = url.endsWith("/pagamentos/efetivados");
    requests.push(`${init?.method ?? "GET"} ${payments ? "payments" : "title"}`);
    return new Response(JSON.stringify(payments ? { PagamentosEfetivados: [{
      ValorPago: paymentValue, DataPagamento: fixture.dueDate, BancoRecebedor: "047",
    }] } : title), { status: 200 });
  };
  const query: typeof queryBaneseBoleto = (admin, environment, input) => {
    assert.equal(input.validateTitleIdentity, true);
    assert.equal(input.recoverPix, false);
    assert.equal(input.strictEffectivePayments, true);
    assert.equal(input.skipEffectivePaymentsWhenOfficiallyUnpaid, false);
    assert.equal(input.expectedDocumentNumber, undefined);
    assert.equal(input.expectedCompanyTitleId, undefined);
    return queryBaneseBoleto(admin, environment, { ...input, accessToken: {
      accessToken: "synthetic-token", tokenType: "Bearer", expiresIn: 3600, scope: null, raw: null,
    } });
  };
  try { await work(query, requests); } finally { globalThis.fetch = originalFetch; }
};

Deno.test("ação portal usa GETs, baixa CAS e pós-baixa canônicos; replay não duplica transação", async () => {
  const admin = portalAdmin();
  await withBank(async (queryBoleto, requests) => {
    for (let replay = 0; replay < 2; replay++) {
      const result = await reconcilePortalPdfReceivable(admin, RECEIVABLE_ID, { queryBoleto });
      assert.equal(result.paid, true);
      assert.equal(result.success, true);
      assert.equal(admin.tables.contas_receber[0].status, "PAGO");
      assert.equal(admin.tables.contas_receber[0].valor_pago, fixture.amount - 19.9);
      assert.equal(admin.tables.contas_receber[0].gateway_last_error, null);
      assert.equal(admin.tables.payment_gateway_transactions.length, 1);
      assert.equal(admin.tables.payment_gateway_transactions[0].raw_payload.importSource, "BANESE_PORTAL_LEGACY_PDF");
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

Deno.test("ação portal preserva bloqueio de faixa financeira e CAS", async () => {
  const admin = portalAdmin();
  await withBank(async (queryBoleto) => {
    await assert.rejects(() => reconcilePortalPdfReceivable(admin, RECEIVABLE_ID, { queryBoleto }), /Valor pago.*diverge/);
    assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
    assert.equal(admin.updateAttempts.length, 0);
  }, fixture.amount - 20);
  const concurrent = portalAdmin();
  concurrent.beforeReceivableUpdate = (row) => { row.updated_at = "2026-08-16T12:00:00Z"; };
  await withBank(async (queryBoleto) => {
    await assert.rejects(() => reconcilePortalPdfReceivable(concurrent, RECEIVABLE_ID, { queryBoleto }), /mudou durante/);
    assert.equal(concurrent.tables.contas_receber[0].status, "PENDENTE");
  });
});

Deno.test("ação portal prova origem antes de retomar PAGO pelo pós-baixa canônico sem nova consulta", async () => {
  const admin = portalAdmin();
  Object.assign(admin.tables.contas_receber[0], {
    status: "PAGO", gateway_status: "PAID", valor_pago: fixture.amount - 19.9,
    data_pagamento: fixture.dueDate, gateway_last_error: BANESE_POST_SETTLEMENT_PENDING_MESSAGE,
  });
  let queried = false;
  const queryBoleto = (() => { queried = true; throw new Error("must not query"); }) as typeof queryBaneseBoleto;
  const result = await reconcilePortalPdfReceivable(admin, RECEIVABLE_ID, { queryBoleto });
  assert.equal(queried, false);
  assert.equal(result.paid, true);
  assert.equal(result.payments, 0);
  assert.equal(admin.tables.contas_receber[0].gateway_last_error, null);
  assert.equal(admin.tables.payment_gateway_transactions.length, 1);
  admin.tables.payment_gateway_transactions[0].raw_payload.importSource = "unknown";
  await assert.rejects(() => reconcilePortalPdfReceivable(admin, RECEIVABLE_ID, { queryBoleto }), /PORTAL_PROVENANCE/);
});

Deno.test("ação portal rejeita par oficial diferente antes de qualquer persistência", async () => {
  const admin = portalAdmin();
  await withBank(async (queryBoleto) => {
    await assert.rejects(() => reconcilePortalPdfReceivable(admin, RECEIVABLE_ID, {
      queryBoleto: async (client, environment, input) => {
        const snapshot = await queryBoleto(client, environment, input);
        return { ...snapshot, raw: { ...snapshot.raw, NumeroCodigoBarras: "0".repeat(44) } };
      },
    }), /PORTAL_OFFICIAL_BANK_EVIDENCE_DIVERGENCE/);
    assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
    assert.equal(admin.updateAttempts.length, 0);
  });
});

Deno.test("ação portal bloqueia marcador de manutenção antes do reconciliador", async () => {
  const admin = portalAdmin();
  admin.tables.contas_receber[0].gateway_last_error = BANESE_DISCOUNT_REMOVAL_PENDING;
  let called = false;
  const blocked = async () => { called = true; throw new Error("must not call"); };
  await assert.rejects(() => reconcilePortalPdfReceivable(admin, RECEIVABLE_ID, {
    reconcile: blocked, queryBoleto: blocked,
  }), /PORTAL_MAINTENANCE_NOT_ALLOWED/);
  assert.equal(called, false);
  assert.equal(admin.updateAttempts.length, 0);
});

Deno.test("ação portal bloqueia manutenção introduzida entre contexto e releitura canônica", async () => {
  const admin = portalAdmin();
  const originalFrom = admin.from.bind(admin);
  let reads = 0;
  admin.from = (table: string) => {
    if (table === "contas_receber" && ++reads === 2) {
      admin.tables.contas_receber[0].gateway_last_error = BANESE_DISCOUNT_REMOVAL_PENDING;
    }
    return originalFrom(table);
  };
  let queried = false;
  const queryBoleto = (() => { queried = true; throw new Error("must not query"); }) as typeof queryBaneseBoleto;
  await assert.rejects(() => reconcilePortalPdfReceivable(admin, RECEIVABLE_ID, { queryBoleto }), /PORTAL_MAINTENANCE_NOT_ALLOWED/);
  assert.equal(reads, 2);
  assert.equal(queried, false);
  assert.equal(admin.updateAttempts.length, 0);
  assert.equal(admin.tables.contas_receber[0].status, "PENDENTE");
});

Deno.test("ação portal rejeita origem, duplicidade, par, ambiente ou beneficiário inválidos", async () => {
  for (const change of [
    (admin: ReturnType<typeof portalAdmin>) => { admin.tables.payment_gateway_transactions[0].raw_payload.importSource = "BANESE_API_LEGACY_DISCOVERY"; },
    (admin: ReturnType<typeof portalAdmin>) => { admin.tables.payment_gateway_transactions.push({ ...admin.tables.payment_gateway_transactions[0] }); },
    (admin: ReturnType<typeof portalAdmin>) => { admin.tables.payment_gateway_transactions[0].bank_slip_barcode = "0".repeat(44); },
    (admin: ReturnType<typeof portalAdmin>) => { admin.tables.payment_gateway_transactions[0].amount += 1; },
    (admin: ReturnType<typeof portalAdmin>) => { admin.tables.contas_receber[0].gateway_environment = "sandbox"; },
    (admin: ReturnType<typeof portalAdmin>) => { admin.tables.contas_receber[0].gateway_boleto_agencia = "000"; },
    (admin: ReturnType<typeof portalAdmin>) => { admin.tables.payment_gateway_credentials[0].metadata.baneseConta = "000000000"; },
  ]) {
    const admin = portalAdmin(); change(admin);
    let queried = false;
    const queryBoleto = (() => { queried = true; throw new Error("must not query"); }) as typeof queryBaneseBoleto;
    await assert.rejects(() => reconcilePortalPdfReceivable(admin, RECEIVABLE_ID, { queryBoleto }));
    assert.equal(queried, false);
    assert.equal(admin.updateAttempts.length, 0);
  }
});

const request = (body?: unknown) => new Request("https://worker.test", { method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body) });

Deno.test("dispatcher retorna ações inválidas/erro sem cair em manutenção e preserva corpo vazio", async () => {
  let calls = 0;
  const reconcile = async () => { calls++; throw new Error("private bank payload"); };
  for (const body of [
    { action: "reconcile_portal_pdf_receivable", receivableId: "invalid" },
    { action: "reconcile_portal_pdf_receivable", receivableId: RECEIVABLE_ID, extra: true },
    { action: "reconcile_portal_pdf_receivable", receivableId: RECEIVABLE_ID },
  ]) {
    const response = await handleWorkerActionRequest(request(body), {}, reconcile);
    assert.ok(response);
    assert.ok([400, 422].includes(response.status));
    assert.equal((await response.text()).includes("private"), false);
  }
  assert.equal(calls, 1);
  assert.equal(await handleWorkerActionRequest(request(), {}, reconcile), null);
  assert.equal(await handleWorkerActionRequest(request({}), {}, reconcile), null);
  const source = await Deno.readTextFile(new URL("./handler.ts", import.meta.url));
  const auth = source.indexOf("if (!safeEqual(requestSecret, configuredSecret))");
  const dispatcher = source.indexOf("const diagnostic = await handleWorkerActionRequest(req, admin)");
  const earlyReturn = source.indexOf("if (diagnostic) return diagnostic");
  assert.ok(auth > 0 && auth < dispatcher && dispatcher < earlyReturn);
  assert.ok(earlyReturn < source.indexOf("await processOneBaneseEadTitleReplacement"));
});
