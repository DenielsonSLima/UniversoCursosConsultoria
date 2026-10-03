import assert from "node:assert/strict";
import { createSourceCanceller } from "./cancellation.ts";
import { syntheticContext, syntheticSource } from "./test-fixtures.ts";
import { adminForBaneseReservation, makeBaneseTitleResponse } from "../banese/core/adapter-test-fixtures.ts";

const mockBank = (initial: number, options: { paidBefore?: boolean; paidAfter?: boolean; final?: number } = {}) => {
  let situation = initial;
  const calls: string[] = [];
  let mutated = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/autenticacao/")) return Response.json({ access_token: "synthetic", token_type: "Bearer" });
    if (url.endsWith("/baixa")) {
      calls.push("PUT"); mutated = true; situation = options.final ?? 5;
      return Response.json({ ok: true });
    }
    if (url.endsWith("/pagamentos/efetivados")) {
      calls.push("PAYMENTS");
      return Response.json({ PagamentosEfetivados: (mutated ? options.paidAfter : options.paidBefore)
        ? [{ ValorPago: syntheticSource().bankSnapshot!.amount, DataPagamento: syntheticSource().bankSnapshot!.dueDate }] : [] });
    }
    calls.push("GET");
    assert.ok(init?.signal);
    return Response.json(makeBaneseTitleResponse(undefined, undefined, { CodigoSituacaoBoleto: situation }));
  };
  return { calls, fetcher };
};

Deno.test("official cancellation adapter verifies payments before/after PUT and records intent before mutation", async () => {
  const original = globalThis.fetch;
  const bank = mockBank(2);
  globalThis.fetch = bank.fetcher;
  try {
    const cancel = createSourceCanceller(adminForBaneseReservation(true));
    const result = await cancel(syntheticContext(), syntheticSource(), async () => { bank.calls.push("INTENT"); });
    assert.deepEqual(bank.calls, ["GET", "PAYMENTS", "INTENT", "PUT", "GET", "PAYMENTS"]);
    assert.equal(result.situationCode, 5);
    assert.equal(result.paymentCount, 0);
    assert.match(result.evidenceFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(result).includes("payerDocument"), false);
  } finally { globalThis.fetch = original; }
});
Deno.test("cancel-intent replay performs GET-only and confirms already canceled without another PUT", async () => {
  const original = globalThis.fetch;
  const bank = mockBank(5);
  globalThis.fetch = bank.fetcher;
  try {
    const source = syntheticSource(); source.state = "CANCEL_INTENT";
    const result = await createSourceCanceller(adminForBaneseReservation(true))(
      syntheticContext(), source, async () => { throw new Error("No second intent"); });
    assert.equal(result.situationCode, 5);
    assert.deepEqual(bank.calls, ["GET", "PAYMENTS"]);
  } finally { globalThis.fetch = original; }
});
Deno.test("already canceled bank source still consumes its local fence without a PUT", async () => {
  const original = globalThis.fetch;
  const bank = mockBank(5);
  globalThis.fetch = bank.fetcher;
  try {
    await createSourceCanceller(adminForBaneseReservation(true))(
      syntheticContext(), syntheticSource(), async () => { bank.calls.push("INTENT"); });
    assert.deepEqual(bank.calls, ["GET", "PAYMENTS", "INTENT"]);
  } finally { globalThis.fetch = original; }
});
Deno.test("payment before or during cancellation prevents successful confirmation", async () => {
  for (const options of [{ paidBefore: true }, { paidAfter: true }]) {
    const original = globalThis.fetch;
    const bank = mockBank(2, options);
    globalThis.fetch = bank.fetcher;
    try {
      await assert.rejects(() => createSourceCanceller(adminForBaneseReservation(true))(
        syntheticContext(), syntheticSource(), async () => {}), /pagamento/i);
      assert.equal(bank.calls.filter((call) => call === "PUT").length, options.paidBefore ? 0 : 1);
    } finally { globalThis.fetch = original; }
  }
});
Deno.test("cancel-intent with still-open bank title is review, never another PUT", async () => {
  const original = globalThis.fetch;
  const bank = mockBank(2);
  globalThis.fetch = bank.fetcher;
  try {
    const source = syntheticSource(); source.state = "CANCEL_INTENT";
    await assert.rejects(() => createSourceCanceller(adminForBaneseReservation(true))(
      syntheticContext(), source, async () => {}), /não confirmado/);
    assert.deepEqual(bank.calls, ["GET", "PAYMENTS"]);
  } finally { globalThis.fetch = original; }
});
