import assert from "node:assert/strict";
import { ActivationError, parseActivationRequest } from "./contract.ts";
import { createActivationHandler } from "./handler.ts";
import { startActivation } from "./dependencies.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const request = (body: unknown, headers: ConstructorParameters<typeof Headers>[0] = { Authorization: "Bearer synthetic" }) =>
  new Request("http://localhost/activate", { method: "POST", headers, body: JSON.stringify(body) });
const body = { agreementId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222", expectedVersion: 2,
  expectedFingerprint: "a".repeat(64), confirm: true };

Deno.test("handler never constructs privileged client without authentication", async () => {
  let called = false;
  const handler = createActivationHandler({
    authorize: async () => { called = true; throw new Error("Should not run"); },
    privileged: () => { called = true; throw new Error("Should not run"); },
  });
  const result = await handler(request(body, {}));
  assert.equal(result.status, 401);
  assert.equal(called, false);
  assert.equal(result.headers.get("Cache-Control"), "private, no-store, max-age=0");
});
Deno.test("scope denial never constructs privileged client or bank dependencies", async () => {
  let privileged = false;
  const handler = createActivationHandler({
    authorize: async () => { throw new ActivationError("DENIED", "Sem acesso", false, 403); },
    privileged: () => { privileged = true; throw new Error("Should not run"); },
  });
  const result = await handler(request(body));
  assert.equal(result.status, 403);
  assert.equal(privileged, false);
  assert.deepEqual(await result.json(), { error: "Sem acesso", code: "DENIED" });
});
Deno.test("OPTIONS and invalid payload never call auth, SQL or bank", async () => {
  let touched = false;
  const handler = createActivationHandler({
    authorize: async () => { touched = true; throw new Error(); },
    privileged: () => { touched = true; throw new Error(); },
  });
  assert.equal((await handler(new Request("http://localhost", { method: "OPTIONS" }))).status, 200);
  assert.equal((await handler(request({ ...body, confirm: false }))).status, 400);
  assert.equal((await handler(request({ ...body, unexpectedFinancialAmount: 1 }))).status, 400);
  for (const invalid of [null, 0, 1, "true", "false", [], {}]) {
    assert.equal((await handler(request({ ...body, approveCustomTerms: invalid }))).status, 400);
  }
  assert.equal((await handler(request({ ...body, approveCustomTerms: true, role: "FINANCEIRO" }))).status, 400);
  assert.equal(touched, false);
});

Deno.test("HTTP accepts boolean consent only, without treating it as financial authorization", () => {
  assert.equal(parseActivationRequest({ ...body, approveCustomTerms: false }).approveCustomTerms, false);
  assert.equal(parseActivationRequest({ ...body, approveCustomTerms: true }).approveCustomTerms, true);
  assert.equal(parseActivationRequest(body).approveCustomTerms, undefined);
});

Deno.test("custom consent denied by user-scoped SQL cannot construct privileged or bank dependencies", async () => {
  const calls: string[] = [];
  const userClient = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push(name);
    assert.equal(args.p_approve_custom_terms, true);
    return { data: null, error: { code: "42501", message: "FINANCEIRO authorization denied" } };
  } } as unknown as SupabaseClient;
  const handler = createActivationHandler({
    authorize: async (_request, activation) => startActivation(userClient, activation),
    privileged: () => { calls.push("PRIVILEGED"); throw new Error("Must never construct bank dependencies"); },
  });
  const result = await handler(request({ ...body, approveCustomTerms: true }));
  assert.equal(result.status, 403);
  assert.deepEqual(calls, ["start_receivable_renegotiation_activation_secure"]);
  assert.deepEqual(await result.json(), {
    code: "ACTIVATION_NOT_AUTHORIZED", error: "Sem permissão para ativar este acordo.",
  });
});
