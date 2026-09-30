import {
  ensureProescCycleCache,
  INDIVIDUAL_ATTEMPT_BUDGET_MS,
  INDIVIDUAL_MAX_ATTEMPTS,
  INDIVIDUAL_REQUEST_BUDGET_MS,
  reviewProescCycles,
} from "./cycle-review.ts";
import { CycleCollectionPending } from "./cycle-review-pages.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rejected = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch {
    return true;
  }
  return false;
};
function fixture(busy = false) {
  const actions: string[] = [];
  return {
    actions,
    rpc: async (name: string, args: Record<string, unknown>) => {
      const action = String(args.p_action);
      actions.push(action);
      if (name === "proesc_cycle_review_pages_service") {
        return {
          data: args.p_action === "read"
            ? { version: 1, unitId: "1", tokenRevision: "revision", pages: [] }
            : { saved: true, reused: false, hash: "a".repeat(64) },
          error: null,
        };
      }
      if (name === "proesc_workspace_service") {
        return {
          data: { token: "a".repeat(32), revision: "revision" },
          error: null,
        };
      }
      assert(name === "proesc_cycle_review_cache_service");
      return {
        data: action === "begin"
          ? busy ? { busy: true } : {
            cacheId: id(20),
            lease: id(21),
            cached: false,
            tokenRevision: "revision",
            context: {
              unitId: "1",
              firstYear: 2026,
              lastYear: 2026,
              classIds: ["2"],
            },
          }
          : { cacheId: id(20), complete: true },
        error: null,
      };
    },
  };
}

Deno.test("a deadline while waiting for another cache owner settles without cancelling that owner", async () => {
  const owner = fixture();
  const ownerSignal = new AbortController();
  let started: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const transport: typeof fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      started();
      init?.signal?.addEventListener(
        "abort",
        () => reject(new Error("synthetic abort")),
        { once: true },
      );
    });
  const ownerResult = rejected(
    ensureProescCycleCache(owner, "actor", id(1), transport, {
      signal: ownerSignal.signal,
    }),
  );
  await ready;
  const waiter = fixture(true);
  const waiterSignal = new AbortController();
  const waiting = rejected(
    ensureProescCycleCache(waiter, "actor", id(2), transport, {
      signal: waiterSignal.signal,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  waiterSignal.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const settled = await Promise.race([
      waiting,
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), 30);
      }),
    ]);
    assert(settled, "Busy wait ignored its own deadline");
    assert(!ownerSignal.signal.aborted && waiter.actions.join(",") === "begin");
  } finally {
    clearTimeout(timer);
    ownerSignal.abort();
    await ownerResult;
  }
  assert(
    owner.actions.includes("abort") && !owner.actions.includes("complete"),
  );
});

Deno.test("a cache owner in another isolate is polled and its completed cache is reused", async () => {
  let clock = 0, begins = 0;
  const actions: string[] = [];
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      const action = String(args.p_action);
      actions.push(action);
      assert(
        name === "proesc_cycle_review_cache_service" && action === "begin",
      );
      begins++;
      return {
        data: begins < 3 ? { busy: true } : { cacheId: id(20), cached: true },
        error: null,
      };
    },
  };
  const cacheId = await ensureProescCycleCache(admin, "actor", id(1), () => {
    throw new Error("A waiter must not call the source");
  }, {
    budget: { deadlineAt: 10_000, now: () => clock },
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
  });
  assert(
    cacheId === id(20) && begins === 3 &&
      actions.join(",") === "begin,begin,begin",
  );
});

Deno.test("an already aborted review does not begin a lease or read credentials", async () => {
  const admin = fixture();
  const controller = new AbortController();
  controller.abort();
  assert(
    await rejected(
      ensureProescCycleCache(admin, "actor", id(1), fetch, {
        signal: controller.signal,
      }),
    ),
  );
  assert(admin.actions.length === 0);
});

Deno.test("aborting after all twelve bodies during source normalization never completes the cache", async () => {
  const admin = fixture();
  const controller = new AbortController();
  let reads = 0;
  const originalDigest = crypto.subtle.digest;
  crypto.subtle.digest = function (...args: Parameters<typeof originalDigest>) {
    assert(
      reads === 12,
      "Abort fixture did not reach normalization after the complete source",
    );
    controller.abort();
    return originalDigest.apply(this, args);
  };
  try {
    const failed = await rejected(
      ensureProescCycleCache(admin, "actor", id(1), async (input) => {
        reads++;
        const month = new URL(String(input)).searchParams.get("mes");
        return Response.json({
          status: "success",
          data: month === "12"
            ? [{
              chave_id: "3",
              id: "1",
              valor: "100.00",
              unidade_id: "1",
              turma_id: "2",
              aluno_cpf: "12345678901",
              data_vencimento: "2026-01-15",
              data_cricao: "2026-01-01",
              data_pagamento: null,
              registro_cancelado: false,
              pagamento_renegociacao: false,
            }]
            : [],
        });
      }, { signal: controller.signal }),
    );
    assert(
      failed && reads === 12 && admin.actions.includes("abort") &&
        !admin.actions.includes("complete"),
    );
  } finally {
    crypto.subtle.digest = originalDigest;
  }
});

