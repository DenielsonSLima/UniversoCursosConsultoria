import assert from "node:assert/strict";
import { queryBaneseBoleto } from "../banese/core/adapter/boleto-query.ts";
import { BANESE_DOCUMENT_FIXTURE as fixture } from "../banese/internal/testing/document-fixture.ts";
import { diagnoseBaneseReceivable, handleDiagnosticRequest } from "./diagnostic.ts";

const receivableId = "11111111-1111-4111-8111-111111111111";
const terms = { nominalAmount: fixture.amount, dueDate: fixture.dueDate };
const row = {
  id: receivableId, cliente_id: "synthetic-payer",
  gateway_provider: "banese_card", gateway_payment_method: "BOLETO",
  gateway_environment: "production", gateway_submission_channel: "API",
  gateway_submission_status: "API_REGISTERED",
  gateway_boleto_nosso_numero: fixture.ourNumber,
  gateway_payment_id: fixture.ourNumber,
  gateway_boleto_convenio: fixture.beneficiary.agreement,
  gateway_financial_terms: terms, valor: fixture.amount,
  data_vencimento: fixture.dueDate,
};
const transaction = {
  id: "22222222-2222-4222-8222-222222222222",
  bank_slip_our_number: fixture.ourNumber, remote_payment_id: fixture.ourNumber,
  amount: fixture.amount,
  raw_payload: { importSource: "BANESE_API_LEGACY_DISCOVERY" },
};
const bankTitle = {
  NossoNumero: fixture.ourNumber,
  NumeroLinhaDigitavel: fixture.digitableLine,
  NumeroCodigoBarras: fixture.barcode,
  ValorNominal: fixture.amount, DataVencimento: fixture.dueDate,
  DataLimitePagamento: "2027-02-14",
  CodigoSituacaoBoleto: 3,
  Pagador: { TipoPessoa: "F", NumeroCPFCNPJ: fixture.payer.document },
};

const fakeAdmin = (changes: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    contas_receber: row, payment_gateway_transactions: [transaction],
    parceiros: { cpf_cnpj: fixture.payer.document },
    payment_gateway_credentials: { metadata: {} }, ...changes,
  };
  const calls: string[] = [];
  const admin = {
    from(table: string) {
      calls.push(table);
      assert.ok(table in values);
      const result = { data: values[table], error: null };
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve(result); },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); },
      };
      // No update/insert/delete/RPC methods: any persistence fails the test.
      return chain;
    },
  };
  return { admin, calls };
};

const withOfficialQuery = async (
  title: Record<string, unknown>,
  work: (query: typeof queryBaneseBoleto, requests: string[]) => Promise<void>,
  paymentResponse?: { status: number; body: unknown },
) => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push(`${init?.method ?? "GET"} ${url.endsWith("/pagamentos/efetivados") ? "payments" : "title"}`);
    return new Response(JSON.stringify(url.endsWith("/pagamentos/efetivados")
      && paymentResponse ? paymentResponse.body : url.endsWith("/pagamentos/efetivados")
      ? { PagamentosEfetivados: [{ ValorPago: fixture.amount - 10, DataPagamento: fixture.dueDate,
        CPF: fixture.payer.document, token: "never-expose-this-token", "unsafe-key": "private" }] }
      : title), { status: url.endsWith("/pagamentos/efetivados") ? paymentResponse?.status ?? 200 : 200 });
  };
  const query: typeof queryBaneseBoleto = (admin, environment, input) => {
    assert.equal(input.recoverPix, false);
    assert.equal(input.skipEffectivePaymentsWhenOfficiallyUnpaid, false);
    assert.equal(input.strictEffectivePayments, true);
    assert.equal(input.validateTitleIdentity, true);
    return queryBaneseBoleto(admin, environment, {
      ...input, accessToken: { accessToken: "synthetic-token", tokenType: "Bearer", expiresIn: 3600, scope: null, raw: null },
    });
  };
  try { await work(query, requests); } finally { globalThis.fetch = originalFetch; }
};

