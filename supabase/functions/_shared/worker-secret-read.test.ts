import assert from "node:assert/strict";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  readWorkerSecret,
  logWorkerSecretRead,
  type WorkerSecretGetter,
  type WorkerSecretMetadata,
} from "./worker-secret-read.ts";

const GETTER = "get_banese_reconciliation_worker_secret";
const SECRET = "synthetic-worker-secret-with-at-least-32-bytes";
const response = (status: number, code = "PGRST003", data: unknown = null) => ({
  status, data: status === 200 ? data ?? SECRET : null,
  error: status === 200 ? null : { code, message: "private response must never be logged" },
});

function fixture(results: ReturnType<typeof response>[]) {
  let clock = 0;
  const calls: string[] = [];
  const retries: boolean[] = [];
  const signals: AbortSignal[] = [];
  const logs: WorkerSecretMetadata[] = [];
  const delays: number[] = [];
  const admin = {
    rpc(name: string) {
      calls.push(name);
      const result = Promise.resolve(results.shift() ?? response(504));
      return Object.assign(result, {
        retry(value: boolean) { retries.push(value); return result; },
        abortSignal(value: AbortSignal) { signals.push(value); return result; },
      });
    },
  };
  const options = {
    now: () => clock,
    sleep: (ms: number) => { delays.push(ms); clock += ms; return Promise.resolve(); },
    random: () => 0.5,
    minimumLength: 32,
    logger: (metadata: WorkerSecretMetadata) => logs.push(metadata),
  };
  return { admin, options, calls, retries, signals, logs, delays, advance: (ms: number) => { clock += ms; } };
}

Deno.test("segredo válido usa uma única chamada e preserva exatamente o valor", async () => {
  const rawSecret = ` ${SECRET} `;
  const f = fixture([response(200, "", rawSecret)]);
  const result = await readWorkerSecret(f.admin, GETTER, f.options);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.secret, rawSecret);
  assert.deepEqual(f.calls, [GETTER]);
  assert.deepEqual(f.retries, [false]);
  assert.equal(f.signals[0].aborted, false);
  assert.equal(f.logs.length, 0);
});

Deno.test("504 seguido de sucesso repete somente getter e registra recuperação sanitizada", async () => {
  const f = fixture([response(504), response(200)]);
  const result = await readWorkerSecret(f.admin, GETTER, f.options);
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls, [GETTER, GETTER]);
  assert.deepEqual(f.retries, [false, false]);
  assert.deepEqual(f.delays, [500]);
  assert.deepEqual(f.logs.map((entry) => entry.code), ["PGRST003", "RECOVERED"]);
  assert.doesNotMatch(JSON.stringify(f.logs), /synthetic-worker-secret|private response/);
  assert.deepEqual(Object.keys(f.logs[0]).sort(), ["attempts", "code", "durationMs", "stage", "status"]);
});

Deno.test("504 persistente termina em duas tentativas, sem terceiro request", async () => {
  const f = fixture([response(504), response(504)]);
  const result = await readWorkerSecret(f.admin, GETTER, f.options);
  assert.equal(result.ok, false);
  assert.equal(result.metadata.attempts, 2);
  assert.equal(f.calls.length, 2);
});

Deno.test("502, 503, PGRST003 e transporte controlado são transitórios", async () => {
  for (const first of [response(502, ""), response(503, ""), response(0)]) {
    const f = fixture([first, response(200)]);
    assert.equal((await readWorkerSecret(f.admin, GETTER, f.options)).ok, true);
    assert.equal(f.calls.length, 2);
  }
  const f = fixture([response(200)]);
  const rpc = f.admin.rpc;
  let first = true;
  f.admin.rpc = (name) => {
    if (first) {
      first = false;
      throw new TypeError("fetch failed: private transport context");
    }
    return rpc(name);
  };
  const recovered = await readWorkerSecret(f.admin, GETTER, f.options);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.metadata.attempts, 2);
  assert.equal(f.calls.length, 1);
  assert.equal(f.logs[0].code, "TRANSPORT_ERROR");
  assert.doesNotMatch(JSON.stringify(f.logs), /private transport/);
});

