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
      now: () => 60_000,
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
  for (const body of ["{", "null", "[]", '{"lane":"ACTION"}', '{"now":60000}', '{"cancelReason":"DUPLICATE_PENDING"}', JSON.stringify("x".repeat(1100))]) {
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

Deno.test("faixa vazia empresta seu minuto sem tocar a fila normal", async () => {
  const action = runtime([{ handled: true, result: "CANCELED", mode: "CANCEL" }]);
  assert.equal((await (await handleBaneseEadCheckoutExpirationRequest(request(), action.dependencies)).json()).success, true);
  assert.deepEqual(action.lanes, ["ACTION"]);
  const observation = runtime([{ handled: false }, { handled: true, result: "OBSERVED_UNPAID", mode: "OBSERVE" }]);
  const body = await (await handleBaneseEadCheckoutExpirationRequest(request(), observation.dependencies)).json();
  assert.equal(body.eadCheckoutExpiration.mode, "OBSERVE");
  assert.deepEqual(observation.lanes, ["ACTION", "OBSERVE"]);
  const evenMinute = runtime([{ handled: false }, { handled: true, result: "CANCELED", mode: "CANCEL" }]);
  evenMinute.dependencies.now = () => 120_000;
  const fallback = await (await handleBaneseEadCheckoutExpirationRequest(request(), evenMinute.dependencies)).json();
  assert.equal(fallback.eadCheckoutExpiration.mode, "CANCEL");
  assert.deepEqual(evenMinute.lanes, ["OBSERVE", "ACTION"]);
});

Deno.test("120 minutos de fila ocupada reservam 60 títulos por faixa e só um por chamada", async () => {
  const rt = runtime();
  let minute = 0;
  rt.dependencies.now = () => minute * 60_000 + 59_999;
  rt.dependencies.processExpiration = (async (_admin: unknown, options: { claimLane: string }) => {
    rt.lanes.push(options.claimLane);
    return { handled: true, result: options.claimLane === "ACTION" ? "REVIEW_REQUIRED" : "OBSERVED_UNPAID" };
  }) as any;
  for (; minute < 120; minute++) {
    const before = rt.lanes.length;
    assert.equal((await handleBaneseEadCheckoutExpirationRequest(request(), rt.dependencies)).status, 200);
    assert.equal(rt.lanes.length - before, 1);
    assert.equal(rt.lanes.at(-1), minute % 2 === 0 ? "OBSERVE" : "ACTION");
  }
  assert.equal(rt.lanes.filter((lane) => lane === "ACTION").length, 60);
  assert.equal(rt.lanes.filter((lane) => lane === "OBSERVE").length, 60);
});

Deno.test("revisão sem claim continua explícita na primeira faixa e no fallback", async () => {
  for (const minute of [1, 2]) {
    for (const reviewedIndex of [0, 1]) {
      const results = [{ handled: false }, { handled: false }];
      results[reviewedIndex] = { handled: false, reviewRequired: true } as any;
      const rt = runtime(results);
      rt.dependencies.now = () => minute * 60_000;
      const body = await (await handleBaneseEadCheckoutExpirationRequest(request(), rt.dependencies)).json();
      const reviewedLane = rt.lanes[reviewedIndex];
      assert.equal(body.success, false);
      assert.equal(body.skipped, true);
      assert.equal(body.actionReviewRequired, reviewedLane === "ACTION" ? true : undefined);
      assert.equal(body.observationReviewRequired, reviewedLane === "OBSERVE" ? true : undefined);
    }
  }
  const rt = runtime([{ handled: false, reviewRequired: true }, { handled: true, result: "CANCELED" }]);
  rt.dependencies.now = () => 120_000;
  const body = await (await handleBaneseEadCheckoutExpirationRequest(request(), rt.dependencies)).json();
  assert.equal(body.success, false);
  assert.equal(body.skipped, false);
  assert.equal(body.observationReviewRequired, true);
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
