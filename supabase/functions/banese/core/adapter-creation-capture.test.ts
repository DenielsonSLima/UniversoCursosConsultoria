import assert from "node:assert/strict";
import { createBaneseBoletoCharge } from "./adapter/boleto.ts";
import { makeBaneseTitleResponse, reservedBoletoInput } from "./adapter-test-fixtures.ts";
import { buildBanesePixPayloadFixture } from "../internal/testing/pix-fixture.ts";
import type { BaneseCreationResponseCapture } from "./adapter/types.ts";

Deno.test("durable callback preserves original POST Pix before later terms GET fails", async () => {
  const originalFetch = globalThis.fetch;
  const input = reservedBoletoInput(false);
  const officialQr = buildBanesePixPayloadFixture("DURABLE-POST", input.amount);
  const response = makeBaneseTitleResponse(input.amount, input.dueDate, { QrCode: officialQr });
  const calls: string[] = [];
  let captured: BaneseCreationResponseCapture | null = null;
  let posted = false;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/autenticacao/")) return Response.json({ access_token: "synthetic", token_type: "Bearer" });
    const method = init?.method || "GET";
    calls.push(method);
    if (method === "POST") { posted = true; return Response.json(response); }
    if (!posted) return new Response("{}", { status: 404 });
    assert.ok(captured, "the original response must already be durable before a followup GET");
    return new Response("{}", { status: 503 });
  };
  try {
    await assert.rejects(() => createBaneseBoletoCharge({ ...input, environment: "production",
      financialTerms: { nominalAmount: input.amount, dueDate: input.dueDate },
      onCreationResponse: async (capture) => { captured = structuredClone(capture); calls.push("CAPTURE"); },
    }), /503/);
    assert.deepEqual(calls, ["GET", "POST", "CAPTURE", "GET"]);
    assert.equal((captured as unknown as BaneseCreationResponseCapture).request.nossoNumero, response.NossoNumero);
    assert.equal(((captured as unknown as BaneseCreationResponseCapture).response as Record<string, unknown>).QrCode, officialQr);
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("capture failure stops before parser and followup GET, leaving remote ambiguity", async () => {
  const originalFetch = globalThis.fetch;
  const input = reservedBoletoInput(false);
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/autenticacao/")) return Response.json({ access_token: "synthetic", token_type: "Bearer" });
    const method = init?.method || "GET";
    calls.push(method);
    return method === "GET" ? new Response("{}", { status: 404 }) : Response.json({ QrCode: "not-normalized-yet" });
  };
  try {
    await assert.rejects(() => createBaneseBoletoCharge({ ...input, environment: "production",
      onCreationResponse: async () => { throw new Error("capture unavailable"); },
    }), (error: unknown) => {
      assert.equal((error as { remotePaymentCreated: boolean }).remotePaymentCreated, true);
      assert.match(String(error), /capture unavailable/);
      return true;
    });
    assert.deepEqual(calls, ["GET", "POST"]);
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("already aborted creation performs no reservation, OAuth or bank request", async () => {
  const input = reservedBoletoInput(false);
  const controller = new AbortController();
  controller.abort();
  let touched = false;
  await assert.rejects(() => createBaneseBoletoCharge({ ...input,
    signal: controller.signal,
    admin: { rpc: async () => { touched = true; throw new Error("Must not run"); } },
  }), /abort/i);
  assert.equal(touched, false);
});

Deno.test("creation propagates abort signal to OAuth, preflight and POST", async () => {
  const originalFetch = globalThis.fetch;
  const input = reservedBoletoInput(false);
  const controller = new AbortController();
  const response = makeBaneseTitleResponse(input.amount, input.dueDate);
  const methods: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.signal, controller.signal);
    if (String(url).includes("/autenticacao/")) return Response.json({ access_token: "synthetic", token_type: "Bearer" });
    methods.push(init?.method || "GET");
    if (init?.method !== "POST") return new Response("{}", { status: 404 });
    return Response.json(response);
  };
  try {
    await createBaneseBoletoCharge({ ...input, signal: controller.signal });
    assert.deepEqual(methods, ["GET", "POST"]);
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("durable creation never enters legacy incident scan or discount repair", async () => {
  const input = reservedBoletoInput(false);
  const calls: string[] = [];
  await assert.rejects(() => createBaneseBoletoCharge({ ...input,
    onCreationResponse: async () => { throw new Error("No bank response expected"); },
    admin: { rpc: async (name) => {
      calls.push(name);
      if (name !== "reserve_banese_nosso_numero_for_receivable") throw new Error("No OAuth or recovery scan allowed");
      return { data: { convenio: input.receivable.baneseBoletoConvenio,
        agencia: input.receivable.baneseAgencia, recoveryPending: true,
        recoveryCandidateStart: 1, recoveryCandidateEnd: 3 }, error: null };
    } },
  }), /incidentes legados/);
  assert.deepEqual(calls, ["reserve_banese_nosso_numero_for_receivable"]);
});
