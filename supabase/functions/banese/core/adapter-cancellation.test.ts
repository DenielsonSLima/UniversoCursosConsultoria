import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
} from "../internal/testing/document-fixture.ts";
import { cancelBaneseBoleto } from "./adapter.ts";
import { adminForBaneseReservation } from "./adapter-test-fixtures.ts";

const cancellationFetch = (
  initialSituation: number,
  paymentConfirmed = initialSituation === 3,
  paymentStatus = 200,
) => {
  let situation = initialSituation;
  const calls: Array<{ url: string; method: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ||
      (input instanceof Request ? input.method : "GET");
    calls.push({ url, method });
    if (url.includes("/autenticacao/")) {
      return new Response(
        JSON.stringify({ access_token: "token-teste", token_type: "Bearer" }),
        { status: 200 },
      );
    }
    if (url.endsWith("/baixa")) {
      situation = 5;
      return new Response(JSON.stringify({ Mensagem: "ok" }), { status: 200 });
    }
    if (url.endsWith("/pagamentos/efetivados")) {
      return new Response(
        JSON.stringify({
          PagamentosEfetivados: paymentConfirmed
            ? [{
              ValorPago: BANESE_DOCUMENT_FIXTURE.amount,
              DataPagamento: BANESE_DOCUMENT_FIXTURE.dueDate,
            }]
            : [],
        }),
        { status: paymentStatus },
      );
    }
    return new Response(
      JSON.stringify({
        NossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
        CodigoSituacaoBoleto: situation,
        ValorNominal: BANESE_DOCUMENT_FIXTURE.amount,
        DataVencimento: BANESE_DOCUMENT_FIXTURE.dueDate,
      }),
      { status: 200 },
    );
  };
  return { calls, fetcher };
};

const cancellationInput = {
  convenio: BANESE_DOCUMENT_FIXTURE.beneficiary.agreement,
  nossoNumero: BANESE_DOCUMENT_FIXTURE.ourNumber,
};

Deno.test("baixa boleto aberto e confirma cancelamento no Banese", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetcher } = cancellationFetch(2);
  globalThis.fetch = fetcher as typeof fetch;
  try {
    const result = await cancelBaneseBoleto(
      adminForBaneseReservation(true),
      "sandbox",
      cancellationInput,
    );
    assert.equal(result.remoteStatus, "CANCELED");
    assert.equal(result.alreadyCanceled, false);
    assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
    assert.equal(
      calls.filter((call) =>
        call.method === "GET" &&
        !call.url.endsWith("/pagamentos/efetivados")
      ).length,
      2,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("baixa Banese e idempotente para boleto ja cancelado", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetcher } = cancellationFetch(5);
  globalThis.fetch = fetcher as typeof fetch;
  try {
    const result = await cancelBaneseBoleto(
      adminForBaneseReservation(true),
      "sandbox",
      cancellationInput,
    );
    assert.equal(result.alreadyCanceled, true);
    assert.equal(calls.some((call) => call.method === "PUT"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("baixa Banese bloqueia boleto que o banco ja confirmou pago", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetcher } = cancellationFetch(3);
  globalThis.fetch = fetcher as typeof fetch;
  try {
    await assert.rejects(
      () =>
        cancelBaneseBoleto(
          adminForBaneseReservation(true),
          "sandbox",
          cancellationInput,
        ),
      /ja confirmou o pagamento/i,
    );
    assert.equal(calls.some((call) => call.method === "PUT"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("PagamentosEfetivados prevalece mesmo sem CodigoSituacaoBoleto 3", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetcher } = cancellationFetch(2, true);
  globalThis.fetch = fetcher as typeof fetch;
  try {
    await assert.rejects(
      () =>
        cancelBaneseBoleto(
          adminForBaneseReservation(true),
          "sandbox",
          cancellationInput,
        ),
      /ja confirmou o pagamento/i,
    );
    assert.equal(calls.some((call) => call.method === "PUT"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("baixa Banese falha fechada se PagamentosEfetivados estiver indisponivel", async () => {
  const originalFetch = globalThis.fetch;
  const { calls, fetcher } = cancellationFetch(2, false, 503);
  globalThis.fetch = fetcher as typeof fetch;
  try {
    await assert.rejects(
      () =>
        cancelBaneseBoleto(
          adminForBaneseReservation(true),
          "sandbox",
          cancellationInput,
        ),
      /PagamentosEfetivados.*falhou.*503/i,
    );
    assert.equal(calls.some((call) => call.method === "PUT"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
