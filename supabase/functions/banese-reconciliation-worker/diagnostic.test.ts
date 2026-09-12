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
) => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push(`${init?.method ?? "GET"} ${url.endsWith("/pagamentos/efetivados") ? "payments" : "title"}`);
    return new Response(JSON.stringify(url.endsWith("/pagamentos/efetivados")
      ? { PagamentosEfetivados: [{ ValorPago: fixture.amount - 10, DataPagamento: fixture.dueDate,
        CPF: fixture.payer.document, token: "never-expose-this-token", "unsafe-key": "private" }] }
      : title));
  };
  const query: typeof queryBaneseBoleto = (admin, environment, input) => {
    assert.equal(input.recoverPix, false);
    assert.equal(input.skipEffectivePaymentsWhenOfficiallyUnpaid, false);
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
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const auth = source.indexOf("if (!safeEqual(requestSecret, configuredSecret))");
  const diagnostic = source.indexOf("const diagnostic = await handleDiagnosticRequest(req, admin)");
  const earlyReturn = source.indexOf("if (diagnostic) return diagnostic");
  assert.ok(auth > 0 && auth < diagnostic && diagnostic < earlyReturn);
  for (const call of ["await processOneBaneseEadTitleReplacement", "await recoverEadAmbiguousTitlesOnce",
    "await repairMarkedBaneseDiscountBeforeBatch", "await recoverBaneseIncidentBatch",
    "\"prepare_banese_reconciliation_batch_v3\"", "await reconcileBaneseReceivable"]) {
    assert.ok(source.indexOf(call) > earlyReturn, call);
  }
});
