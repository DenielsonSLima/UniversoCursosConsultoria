import assert from "node:assert/strict";
import {
  checkOtherCreditPayment,
  parseOtherCreditAction,
} from "./payment-check.ts";
import {
  PaymentReadError,
  type readOtherCreditPayment,
} from "./payment-reader.ts";
import { createPdvBankQuery } from "./payment-check-query.ts";
import { BANESE_DOCUMENT_FIXTURE as bank } from "../banese/internal/testing/document-fixture.ts";

const ID = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-000000000002";
const NOW = Date.parse("2026-09-27T01:00:00Z");
type Dto = Awaited<ReturnType<typeof readOtherCreditPayment>>;
const dto = (overrides: Partial<Dto> = {}, status = "PENDENTE"): Dto => ({
  payment: {
    id: ID,
    descricao: "Crédito sintético",
    categoria: "OUTROS_CREDITOS",
    valor: 3,
    valor_pago: status === "PAGO" ? 3 : null,
    data_vencimento: "2026-09-27",
    data_pagamento: status === "PAGO" ? "2026-09-27" : null,
    status,
    gateway_provider: "banese_card",
    gateway_environment: "production",
    gateway_payment_method: "BOLETO",
    gateway_status: status === "PAGO" ? "PAID" : "OPEN",
    gateway_invoice_url: null,
    gateway_boleto_linha_digitavel: null,
    gateway_boleto_codigo_barras: null,
    gateway_boleto_nosso_numero: "123456789",
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
    parceiros: { nome: "Sintético" },
  },
  customerName: "Sintético",
  canPay: true,
  canRefresh: status !== "PAGO",
  boletoAvailable: true,
  pixState: "pending",
  needsReview: false,
  ...overrides,
});
const req = () =>
  new Request("https://example.test/check", {
    headers: { authorization: "Bearer synthetic" },
  });
const mock = (options: {
  claim?: Record<string, unknown>;
  initial?: Dto;
  final?: Dto;
  failure?: unknown;
  auditFailure?: string;
  aborted?: boolean;
} = {}) => {
  const calls: Array<{ name: string; args: any }> = [];
  let reads = 0;
  const admin = {
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return {
        data: name === "claim_banese_pdv_confirmation"
          ? options.claim ??
            { enabled: true, runId: RUN, environment: "production" }
          : {},
        error: name === options.auditFailure
          ? new Error("private SQL detail")
          : null,
      };
    },
  };
  const query = async () => {
    throw new Error("No real bank permitted in test");
  };
  const dependencies = {
    now: () => NOW,
    read: async () =>
      ++reads === 1 ? options.initial ?? dto() : options.final ?? dto(),
    query: (..._args: any[]) => query,
    reconcile: async (_admin: any, id: unknown, adapters?: any) => {
      calls.push({ name: "reconcile", args: id });
      assert.equal(id, ID);
      assert.equal(adapters.queryBoleto, query);
      assert.equal(
        adapters.signal,
        undefined,
        "Bank deadline must not abort persistence",
      );
      await assert.rejects(adapters.repairDiscountRemoval(), /bloqueada/);
      if (options.failure) throw options.failure;
      return {
        paid: options.final?.payment.status === "PAGO",
        remoteStatus: "OPEN",
      } as any;
    },
  };
  return { admin, dependencies, calls };
};

Deno.test("dispatch accepts only get/check and valid existing UUID", () => {
  for (const action of ["get", "check"]) {
    assert.deepEqual(parseOtherCreditAction({ action, receivableId: ID }), {
      action,
      receivableId: ID,
    });
  }
  for (const action of ["create", "refresh", "cancel", "replace", undefined]) {
    assert.throws(
      () => parseOtherCreditAction({ action, receivableId: ID }),
      PaymentReadError,
    );
  }
  assert.throws(
    () => parseOtherCreditAction({ action: "check", receivableId: "OR 1=1" }),
    PaymentReadError,
  );
});

Deno.test("authorization failure precedes claim and bank", async () => {
  const m = mock();
  await assert.rejects(
    checkOtherCreditPayment(req(), m.admin, ID, {
      ...m.dependencies,
      read: async () => {
        throw new PaymentReadError(403, "Acesso negado");
      },
    }),
    (error) => error instanceof PaymentReadError && error.status === 403,
  );
  assert.deepEqual(m.calls, []);
});

Deno.test("paid, read-only role, review and terminal states never claim or query", async () => {
  for (
    const initial of [
      dto({}, "PAGO"),
      dto({ canRefresh: false }),
      dto({ needsReview: true }),
      dto({}, "CANCELADO"),
      dto({}, "ESTORNADO"),
    ]
  ) {
    const m = mock({ initial });
    const result = await checkOtherCreditPayment(
      req(),
      m.admin,
      ID,
      m.dependencies,
    );
    assert.equal(result.confirmation.status, "STOPPED");
    assert.equal(result.confirmation.retryAfterMs, null);
    assert.deepEqual(m.calls, []);
  }
});

Deno.test("interval, budget, lease, pause and cooldown never call bank", async () => {
  for (
    const reason of [
      "INTERVAL",
      "BUSY",
      "BUDGET",
      "COOLDOWN",
      "PAUSED",
      "SUSPENDED",
      "INELIGIBLE",
    ]
  ) {
    const m = mock({ claim: { enabled: false, reason, retryAfterMs: 32_000 } });
    const result = await checkOtherCreditPayment(
      req(),
      m.admin,
      ID,
      m.dependencies,
    );
    assert.equal(result.confirmation.reason, reason);
    assert.equal(
      result.confirmation.status,
      ["PAUSED", "SUSPENDED", "INELIGIBLE"].includes(reason)
        ? "STOPPED"
        : "WAITING",
    );
    assert.equal(m.calls.length, 1);
  }
});

