import assert from "node:assert/strict";
import {
  claimEadBanesePixRetry,
  EAD_BANESE_PIX_RETRY_COOLDOWN_MS,
  recoverMissingEadBanesePix,
  shouldRetryMissingEadBanesePix,
} from "./ead-banese-pix-recovery.ts";

const RECEIVABLE_ID = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-08-31T22:00:00.000Z");

const buildReceivable = (overrides: Record<string, unknown> = {}) => ({
  id: RECEIVABLE_ID,
  status: "PENDENTE",
  data_pagamento: null,
  gateway_provider: "banese_card",
  gateway_environment: "production",
  gateway_payment_method: "BOLETO",
  gateway_pix_payload: null,
  gateway_pix_encoded_image: null,
  gateway_boleto_nosso_numero: "000097302",
  gateway_boleto_linha_digitavel: "0".repeat(47),
  gateway_boleto_codigo_barras: "0".repeat(44),
  gateway_boleto_convenio: "15223",
  gateway_financial_terms: {
    nominalAmount: 99.9,
    dueDate: "2026-09-07",
  },
  gateway_financial_terms_confirmed_at: "2026-08-31T21:00:00.000Z",
  gateway_synced_at: "2026-08-31T21:58:00.000Z",
  gateway_boleto_issued_at: "2026-08-31T19:00:00.000Z",
  gateway_last_error: null,
  created_at: "2026-08-31T19:00:00.000Z",
  updated_at: "2026-08-31T21:58:00.000Z",
  turmas: { nome: "EAD Turma Única" },
  ...overrides,
});

Deno.test("claim duravel usa CAS do snapshot antes de consultar o banco", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const filters: Array<[string, string, unknown]> = [];
  const query: any = {
    update: (value: Record<string, unknown>) => {
      updates.push(value);
      return query;
    },
    eq: (field: string, value: unknown) => {
      filters.push(["eq", field, value]);
      return query;
    },
    is: (field: string, value: unknown) => {
      filters.push(["is", field, value]);
      return query;
    },
    select: () => query,
    maybeSingle: () =>
      Promise.resolve({ data: { id: RECEIVABLE_ID }, error: null }),
  };
  const attemptedAt = new Date(NOW).toISOString();
  const claimed = await claimEadBanesePixRetry(
    {
      from: (table: string) => {
        assert.equal(table, "contas_receber");
        return query;
      },
    },
    { receivable: buildReceivable(), attemptedAt },
  );

  assert.equal(claimed, true);
  assert.deepEqual(updates, [{
    gateway_synced_at: attemptedAt,
    updated_at: attemptedAt,
  }]);
  assert.equal(
    filters.some(([operator, field]) =>
      operator === "eq" && field === "updated_at"
    ),
    true,
  );
  assert.equal(
    filters.some(([operator, field]) =>
      operator === "is" && field === "gateway_pix_payload"
    ),
    true,
  );
});

Deno.test("EAD reconsulta boleto de producao sem Pix depois do cooldown", async () => {
  const original = buildReceivable();
  let calls = 0;
  const result = await recoverMissingEadBanesePix(
    {},
    { courseModality: "EAD", receivable: original },
    {
      now: () => NOW,
      claim: () => Promise.resolve(true),
      recoverPix: (_admin: any, receivableId: unknown) => {
        calls += 1;
        assert.equal(receivableId, RECEIVABLE_ID);
        return Promise.resolve({
          receivable: {
            ...original,
            gateway_pix_payload: "000201-pix-oficial",
            gateway_pix_encoded_image: "data:image/png;base64,oficial",
          },
        } as any);
      },
    },
  );

  assert.equal(calls, 1);
  assert.equal(result.attempted, true);
  assert.equal(result.recovered, true);
  assert.equal(result.receivable.turmas, original.turmas);
});

Deno.test("curso tecnico nunca aciona a autocorrecao EAD", async () => {
  let calls = 0;
  const result = await recoverMissingEadBanesePix(
    {},
    { courseModality: "TECNICO", receivable: buildReceivable() },
    {
      now: () => NOW,
      recoverPix: () => {
        calls += 1;
        return Promise.reject(new Error("nao deveria consultar"));
      },
    },
  );

  assert.equal(calls, 0);
  assert.equal(result.attempted, false);
});

Deno.test("cooldown impede polling bancario a cada refresh da tela", () => {
  assert.equal(
    shouldRetryMissingEadBanesePix({
      courseModality: "EAD",
      receivable: buildReceivable({
        gateway_synced_at: new Date(
          NOW - EAD_BANESE_PIX_RETRY_COOLDOWN_MS + 1,
        ).toISOString(),
      }),
      nowMs: NOW,
    }),
    false,
  );
});

Deno.test("claim concorrente perdido impede segundo GET", async () => {
  let reconciliationCalls = 0;
  const result = await recoverMissingEadBanesePix(
    {},
    { courseModality: "EAD", receivable: buildReceivable() },
    {
      now: () => NOW,
      claim: () => Promise.resolve(false),
      recoverPix: () => {
        reconciliationCalls += 1;
        return Promise.reject(new Error("nao deveria consultar"));
      },
    },
  );

  assert.equal(reconciliationCalls, 0);
  assert.equal(result.attempted, false);
});