Deno.test("diagnóstico consulta somente GETs, mostra divergência sem baixar e sanitiza dados", async () => {
  const { admin, calls } = fakeAdmin();
  await withOfficialQuery(bankTitle, async (query, requests) => {
    const result = await diagnoseBaneseReceivable(admin, receivableId, query);
    assert.deepEqual(requests, ["GET title", "GET payments"]);
    assert.equal(result.readOnly, true);
    assert.equal(result.paid, true);
    assert.equal(result.strictEffectivePayments, true);
    assert.equal(result.lastPaymentDate, "2027-02-14");
    assert.equal(result.amount, fixture.amount - 10);
    assert.equal(result.paymentDate, fixture.dueDate);
    assert.equal(result.withinCalculatedRange, false);
    assert.equal(result.calculatedRange?.expectedAmount, fixture.amount);
    assert.equal(result.payments[0].officialComponents, null);
    assert.deepEqual(result.payments[0].detectedPaymentFieldNames, ["CPF", "DataPagamento", "ValorPago", "token"]);
    const serialized = JSON.stringify(result);
    for (const secret of [fixture.ourNumber, fixture.payer.document, "never-expose-this-token", fixture.barcode]) {
      assert.equal(serialized.includes(secret), false);
    }
    assert.equal(calls.some((name) => /queue|attempt|run/.test(name)), false);
  });
});

const portalRow = {
  ...row,
  gateway_boleto_agencia: fixture.beneficiary.agency,
  gateway_boleto_linha_digitavel: fixture.digitableLine,
  gateway_boleto_codigo_barras: fixture.barcode,
};
const portalTransaction = {
  ...transaction,
  bank_slip_digitable_line: fixture.digitableLine,
  bank_slip_barcode: fixture.barcode,
  raw_payload: { importSource: "BANESE_PORTAL_LEGACY_PDF" },
};
const portalCredential = { metadata: {
  baneseAgencia: fixture.beneficiary.agency,
  baneseConta: fixture.beneficiary.account,
} };
const portalAdmin = (changes: Record<string, unknown> = {}) => fakeAdmin({
  contas_receber: portalRow,
  payment_gateway_transactions: [portalTransaction],
  payment_gateway_credentials: portalCredential,
  ...changes,
});

Deno.test("diagnóstico de PDF legado prova vínculo e beneficiário sem exigir IDs de POST inexistentes", async () => {
  for (const raw_payload of [portalTransaction.raw_payload, JSON.stringify(portalTransaction.raw_payload)]) {
    const { admin, calls } = portalAdmin({ payment_gateway_transactions: [{ ...portalTransaction, raw_payload }] });
    await withOfficialQuery(bankTitle, async (query, requests) => {
      const result = await diagnoseBaneseReceivable(admin, receivableId, (client, environment, input) => {
        assert.equal(input.expectedDocumentNumber, undefined);
        assert.equal(input.expectedCompanyTitleId, undefined);
        assert.equal(input.expectedPayerDocument, fixture.payer.document);
        assert.equal(input.expectedAgency, fixture.beneficiary.agency);
        assert.equal(input.expectedAccount, fixture.beneficiary.account);
        return query(client, environment, input);
      });
      assert.deepEqual(requests, ["GET title", "GET payments"]);
      assert.equal(result.readOnly, true);
      assert.deepEqual(result.bankNumberComparison, {
        portalPdfEvidenceVerified: true,
        officialLinePresent: true, officialBarcodePresent: true,
        localLinePresent: true, localBarcodePresent: true,
        localLineMatchesOfficial: true, localBarcodeMatchesOfficial: true,
      });
      assert.equal(calls.some((name) => /queue|attempt|run/.test(name)), false);
      const serialized = JSON.stringify(result);
      for (const secret of [fixture.ourNumber, fixture.payer.document, fixture.digitableLine,
        fixture.barcode, "never-expose-this-token"]) assert.equal(serialized.includes(secret), false);
    });
  }
});