Deno.test("successful pending check audits once, finishes and refreshes canonical DTO", async () => {
  const m = mock();
  const result = await checkOtherCreditPayment(
    req(),
    m.admin,
    ID,
    m.dependencies,
  );
  assert.deepEqual(m.calls.map((c) => c.name), [
    "claim_banese_pdv_confirmation",
    "reconcile",
    "record_banese_reconciliation_attempt",
    "finish_banese_reconciliation_run",
  ]);
  assert.equal(m.calls[2].args.p_result, "PENDING");
  assert.equal(result.confirmation.status, "CHECKED");
  assert.equal(result.confirmation.retryAfterMs, 15_000);
  assert.equal(result.confirmation.nextCheckAt, "2026-09-27T01:00:15.000Z");
});

Deno.test("confirmed payment stops promptly and does not depend on browser lifetime", async () => {
  const m = mock({ final: dto({}, "PAGO") });
  const abort = new AbortController();
  abort.abort();
  const request = new Request(req(), { signal: abort.signal });
  const result = await checkOtherCreditPayment(
    request,
    m.admin,
    ID,
    m.dependencies,
  );
  assert.equal(result.payment.status, "PAGO");
  assert.equal(result.confirmation.reason, "PAID");
  assert.equal(m.calls[2].args.p_result, "PAID");
  assert.equal(m.calls.at(-1)?.name, "finish_banese_reconciliation_run");
});

Deno.test("late post-settlement or audit error cannot reopen confirmed payment", async () => {
  for (
    const change of [
      {
        failure: new Error(
          "BANESE_POST_SETTLEMENT_PENDING: pending projection",
        ),
      },
      { auditFailure: "record_banese_reconciliation_attempt" },
      { auditFailure: "finish_banese_reconciliation_run" },
    ]
  ) {
    const m = mock({ final: dto({}, "PAGO"), ...change });
    const result = await checkOtherCreditPayment(
      req(),
      m.admin,
      ID,
      m.dependencies,
    );
    assert.equal(result.confirmation.status, "STOPPED");
    assert.equal(result.confirmation.reason, "PAID");
    assert.equal(
      m.calls.filter((c) => c.name === "record_banese_reconciliation_attempt")
        .length,
      1,
    );
  }
});

Deno.test("bank errors preserve audit/circuit and never expose raw payload", async () => {
  for (
    const [failure, outcome, wait] of [
      [new Error("Banese (429): private payload"), "THROTTLED", 3_600_000],
      [new Error("Banese (401): private token"), "ERROR", 900_000],
      [
        new globalThis.DOMException("Banese query timeout", "TimeoutError"),
        "ERROR",
        900_000,
      ],
      [new Error("Valor pago no Banese diverge: private"), "ERROR", 900_000],
    ] as const
  ) {
    const m = mock({ failure });
    const result = await checkOtherCreditPayment(
      req(),
      m.admin,
      ID,
      m.dependencies,
    );
    assert.equal(result.confirmation.status, "WAITING");
    assert.equal(result.confirmation.reason, "ERROR");
    assert.equal(result.confirmation.retryAfterMs, wait);
    assert.equal(m.calls[2].args.p_result, outcome);
    assert.equal(m.calls[3].name, "finish_banese_reconciliation_run");
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
});

Deno.test("invalid reservation or different environment fails closed before bank", async () => {
  for (
    const claim of [{
      enabled: true,
      runId: "invalid",
      environment: "production",
    }, { enabled: true, runId: RUN, environment: "sandbox" }]
  ) {
    const m = mock({ claim });
    await assert.rejects(
      checkOtherCreditPayment(req(), m.admin, ID, m.dependencies),
      PaymentReadError,
    );
    assert.equal(m.calls.length, 1);
  }
});

Deno.test("bank query uses at most six calls, one OAuth retry and mandatory effective payments", async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  let effectiveReads = 0;
  globalThis.fetch = async (input, init) => {
    const method = String(init?.method ?? "GET");
    methods.push(method);
    if (method === "POST") {
      assert.match(String(init?.body), /grant_type=client_credentials/);
      return new Response(
        JSON.stringify({ access_token: "fixture", expires_in: 0 }),
      );
    }
    assert.equal(method, "GET");
    if (String(input).endsWith("/pagamentos/efetivados")) {
      effectiveReads++;
      if (effectiveReads === 1) return new Response("{}", { status: 401 });
      return new Response(
        JSON.stringify({ PagamentosEfetivados: [{ ValorPago: bank.amount }] }),
      );
    }
    return new Response(JSON.stringify({
      NossoNumero: bank.ourNumber,
      ValorNominal: bank.amount,
      DataVencimento: bank.dueDate,
      CodigoSituacaoBoleto: 2,
    }));
  };
  try {
    const admin = { rpc: async () => ({ data: "fixture", error: null }) };
    const metrics = { requests: 0, reused: false };
    const query = createPdvBankQuery(
      admin,
      "production",
      60,
      new AbortController().signal,
      metrics,
    );
    const result = await query(admin, "production", {
      convenio: bank.beneficiary.agreement,
      nossoNumero: bank.ourNumber,
      skipEffectivePaymentsWhenOfficiallyUnpaid: true,
    });
    assert.equal(
      result.paid,
      true,
      "Effective payment supersedes the OPEN title status",
    );
    assert.equal(effectiveReads, 2);
    assert.equal(metrics.requests, 2);
    assert.deepEqual(methods, ["POST", "GET", "GET", "POST", "GET", "GET"]);
    await assert.rejects(
      query(admin, "sandbox", { convenio: "1", nossoNumero: bank.ourNumber }),
      /diverge/,
    );
    assert.equal(methods.length, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
