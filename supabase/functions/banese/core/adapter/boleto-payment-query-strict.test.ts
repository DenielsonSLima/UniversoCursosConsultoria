import assert from "node:assert/strict";
import { cancelBaneseBoleto } from "./boleto-cancellation.ts";
import { queryBaneseEffectivePayments } from "./boleto-payment-query.ts";
import { adminForBaneseReservation } from "../adapter-test-fixtures.ts";
import { BANESE_DOCUMENT_FIXTURE as fixture } from "../../internal/testing/document-fixture.ts";

const responseCases = [
  { status: 404, body: { Erros: [{ CodigoErroProcessamento: "ERRO_BOLETO_NAO_ENCONTRADO" }] } },
  { status: 200, body: { Erros: [{ CodigoErroProcessamento: "500" }] } },
  { status: 200, body: null },
  { status: 200, body: "unexpected" },
  { status: 200, body: { PagamentosEfetivados: {} } },
  { status: 200, body: { PagamentosEfetivados: [null, {}] } },
  { status: 200, body: { PagamentosEfetivados: [], Erros: [{ CodigoErroProcessamento: "400" }] } },
];
for (const [index, invalid] of responseCases.entries()) {
  Deno.test(`Consulta inconclusiva ${index + 1} não autoriza PUT da expiração EAD`, async () => {
    const original = globalThis.fetch;
    let puts = 0;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      const endpoint = String(url);
      if (init?.method === "PUT") { puts++; throw new Error("Unexpected PUT"); }
      if (endpoint.includes("/autenticacao/")) return new Response(JSON.stringify({ access_token: "fixture", token_type: "Bearer" }));
      if (endpoint.endsWith("/pagamentos/efetivados")) return new Response(JSON.stringify(invalid.body), { status: invalid.status });
      return new Response(JSON.stringify({
        NossoNumero: fixture.ourNumber, CodigoSituacaoBoleto: 2,
        ValorNominal: fixture.amount, DataVencimento: fixture.dueDate,
      }));
    }) as typeof fetch;
    try {
      await assert.rejects(() => cancelBaneseBoleto(adminForBaneseReservation(true), "sandbox", {
        convenio: fixture.beneficiary.agreement, nossoNumero: fixture.ourNumber,
        strictEffectivePayments: true,
      }), /PagamentosEfetivados/);
      assert.equal(puts, 0);
    } finally { globalThis.fetch = original; }
  });
}

Deno.test("Lista oficial vazia é distinta de consulta inconclusiva; modo legado preservado", async () => {
  const original = globalThis.fetch;
  const input = { baseEndpoint: "https://example.test/boleto", token: {
    accessToken: "fixture", tokenType: "Bearer", expiresIn: null, scope: null, raw: {},
  }, allowFailure: false };
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ PagamentosEfetivados: [] }))) as typeof fetch;
    assert.deepEqual((await queryBaneseEffectivePayments({ ...input, strict: true })).payments, []);
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
    assert.deepEqual((await queryBaneseEffectivePayments(input)).payments, []);
    await assert.rejects(() => queryBaneseEffectivePayments({ ...input, strict: true }), /404/);
  } finally { globalThis.fetch = original; }
});
