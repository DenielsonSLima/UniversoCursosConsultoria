import assert from "node:assert/strict";
import { queryBaneseBoleto } from "./boleto-query.ts";
import { cancelBaneseBoleto } from "./boleto-cancellation.ts";
import { adminForBaneseReservation } from "../adapter-test-fixtures.ts";
import { BANESE_DOCUMENT_FIXTURE as document } from "../../internal/testing/document-fixture.ts";

const withBank = async (test: (state: { reads: number; puts: number; deadline: (read: number) => string | undefined }) => Promise<void>) => {
  const original = globalThis.fetch;
  const state = { reads: 0, puts: 0, deadline: (_read: number): string | undefined => "2027-02-14" };
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/autenticacao/")) return new Response(JSON.stringify({ access_token: "fixture", token_type: "Bearer" }));
    if (init?.method === "PUT") { state.puts++; return new Response("{}"); }
    if (url.endsWith("/pagamentos/efetivados")) return new Response(JSON.stringify({ PagamentosEfetivados: [] }));
    state.reads++;
    return new Response(JSON.stringify({
      NossoNumero: document.ourNumber, CodigoSituacaoBoleto: state.puts ? 5 : 2,
      DataVencimento: document.dueDate, ValorNominal: document.amount,
      DataLimitePagamento: state.deadline(state.reads),
      Pagador: { NumeroCPFCNPJ: "00000000000", NomeOuRazaoSocial: "synthetic-private" },
    }));
  }) as typeof fetch;
  try { await test(state); } finally { globalThis.fetch = original; }
};

Deno.test("adapter compartilha último recebimento oficial sem expor pagador ou alterar Técnico", async () => {
  await withBank(async () => {
    const snapshot = await queryBaneseBoleto(adminForBaneseReservation(true), "sandbox", {
      convenio: document.beneficiary.agreement, nossoNumero: document.ourNumber,
      strictEffectivePayments: true,
    });
    assert.equal((snapshot.raw as Record<string, unknown>).DataLimitePagamento, "2027-02-14");
    assert.equal(snapshot.paid, false);
    assert.ok(!("Pagador" in snapshot.raw));
  });
});

Deno.test("consumidor legado sem contrato opcional mantém baixa compartilhada", async () => {
  await withBank(async (state) => {
    state.deadline = () => undefined;
    const result = await cancelBaneseBoleto(adminForBaneseReservation(true), "sandbox", {
      convenio: document.beneficiary.agreement, nossoNumero: document.ourNumber,
    });
    assert.equal(result.situationCode, 5);
    assert.equal(state.puts, 1);
  });
});

Deno.test("data limite alterada no preflight bloqueia PUT; após PUT deixa mutação ambígua", async () => {
  await withBank(async (state) => {
    const input = {
      convenio: document.beneficiary.agreement, nossoNumero: document.ourNumber,
      expectedDueDate: document.dueDate, expectedLastPaymentDate: "2027-02-14",
      strictEffectivePayments: true,
    };
    state.deadline = () => "2027-02-15";
    await assert.rejects(() => cancelBaneseBoleto(adminForBaneseReservation(true), "sandbox", input), /DEADLINE_CHANGED/);
    assert.equal(state.puts, 0);
    state.reads = 0;
    state.deadline = (read) => read === 1 ? "2027-02-14" : "2027-02-15";
    await assert.rejects(() => cancelBaneseBoleto(adminForBaneseReservation(true), "sandbox", input), /DEADLINE_CHANGED/);
    assert.equal(state.puts, 1);
  });
});
