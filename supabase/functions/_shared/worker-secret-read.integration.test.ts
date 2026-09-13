import assert from "node:assert/strict";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { handleBaneseReconciliationRequest } from "../banese-reconciliation-worker/handler.ts";
import { handlePushNotificationDispatch } from "../push-notification-dispatcher/handler.ts";
import { createBaneseCancellationWorkerHandler } from "../banese-cancellation-worker/worker.ts";
import { readWorkerSecret } from "./worker-secret-read.ts";

for (const worker of ["reconciliation", "push", "cancellation"] as const) {
  Deno.test(`${worker}: falha do getter retorna503 semclaim nemchamadaexterna`, async () => {
    const calls: string[] = [];
    let externalCalls = 0;
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    const logs: unknown[] = [];
    globalThis.fetch = () => {
      externalCalls += 1;
      throw new Error("External calls are forbidden in this test");
    };
    console.error = (...values) => { logs.push(values); };
    try {
      const admin = {
        rpc(name: string) {
          calls.push(name);
          assert.match(name, /^get_(banese_reconciliation|push_notification)_worker_secret$/);
          const result = Promise.resolve({ data: null, error: { code: "PGRST003", message: "private error body" }, status: 504 });
          return Object.assign(result, {
            retry: (enabled: boolean) => { assert.equal(enabled, false); return result; },
            abortSignal: (signal: AbortSignal) => { assert.ok(signal instanceof AbortSignal); return result; },
          });
        },
      };
      const dependencies = {
        createAdmin: (() => admin) as unknown as typeof createClient,
        getEnv: (name: string) => name === "SUPABASE_URL" ? "https://synthetic.invalid" : "synthetic-env-value",
        readSecret: ((client, getter, options) => readWorkerSecret(client, getter, {
          ...options, sleep: () => Promise.resolve(), random: () => 0,
        })) as typeof readWorkerSecret,
        logger: { error: (...values: unknown[]) => logs.push(values) },
      };
      const request = new Request("https://synthetic.invalid/worker", {
        method: "POST",
        headers: { "X-Banese-Worker-Token": "synthetic-header", Authorization: "Bearer synthetic-header" },
      });
      const result = worker === "reconciliation"
        ? await handleBaneseReconciliationRequest(request, dependencies)
        : worker === "push"
        ? await handlePushNotificationDispatch(request, dependencies)
        : await createBaneseCancellationWorkerHandler(dependencies)(request);
      assert.equal(result.status, 503);
      assert.equal(calls.length, 2);
      assert.equal(externalCalls, 0);
      assert.doesNotMatch(JSON.stringify(logs) + await result.text(), /private error body|synthetic-header|synthetic-env-value/);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }
  });
}


Deno.test("reconciliation: manutenção que consumiu a janela impede prepare tardio", async () => {
  let clock = 0;
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let externalCalls = 0;
  Date.now = () => clock;
  globalThis.fetch = () => {
    externalCalls += 1;
    throw new Error("External calls are forbidden");
  };
  try {
    const admin = {
      rpc(name: string) {
        calls.push(name);
        assert.ok([
          "claim_banese_ead_title_replacement",
          "claim_banese_ead_ambiguous_recovery_target",
        ].includes(name), "Não reservar o lote após esgotar a janela.");
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        const query = {
          select: () => query, in: () => query, eq: () => query,
          is: () => query, order: () => query,
          limit: () => {
            if (table === "banese_boleto_recovery_targets") clock = 27_000;
            return Promise.resolve({ data: [], error: null });
          },
        };
        return query;
      },
    };
    const result = await handleBaneseReconciliationRequest(new Request("https://synthetic.invalid/worker", {
      method: "POST", headers: { "X-Banese-Worker-Token": "synthetic-secret-with-at-least-32-bytes" },
    }), {
      createAdmin: (() => admin) as unknown as typeof createClient,
      getEnv: (name) => name === "SUPABASE_URL" ? "https://synthetic.invalid" : "synthetic-key",
      readSecret: async () => {
        clock = 11_500;
        return {
          ok: true, secret: "synthetic-secret-with-at-least-32-bytes",
          metadata: { stage: "WORKER_SECRET", attempts: 2, status: 200, code: "RECOVERED", durationMs: 11_500 },
        };
      },
    });
    assert.equal(result.status, 503);
    assert.equal((await result.json()).code, "PREPARE_BUDGET_EXHAUSTED");
    assert.equal(calls.includes("prepare_banese_reconciliation_batch_v3"), false);
    assert.equal(externalCalls, 0);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});