Deno.test("diagnóstico de PDF legado recusa prova local ou beneficiário incompletos antes da API", async () => {
  let queried = false;
  const query = (() => { queried = true; throw new Error("must not query"); }) as typeof queryBaneseBoleto;
  for (const changes of [
    { contas_receber: { ...portalRow, gateway_boleto_linha_digitavel: null } },
    { contas_receber: { ...portalRow, gateway_boleto_codigo_barras: null } },
    { payment_gateway_transactions: [{ ...portalTransaction, bank_slip_digitable_line: "1".repeat(47) }] },
    { payment_gateway_transactions: [{ ...portalTransaction, bank_slip_barcode: "1".repeat(44) }] },
    { payment_gateway_transactions: [{ ...portalTransaction, amount: fixture.amount + 1 }] },
    { payment_gateway_credentials: { metadata: {} } },
    { contas_receber: { ...portalRow, gateway_boleto_agencia: "000" } },
    { payment_gateway_credentials: { metadata: { ...portalCredential.metadata, baneseConta: "000000000" } } },
  ]) await assert.rejects(() => diagnoseBaneseReceivable(portalAdmin(changes).admin, receivableId, query));
  assert.equal(queried, false);
});

Deno.test("origem diferente de PDF legado não dispensa a identidade do POST", async () => {
  for (const raw_payload of [{ importSource: "BANESE_PORTAL_LEGACY" }, { importSource: "unknown" }, "bad-json"]) {
    await withOfficialQuery(bankTitle, async (query, requests) => {
      await assert.rejects(() => diagnoseBaneseReceivable(portalAdmin({
        payment_gateway_transactions: [{ ...portalTransaction, raw_payload }],
      }).admin, receivableId, query), /NumeroDocumento/);
      assert.deepEqual(requests, ["GET title"]);
    });
  }
});

Deno.test("diagnóstico de PDF legado preserva validações oficiais de CPF, valor, vencimento e ASBACE", async () => {
  for (const scenario of [
    { title: { ...bankTitle, Pagador: undefined }, changes: {}, reason: /CPF/ },
    { title: { ...bankTitle, ValorNominal: fixture.amount + 1 }, changes: {}, reason: /ValorNominal/ },
    { title: { ...bankTitle, DataVencimento: "2026-08-16" }, changes: {}, reason: /DataVencimento/ },
    { title: bankTitle, changes: { payment_gateway_credentials: { metadata: {
      ...portalCredential.metadata, baneseConta: "999999999",
    } } }, reason: /Conta.*ASBACE/ },
    { title: bankTitle, changes: { contas_receber: { ...portalRow, gateway_boleto_agencia: "034" } }, reason: /Nosso Numero|Agencia.*ASBACE/ },
  ]) {
    await withOfficialQuery(scenario.title, async (query, requests) => {
      await assert.rejects(() => diagnoseBaneseReceivable(portalAdmin(scenario.changes).admin, receivableId, query), scenario.reason);
      assert.deepEqual(requests, ["GET title"]);
    });
  }
});

Deno.test("diagnóstico strict não infere não pago de 404 ou envelope bancário incompleto", async () => {
  for (const response of [{ status: 404, body: {} },
    { status: 200, body: { PagamentosEfetivados: [] , Erros: [{ CodigoErroProcessamento: "500" }] } },
    { status: 200, body: { unexpected: true } }]) {
    await withOfficialQuery(bankTitle, async (query, requests) => {
      await assert.rejects(() => diagnoseBaneseReceivable(fakeAdmin().admin, receivableId, query), /PagamentosEfetivados/);
      assert.deepEqual(requests, ["GET title", "GET payments"]);
    }, response);
  }
});