Deno.test("nao reconsulta sandbox, titulo pago ou snapshot Pix parcial", () => {
  for (
    const receivable of [
      buildReceivable({ gateway_environment: "sandbox" }),
      buildReceivable({ status: "PAGO", data_pagamento: "2026-08-31" }),
      buildReceivable({ gateway_pix_payload: "000201-parcial" }),
    ]
  ) {
    assert.equal(
      shouldRetryMissingEadBanesePix({
        courseModality: "EAD",
        receivable,
        nowMs: NOW,
      }),
      false,
    );
  }
});

Deno.test("falha do Banese preserva boleto e permite nova tentativa futura", async () => {
  const original = buildReceivable();
  let loggedId = "";
  const result = await recoverMissingEadBanesePix(
    {},
    { courseModality: "EAD", receivable: original },
    {
      now: () => NOW,
      claim: () => Promise.resolve(true),
      recoverPix: () => Promise.reject(new Error("fetch failed")),
      logFailure: ({ receivableId, retryable }) => {
        loggedId = receivableId;
        assert.equal(retryable, true);
      },
    },
  );

  assert.equal(result.receivable, original);
  assert.equal(result.attempted, true);
  assert.equal(result.recovered, false);
  assert.equal(result.reviewRequired, false);
  assert.equal(loggedId, RECEIVABLE_ID);
});

Deno.test("falha transitoria em pagamentos efetivados permite novo retry", async () => {
  let reviewCalls = 0;
  const result = await recoverMissingEadBanesePix(
    {},
    { courseModality: "EAD", receivable: buildReceivable() },
    {
      now: () => NOW,
      claim: () => Promise.resolve(true),
      recoverPix: () =>
        Promise.reject(
          new Error("Banese recusou consulta de pagamentos efetivados (503)."),
        ),
      markReview: () => {
        reviewCalls += 1;
        return Promise.resolve(true);
      },
      logFailure: ({ diagnosticCode, retryable }) => {
        assert.equal(diagnosticCode, "UPSTREAM_5XX");
        assert.equal(retryable, true);
      },
    },
  );

  assert.equal(result.reviewRequired, false);
  assert.equal(result.recovered, false);
  assert.equal(reviewCalls, 0);
});

Deno.test("divergencia financeira interrompe retry e marca revisao", async () => {
  const original = buildReceivable();
  let markedCode = "";
  const result = await recoverMissingEadBanesePix(
    {},
    { courseModality: "EAD", receivable: original },
    {
      now: () => NOW,
      claim: () => Promise.resolve(true),
      recoverPix: () =>
        Promise.reject(
          new Error("Nosso Numero retornado pelo Banese diverge do titulo."),
        ),
      markReview: (_admin, input) => {
        markedCode = input.diagnosticCode;
        return Promise.resolve(true);
      },
      logFailure: ({ retryable }) => assert.equal(retryable, false),
    },
  );

  assert.equal(result.reviewRequired, true);
  assert.equal(markedCode, "REMOTE_TITLE_DIVERGENCE");
});

Deno.test("titulo remoto nao pagavel interrompe retry e marca revisao", async () => {
  let markedCode = "";
  const result = await recoverMissingEadBanesePix(
    {},
    { courseModality: "EAD", receivable: buildReceivable() },
    {
      now: () => NOW,
      claim: () => Promise.resolve(true),
      recoverPix: () =>
        Promise.reject(
          new Error(
            "Boleto remoto nao esta pendente e sem pagamento confirmado; a recuperacao Pix foi bloqueada.",
          ),
        ),
      markReview: (_admin, input) => {
        markedCode = input.diagnosticCode;
        return Promise.resolve(true);
      },
      logFailure: ({ retryable }) => assert.equal(retryable, false),
    },
  );

  assert.equal(result.reviewRequired, true);
  assert.equal(markedCode, "REVIEW_REQUIRED");
});

Deno.test("HTTP 4xx nao entra em retry automatico", async () => {
  let markedCode = "";
  const result = await recoverMissingEadBanesePix(
    {},
    { courseModality: "EAD", receivable: buildReceivable() },
    {
      now: () => NOW,
      claim: () => Promise.resolve(true),
      recoverPix: () =>
        Promise.reject(new Error("Banese recusou consulta do boleto (404).")),
      markReview: (_admin, input) => {
        markedCode = input.diagnosticCode;
        return Promise.resolve(true);
      },
      logFailure: ({ retryable }) => assert.equal(retryable, false),
    },
  );

  assert.equal(result.reviewRequired, true);
  assert.equal(markedCode, "QUERY_ERROR");
});

Deno.test("janela maxima encerra polling e encaminha para revisao", async () => {
  const original = buildReceivable({
    gateway_boleto_issued_at: "2026-08-20T19:00:00.000Z",
  });
  let markedCode = "";
  const result = await recoverMissingEadBanesePix(
    {},
    { courseModality: "EAD", receivable: original },
    {
      now: () => NOW,
      markReview: (_admin, input) => {
        markedCode = input.diagnosticCode;
        return Promise.resolve(true);
      },
      recoverPix: () => Promise.reject(new Error("nao deveria consultar")),
    },
  );

  assert.equal(result.attempted, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(markedCode, "RETRY_WINDOW_EXPIRED");
});
