import assert from "node:assert/strict";
import { createBaneseBoletoCharge } from "../banese/core/adapter.ts";
import { creationFetch, makeBaneseTitleResponse, reservedBoletoInput } from "../banese/core/adapter-test-fixtures.ts";
import { BANESE_DOCUMENT_FIXTURE as bank } from "../banese/internal/testing/document-fixture.ts";
import { buildBanesePixPayloadFixture } from "../banese/internal/testing/pix-fixture.ts";
import type { BaneseCreationEvidence } from "../banese/core/adapter/creation-evidence.ts";
import { preserveServiceCreationEvidence } from "./creation-evidence.ts";

const evidence = { request: { NossoNumero: "000004681", ValorNominal: 20000, DataVencimento: "2026-11-30" },
  creationResponse: { Id: "original-synthetic-post" }, pixPayload: "synthetic-pix", pixEncodedImage: "synthetic-image" };
const id = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
const fixture = (errors: unknown[]) => {
  let elapsed = 0;
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [], waits: number[] = [];
  const admin = { rpc: async (name: string, args?: Record<string, unknown>) => {
    calls.push({ name, args: globalThis.structuredClone(args) });
    return { data: null, error: errors.shift() ?? null };
  } };
  return { admin, calls, waits, clock: { now: () => elapsed, wait: async (ms: number) => { waits.push(ms); elapsed += ms; } },
    elapsed: () => elapsed };
};

Deno.test("a brief cancellation lock retains the original POST and Pix before the single confirmation GET", async () => {
  const f = fixture([{ code: "55P03", message: "row is locked" }, { code: "57014", message: "statement timeout" }]);
  const payload = buildBanesePixPayloadFixture("SERVICE-LOCK", bank.amount);
  const common = makeBaneseTitleResponse();
  const { calls, fetcher } = creationFetch({ ...common, Id: "original-synthetic-post", QrCode: payload }, common);
  const originalFetch = globalThis.fetch;
  let posted = false, stored: BaneseCreationEvidence | undefined;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET"));
    if (url.includes("/boletos") && method === "GET" && posted) assert.equal(stored?.pixPayload, payload);
    const response = await fetcher(input, init);
    if (url.includes("/boletos") && method === "POST") posted = true;
    return response;
  };
  try {
    const result = await createBaneseBoletoCharge({ ...reservedBoletoInput(false), environment: "production",
      financialTerms: { nominalAmount: bank.amount, dueDate: bank.dueDate },
      onCreationEvidence: async accepted => {
        await preserveServiceCreationEvidence(f.admin, id(1), id(2), accepted, f.clock);
        stored = accepted;
      },
    });
    assert.equal(result.pixPayload, payload);
    assert.equal(f.calls.length, 3);
    for (const call of f.calls) assert.deepEqual(call, { name: "preserve_nfse_service_bolepix_creation_internal",
      args: { p_job_id: id(1), p_api_attempt_token: id(2), p_evidence: stored } });
    assert.equal(stored?.creationResponse.Id, "original-synthetic-post");
    assert.match(stored?.pixEncodedImage || "", /^data:image\/png;base64,/);
    assert.deepEqual(calls.filter(call => call.url.includes("/boletos")).map(call => call.method), ["GET", "POST", "GET"]);
    assert.deepEqual(f.waits, [250, 500]);
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("evidence persistence never retries identity or authorization failures", async () => {
  for (const error of [{ code: "40001", message: "TRANSPORT must not bypass immutable identity" },
    { code: "42501", message: "timeout must not bypass actor denial" }, { code: "55000", message: "blocked" },
    { status: 403, message: "fetch failed" }, { code: "PGRST301", message: "JWT expired" }]) {
    const f = fixture([error]);
    await assert.rejects(preserveServiceCreationEvidence(f.admin, id(1), id(2), evidence, f.clock),
      candidate => candidate === error);
    assert.equal(f.calls.length, 1); assert.equal(f.waits.length, 0);
  }
});

Deno.test("the evidence circuit retries only transient local transport and stops within fifteen seconds", async () => {
  const f = fixture(Array.from({ length: 100 }, () => ({ code: "PGRST003", message: "pool timeout" })));
  await assert.rejects(preserveServiceCreationEvidence(f.admin, id(1), id(2), evidence, f.clock));
  assert.equal(f.elapsed(), 15_000);
  assert(f.calls.length > 1 && f.calls.length < 20);
  assert(f.waits.every(wait => wait <= 1000));
  const network = fixture([new TypeError("fetch failed")]);
  await preserveServiceCreationEvidence(network.admin, id(1), id(2), evidence, network.clock);
  assert.equal(network.calls.length, 2);
});