Deno.test("individual review never exceeds its shared request budget while cache remains busy", async () => {
  let clock = 0;
  let begins = 0;
  const names: string[] = [];
  let caught: unknown;
  try {
    await reviewProescCycles(
      {
        rpc: async (name, args) => {
          names.push(name);
          assert(
            name === "proesc_cycle_review_cache_service" &&
              args.p_action === "begin",
          );
          begins++;
          return { data: { busy: true }, error: null };
        },
      },
      "actor",
      id(1),
      () => {
        throw new Error("Busy waiter must not call Proesc");
      },
      {
        budget: { deadlineAt: INDIVIDUAL_REQUEST_BUDGET_MS, now: () => clock },
        wait: async (milliseconds) => {
          clock += milliseconds;
        },
      },
    );
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof CycleCollectionPending && caught.status === 409);
  assert(
    clock === INDIVIDUAL_REQUEST_BUDGET_MS,
    "Individual retries escaped the absolute request deadline",
  );
  assert(
    clock < INDIVIDUAL_ATTEMPT_BUDGET_MS * INDIVIDUAL_MAX_ATTEMPTS &&
      begins > INDIVIDUAL_MAX_ATTEMPTS,
  );
  assert(names.every((name) => name === "proesc_cycle_review_cache_service"));
});

Deno.test("individual review stops after three transient collection yields", async () => {
  let attempts = 0;
  let caught: unknown;
  try {
    await reviewProescCycles(
      {
        rpc: async (name, args) => {
          assert(
            name === "proesc_cycle_review_cache_service" &&
              args.p_action === "begin",
          );
          attempts++;
          throw new CycleCollectionPending();
        },
      },
      "actor",
      id(1),
      () => {
        throw new Error("A yielded review must not call Proesc");
      },
    );
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof CycleCollectionPending && caught.status === 409);
  assert(
    attempts === INDIVIDUAL_MAX_ATTEMPTS,
    "Individual review exceeded its retry limit",
  );
});

Deno.test("individual absolute deadline also bounds the final classification RPC", async () => {
  let clock = 0;
  let recorded = 0;
  let caught: unknown;
  try {
    await reviewProescCycles(
      {
        rpc: async (name, args) => {
          if (name === "proesc_cycle_review_cache_service") {
            assert(args.p_action === "begin");
            return { data: { cacheId: id(20), cached: true }, error: null };
          }
          assert(name === "proesc_record_api_cycle_review_service");
          recorded++;
          clock = 11;
          return { data: { classification: "UNKNOWN" }, error: null };
        },
      },
      "actor",
      id(1),
      () => {
        throw new Error("Fresh cache must not call Proesc");
      },
      {
        budget: { deadlineAt: 10, now: () => clock },
      },
    );
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof CycleCollectionPending && caught.status === 409);
  assert(recorded === 1, "Final classification RPC was not exercised");
});

Deno.test("individual absolute deadline aborts an in-flight source and releases its own lease", async () => {
  const admin = fixture();
  const startedAt = Date.now();
  let caught: unknown;
  try {
    await reviewProescCycles(
      admin,
      "actor",
      id(1),
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const abort = () => reject(new Error("synthetic global deadline"));
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) abort();
        }),
      { budget: { deadlineAt: startedAt + 20, now: Date.now } },
    );
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof CycleCollectionPending && caught.status === 409);
  assert(
    Date.now() - startedAt < 500,
    "Global deadline did not settle the source promptly",
  );
  assert(
    admin.actions.includes("abort") && !admin.actions.includes("complete"),
  );
});

Deno.test("individual absolute deadline settles an RPC that never resolves", async () => {
  const startedAt = Date.now();
  let caught: unknown;
  try {
    await reviewProescCycles(
      {
        rpc: () =>
          new Promise<{ data: unknown; error: unknown }>(() => undefined),
      },
      "actor",
      id(1),
      fetch,
      {
        budget: { deadlineAt: startedAt + 20, now: Date.now },
      },
    );
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof CycleCollectionPending && caught.status === 409);
  assert(Date.now() - startedAt < 500, "A RPC ignorou o deadline absoluto");
});

Deno.test("deadline aborts the RPC builder but gives lease release an independent bounded signal", async () => {
  const actions: string[] = [];
  let sourceSignal: AbortSignal | undefined;
  let releaseSignal: AbortSignal | undefined;
  const response = (data: unknown) => Promise.resolve({ data, error: null });
  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => {
      const action = String(args.p_action || name);
      actions.push(action);
      if (name === "proesc_cycle_review_cache_service" && action === "begin") {
        return response({
          cacheId: id(20),
          lease: id(21),
          cached: false,
          tokenRevision: "revision",
          context: {
            unitId: "1",
            firstYear: 2026,
            lastYear: 2026,
            classIds: ["2"],
          },
        });
      }
      if (name === "proesc_cycle_review_cache_service" && action === "abort") {
        return Object.assign(response({ cacheId: id(20) }), {
          abortSignal(signal: AbortSignal) {
            releaseSignal = signal;
            return response({ cacheId: id(20) });
          },
        });
      }
      assert(name === "proesc_workspace_service");
      const pending = new Promise<{ data: unknown; error: unknown }>(() =>
        undefined
      );
      return Object.assign(pending, {
        abortSignal(signal: AbortSignal) {
          sourceSignal = signal;
          return new Promise<{ data: unknown; error: unknown }>(
            (_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => reject(new Error("synthetic RPC abort")),
                { once: true },
              );
            },
          );
        },
      });
    },
  };
  const startedAt = Date.now();
  let caught: unknown;
  try {
    await reviewProescCycles(admin, "actor", id(1), fetch, {
      budget: { deadlineAt: startedAt + 20, now: Date.now },
    });
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof CycleCollectionPending && caught.status === 409);
  assert(
    sourceSignal?.aborted === true,
    "A RPC principal não recebeu o AbortSignal",
  );
  assert(
    releaseSignal?.aborted === false,
    "A liberação reutilizou o sinal já abortado",
  );
  assert(actions.includes("abort") && !actions.includes("complete"));
});