Deno.test("401/403/400 e segredo inválido nunca repetem nem viram autenticação válida", async () => {
  for (const status of [400, 401, 403]) {
    const f = fixture([response(status)]);
    assert.equal((await readWorkerSecret(f.admin, GETTER, f.options)).ok, false);
    assert.equal(f.calls.length, 1);
  }
  for (const data of ["", "short", {}, []]) {
    const f = fixture([response(200, "", data)]);
    const result = await readWorkerSecret(f.admin, GETTER, f.options);
    assert.equal(result.ok, false);
    assert.equal(result.metadata.code, "INVALID_SECRET");
    assert.equal(f.calls.length, 1);
  }
});

Deno.test("getter fora da allowlist e builder sem controles falham antes de rede", async () => {
  const f = fixture([]);
  const result = await readWorkerSecret(f.admin, "claim_banese_cancellation_batch" as WorkerSecretGetter, f.options);
  assert.equal(result.ok, false);
  assert.equal(f.calls.length, 0);
  const unsupported = await readWorkerSecret({ rpc: () => Promise.resolve(response(200)) }, GETTER);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.metadata.attempts, 1);
});

Deno.test("resposta tardia mesmo com timer atrasado nunca autoriza o worker", async () => {
  const f = fixture([response(200)]);
  const rpc = f.admin.rpc;
  f.admin.rpc = (name) => { f.advance(12_001); return rpc(name); };
  const result = await readWorkerSecret(f.admin, GETTER, f.options);
  assert.equal(result.ok, false);
  assert.equal(result.metadata.code, "DEADLINE_EXCEEDED");
  assert.equal(f.calls.length, 1);
});

Deno.test("jitter conta no teto e impede segunda tentativa quando não cabe", async () => {
  const f = fixture([response(504)]);
  const rpc = f.admin.rpc;
  f.admin.rpc = (name) => { f.advance(11_600); return rpc(name); };
  const result = await readWorkerSecret(f.admin, GETTER, f.options);
  assert.equal(result.ok, false);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.delays, []);
});

Deno.test("SDK pinado recebe abort real em 8s e usa apenas restante de 12s", async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const timers = new Set<ReturnType<typeof nativeSetTimeout>>();
  const budgets: number[] = [];
  const signals: AbortSignal[] = [];
  let clock = 0;
  let calls = 0;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay: number) => {
    budgets.push(delay);
    const id = nativeSetTimeout(() => {
      timers.delete(id);
      clock += delay;
      callback();
    }, 1);
    timers.add(id);
    return id;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: ReturnType<typeof nativeSetTimeout>) => {
    timers.delete(id);
    nativeClearTimeout(id);
  }) as typeof clearTimeout;
  try {
    const admin = createClient("https://synthetic.invalid", "synthetic-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (_url, init) => {
        calls += 1;
        assert.equal(init?.method, "POST");
        const signal = init?.signal as AbortSignal;
        signals.push(signal);
        return new Promise<Response>((_, reject) => {
          signal.addEventListener("abort", () => reject(new globalThis.DOMException("aborted", "AbortError")), { once: true });
        });
      } },
    });
    const result = await readWorkerSecret(admin, GETTER, {
      now: () => clock,
      random: () => 0.5,
      sleep: (ms) => { clock += ms; return Promise.resolve(); },
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 2);
    assert.deepEqual(budgets, [8000, 3500]);
    assert.equal(clock, 12000);
    assert.ok(signals.every((signal) => signal.aborted));
    assert.equal(timers.size, 0);
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
  }
});

Deno.test("SDK pinado: resposta HTML504 não vaza corpo e nenhuma retentativa oculta", async () => {
  let calls = 0;
  const logs: WorkerSecretMetadata[] = [];
  const admin = createClient("https://synthetic.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: () => {
      calls += 1;
      return Promise.resolve(new Response("<html>private gateway context</html>", { status: 504 }));
    } },
  });
  const result = await readWorkerSecret(admin, GETTER, {
    sleep: () => Promise.resolve(), logger: (metadata) => logs.push(metadata),
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 2);
  assert.equal(result.metadata.status, 504);
  assert.doesNotMatch(JSON.stringify(logs), /html|private|synthetic-key|synthetic.invalid/);
});


Deno.test("recuperação transitória usa info e não aumenta logs de erro", () => {
  const error: unknown[] = [];
  const info: unknown[] = [];
  const logger = { error: (...values: unknown[]) => error.push(values), info: (...values: unknown[]) => info.push(values) };
  logWorkerSecretRead("worker", { stage: "WORKER_SECRET", attempts: 2, status: 200, code: "RECOVERED", durationMs: 500 }, logger);
  assert.equal(error.length, 0);
  assert.equal(info.length, 1);
});