Deno.test("diagnóstico recusa data limite ausente ou inválida sem persistir", async () => {
  for (const DataLimitePagamento of [undefined, "2026-02-30", "2000-01-01"]) {
    await withOfficialQuery({ ...bankTitle, DataLimitePagamento }, async (query) => {
      await assert.rejects(() => diagnoseBaneseReceivable(fakeAdmin().admin, receivableId, query), /RECEIPT_DEADLINE/);
    });
  }
});

Deno.test("diagnóstico rejeita CPF remoto ausente/divergente antes de pagamentos", async () => {
  for (const Pagador of [undefined, { TipoPessoa: "F", NumeroCPFCNPJ: "11111111111" }]) {
    await withOfficialQuery({ ...bankTitle, Pagador }, async (query, requests) => {
      await assert.rejects(() => diagnoseBaneseReceivable(fakeAdmin().admin, receivableId, query), /CPF/);
      assert.deepEqual(requests, ["GET title"]);
    });
  }
});

Deno.test("diagnóstico recusa UUID, banco, ambiente e transação ambígua antes da API", async () => {
  let queried = false;
  const query = (() => { queried = true; throw new Error("must not query"); }) as typeof queryBaneseBoleto;
  await assert.rejects(() => diagnoseBaneseReceivable(fakeAdmin().admin, "invalid", query));
  for (const changes of [
    { contas_receber: { ...row, gateway_provider: "other" } },
    { contas_receber: { ...row, gateway_environment: "invalid" } },
    { payment_gateway_transactions: [] },
    { payment_gateway_transactions: [transaction, transaction] },
    { payment_gateway_transactions: [{ ...transaction, remote_payment_id: "999999999" }] },
  ]) {
    await assert.rejects(() => diagnoseBaneseReceivable(fakeAdmin(changes).admin, receivableId, query));
  }
  assert.equal(queried, false);
});

const request = (body?: unknown) => new Request("https://worker.test", {
  method: "POST", body: body === undefined ? undefined : JSON.stringify(body),
});

Deno.test("diagnóstico inválido/erro nunca cai na manutenção ou conciliação normal", async () => {
  let diagnoseCalls = 0;
  const failure = async () => { diagnoseCalls++; throw new Error("private bank payload CPF secret"); };
  for (const body of [
    { action: "unknown" }, { action: "diagnose_receivable", receivableId: "bad" },
    { action: "diagnose_receivable", receivableId, extra: true },
    { action: "diagnose_receivable", receivableId },
  ]) {
    const result = await handleDiagnosticRequest(request(body), {}, failure);
    assert.ok(result); // Every diagnostic outcome returns, never the normal branch.
    assert.ok([400, 422].includes(result.status));
    assert.equal((await result.text()).includes("private"), false);
  }
  assert.equal(diagnoseCalls, 1);
  assert.equal(await handleDiagnosticRequest(request(), {}, failure), null);
  assert.equal(await handleDiagnosticRequest(request({}), {}, failure), null);
});

Deno.test("entrada autentica antes do diagnóstico e retorna antes de toda manutenção", async () => {
  const source = await Deno.readTextFile(new URL("./handler.ts", import.meta.url));
  const auth = source.indexOf("if (!safeEqual(requestSecret, configuredSecret))");
  const diagnostic = source.indexOf("const diagnostic = await handleWorkerActionRequest(req, admin)");
  const earlyReturn = source.indexOf("if (diagnostic) return diagnostic");
  assert.ok(auth > 0 && auth < diagnostic && diagnostic < earlyReturn);
  for (const call of ["await processOneBaneseEadTitleReplacement", "await recoverEadAmbiguousTitlesOnce",
    "await repairMarkedBaneseDiscountBeforeBatch", "await recoverBaneseIncidentBatch",
    "\"prepare_banese_reconciliation_batch_v3\"", "await reconcileBaneseReceivable"]) {
    assert.ok(source.indexOf(call) > earlyReturn, call);
  }
});
