import assert from "node:assert/strict";
import { handleBaneseEadCheckoutExpirationRequest } from "./ead-checkout-expiration-handler.ts";

const secret = "synthetic-worker-secret-".repeat(2);
const request = (body = "{}", token = secret, method = "POST") => new Request("https://worker.test/expiry", {
  method, headers: { "X-Banese-Worker-Token": token }, ...(method === "POST" ? { body } : {}),
});
const runtime = (results: Array<Record<string, unknown>> = [{ handled: false }, { handled: false }]) => {
  const lanes: unknown[] = [];
  const admin = { from: () => { throw new Error("Normal financial queue must not be touched"); } };
  return {
    lanes, dependencies: {
      getEnv: (name: string) => name === "SUPABASE_URL" ? "https://database.test" : "synthetic-service-key",
      createAdmin: (() => admin) as any,
      readSecret: (async () => ({ ok: true, secret })) as any,
      processExpiration: (async (_admin: unknown, options: { claimLane: string }) => {
        lanes.push(options.claimLane);
        return results[lanes.length - 1];
      }) as any,
    },
  };
};

Deno.test("worker dedicado exige POST, configuração e segredo antes de qualquer claim", async () => {
  const rt = runtime();
  assert.equal((await handleBaneseEadCheckoutExpirationRequest(request("", secret, "GET"), rt.dependencies)).status, 405);
  assert.equal((await handleBaneseEadCheckoutExpirationRequest(request("{}", "wrong-secret"), rt.dependencies)).status, 401);
  assert.equal((await handleBaneseEadCheckoutExpirationRequest(request(), {
    ...rt.dependencies, getEnv: () => undefined,
  })).status, 503);
  assert.equal((await handleBaneseEadCheckoutExpirationRequest(request(), {
    ...rt.dependencies, readSecret: (async () => ({ ok: false })) as any,
  })).status, 503);
  assert.equal(rt.lanes.length, 0);
});

Deno.test("corpo não permite escolher título, motivo ou contornar flag/calendário", async () => {
  const rt = runtime();
  for (const body of ["{", "null", "[]", '{"lane":"ACTION"}', '{"cancelReason":"DUPLICATE_PENDING"}', JSON.stringify("x".repeat(1100))]) {
    assert.equal((await handleBaneseEadCheckoutExpirationRequest(request(body), rt.dependencies)).status, 400);
  }
  assert.equal(rt.lanes.length, 0);
});

Deno.test("flag desativada responde skipped e só a RPC define elegibilidade das duas lanes", async () => {
  const rt = runtime();
  const response = await handleBaneseEadCheckoutExpirationRequest(request(), rt.dependencies);
  assert.equal(response.status, 200);
  assert.deepEqual(rt.lanes, ["ACTION", "OBSERVE"]);
  const body = await response.json();
  assert.equal(body.skipped, true);
  assert.equal(body.success, true);
});

Deno.test("ação tem prioridade e observação usa cron independente sem tocar fila normal", async () => {
  const action = runtime([{ handled: true, result: "CANCELED", mode: "CANCEL" }]);
  assert.equal((await (await handleBaneseEadCheckoutExpirationRequest(request(), action.dependencies)).json()).success, true);
  assert.deepEqual(action.lanes, ["ACTION"]);
  const observation = runtime([{ handled: false }, { handled: true, result: "OBSERVED_UNPAID", mode: "OBSERVE" }]);
  const body = await (await handleBaneseEadCheckoutExpirationRequest(request(), observation.dependencies)).json();
  assert.equal(body.eadCheckoutExpiration.mode, "OBSERVE");
  assert.deepEqual(observation.lanes, ["ACTION", "OBSERVE"]);
});

Deno.test("revisão fica explícita e falha não expõe erro bancário ou segredo", async () => {
  const review = runtime([{ handled: true, result: "PAID_REVIEW", reviewId: "synthetic-review" }]);
  assert.equal((await (await handleBaneseEadCheckoutExpirationRequest(request(), review.dependencies)).json()).success, false);
  const failed = runtime();
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...args) => logs.push(args);
  try {
    failed.dependencies.processExpiration = (async () => { throw new Error("synthetic-private-bank-response"); }) as any;
    const response = await handleBaneseEadCheckoutExpirationRequest(request(), failed.dependencies);
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("synthetic-private-bank-response"));
    assert.ok(!JSON.stringify(logs).includes("synthetic-private-bank-response"));
    assert.ok(!JSON.stringify(logs).includes(secret));
  } finally { console.error = original; }
});
