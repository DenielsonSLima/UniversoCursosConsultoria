import { object, ProescError } from "./contract.ts";
import { cycleEvidenceObligations } from "./cycle-schedule-source.ts";
import {
  collectCyclePages,
  cycleCollectionBudget,
  CycleCollectionPending,
  type CycleReviewReadOptions,
} from "./cycle-review-pages.ts";
export type { CycleReviewReadOptions } from "./cycle-review-pages.ts";

type CycleReviewRpcResponse = { data: unknown; error: unknown };
type CycleReviewRpcCall = PromiseLike<CycleReviewRpcResponse> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<CycleReviewRpcResponse>;
};
export type CycleReviewAdmin = {
  rpc: (name: string, args: Record<string, unknown>) => CycleReviewRpcCall;
};
export type CycleReviewEnsureOptions = CycleReviewReadOptions & {
  wait?: (milliseconds: number) => Promise<void>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUSY_POLL_MS = 2_000;
const LEASE_RELEASE_GRACE_MS = 5_000;
// The hosted gateway returns 504 after 150s without a response. Keep enough
// margin for releasing a lease and serializing the final 409/200 response.
export const INDIVIDUAL_REQUEST_BUDGET_MS = 120_000;
export const INDIVIDUAL_ATTEMPT_BUDGET_MS = 55_000;
export const INDIVIDUAL_MAX_ATTEMPTS = 3;

async function awaitRpc(
  call: CycleReviewRpcCall,
  signal: AbortSignal | undefined,
): Promise<CycleReviewRpcResponse> {
  if (!signal) return await call;
  if (signal.aborted) {
    throw new ProescError("A consulta automática será retomada.", 409);
  }
  const pending = typeof call.abortSignal === "function"
    ? call.abortSignal(signal)
    : call;
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () =>
      reject(new ProescError("A consulta automática será retomada.", 409));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([Promise.resolve(pending), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function waitForLease(
  milliseconds: number,
  signal: AbortSignal | undefined,
  wait: (milliseconds: number) => Promise<void>,
) {
  if (!signal) {
    await wait(milliseconds);
    return;
  }
  if (signal.aborted) {
    throw new ProescError("A consulta automática será retomada.", 409);
  }
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () =>
      reject(new ProescError("A consulta automática será retomada.", 409));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    await Promise.race([wait(milliseconds), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export async function ensureProescCycleCache(
  admin: CycleReviewAdmin,
  actorId: string,
  matriculaId: unknown,
  transport = fetch,
  options: CycleReviewEnsureOptions = {},
) {
  if (typeof matriculaId !== "string" || !uuid.test(matriculaId)) {
    throw new ProescError("Matrícula inválida.");
  }
  const budget = options.budget ?? cycleCollectionBudget();
  const wait = options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      }));
  const assertActive = () => {
    if (options.signal?.aborted) {
      throw new ProescError("A consulta automática será retomada.", 409);
    }
  };
  const rpc = async (
    name: string,
    payload: Record<string, unknown>,
    signal: AbortSignal | undefined = options.signal,
  ) => {
    const { data, error } = await awaitRpc(admin.rpc(name, payload), signal);
    if (error) {
      throw new ProescError(
        "Não foi possível confirmar os ciclos. Atualize a tela e confira novamente.",
        409,
      );
    }
    return object(data);
  };
  const cacheRpc = (
    action: string,
    payload: Record<string, unknown> = {},
    signal: AbortSignal | undefined = options.signal,
  ) =>
    rpc("proesc_cycle_review_cache_service", {
      p_action: action,
      p_actor_id: actorId,
      p_matricula_id: matriculaId,
      p_payload: payload,
    }, signal);
  assertActive();
  let start = await cacheRpc("begin");
  // The database lease is the single-flight authority across Edge isolates.
  // Polling it also covers another worker, where a process-local Promise cannot.
  while (start.busy === true) {
    assertActive();
    const remaining = budget.deadlineAt - budget.now();
    if (remaining <= 0) throw new CycleCollectionPending();
    await waitForLease(Math.min(BUSY_POLL_MS, remaining), options.signal, wait);
    assertActive();
    start = await cacheRpc("begin");
  }
  if (typeof start.cacheId !== "string" || !uuid.test(start.cacheId)) {
    throw new ProescError("Conferência inválida.", 409);
  }
  const cacheId = start.cacheId;
  if (start.cached !== true) {
    const context = object(start.context);
    const firstYear = Number(context.firstYear),
      lastYear = Number(context.lastYear);
    if (
      typeof context.unitId !== "string" || !/^\d+$/.test(context.unitId) ||
      !Number.isInteger(firstYear) || !Number.isInteger(lastYear) ||
      firstYear < 2000 ||
      lastYear < firstYear || lastYear > firstYear + 5 ||
      !Array.isArray(context.classIds) ||
      context.classIds.some((id) =>
        typeof id !== "string" || !/^\d+$/.test(id)
      ) ||
      typeof start.lease !== "string" || !uuid.test(start.lease)
    ) throw new ProescError("Janela de conferência inválida.", 409);
    const run = async () => {
      assertActive();
      const credential = await rpc("proesc_workspace_service", {
        p_action: "token",
        p_actor_id: actorId,
        p_payload: {},
      });
      if (
        typeof credential.token !== "string" ||
        credential.revision !== start.tokenRevision
      ) {
        throw new ProescError(
          "A conexão Proesc mudou. Confira novamente.",
          409,
        );
      }
      assertActive();
      if (typeof credential.revision !== "string") {
        throw new ProescError("Conexão Proesc inválida.", 409);
      }
      const pageRpc = (action: string, payload: Record<string, unknown>) =>
        rpc("proesc_cycle_review_pages_service", {
          p_action: action,
          p_actor_id: actorId,
          p_matricula_id: matriculaId,
          p_payload: payload,
        });
      const pages = await collectCyclePages(
        {
          unitId: context.unitId as string,
          firstYear,
          lastYear,
          tokenRevision: credential.revision,
        },
        { cacheId, lease: start.lease as string },
        credential.token,
        transport,
        pageRpc,
        assertActive,
        { ...options, budget },
      );
      const obligations = cycleEvidenceObligations(
        pages,
        context.classIds as string[],
      );
      assertActive();
      await cacheRpc("complete", {
        cacheId,
        lease: start.lease,
        obligations,
        resumeVersion: 1,
        sourceObservedAt: new Date(
          Math.min(...pages.map((page) => Date.parse(page.observedAt))),
        ).toISOString(),
        periods: pages.map((page) => ({
          year: page.year,
          month: page.month,
          complete: true,
        })),
        pageHashes: pages.map((page) => ({
          year: page.year,
          month: page.month,
          hash: page.hash,
        })),
      });
    };
    try {
      await run();
    } catch (error) {
      // The request deadline may already have aborted. Give only the lease
      // release its own small budget so stale ownership cannot block resumption.
      const releaseController = new AbortController();
      const releaseTimer = setTimeout(
        () => releaseController.abort(),
        LEASE_RELEASE_GRACE_MS,
      );
      try {
        await cacheRpc(
          "abort",
          { cacheId, lease: start.lease },
          releaseController.signal,
        ).catch(() => undefined);
      } finally {
        clearTimeout(releaseTimer);
      }
      throw error;
    }
  }
  assertActive();
  return cacheId;
}

export async function reviewProescCycles(
  admin: CycleReviewAdmin,
  actorId: string,
  matriculaId: unknown,
  transport = fetch,
  options: CycleReviewEnsureOptions = {},
) {
  const now = options.budget?.now ?? Date.now;
  const startedAt = now();
  const requestedDeadline = options.budget?.deadlineAt;
  const deadlineAt = Math.min(
    Number.isFinite(requestedDeadline)
      ? Number(requestedDeadline)
      : Number.POSITIVE_INFINITY,
    startedAt + INDIVIDUAL_REQUEST_BUDGET_MS,
  );
  const controller = new AbortController();
  let deadlineExpired = false;
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    deadlineExpired = true;
    controller.abort();
  }, Math.max(0, deadlineAt - now()));
  const assertWithinDeadline = () => {
    if (deadlineExpired || now() >= deadlineAt) {
      deadlineExpired = true;
      controller.abort();
      throw new CycleCollectionPending();
    }
    if (controller.signal.aborted) {
      throw new ProescError("A consulta automática será retomada.", 409);
    }
  };

  try {
    let cacheId = "";
    for (let attempt = 0; attempt < INDIVIDUAL_MAX_ATTEMPTS; attempt++) {
      assertWithinDeadline();
      const attemptBudget = {
        deadlineAt: Math.min(deadlineAt, now() + INDIVIDUAL_ATTEMPT_BUDGET_MS),
        now,
      };
      try {
        cacheId = await ensureProescCycleCache(
          admin,
          actorId,
          matriculaId,
          transport,
          {
            ...options,
            budget: attemptBudget,
            signal: controller.signal,
          },
        );
        break;
      } catch (error) {
        if (
          !(error instanceof CycleCollectionPending) ||
          attempt === INDIVIDUAL_MAX_ATTEMPTS - 1
        ) throw error;
        // The yielded owner already released its lease. Continue immediately so
        // persisted pages can form one fresh five-minute manifest within the same request budget.
      }
    }
    assertWithinDeadline();
    const { data, error } = await awaitRpc(
      admin.rpc("proesc_record_api_cycle_review_service", {
        p_actor_id: actorId,
        p_matricula_id: matriculaId,
        p_cache_id: cacheId,
      }),
      controller.signal,
    );
    assertWithinDeadline();
    if (error) {
      throw new ProescError(
        "Não foi possível confirmar os ciclos. Atualize a tela e confira novamente.",
        409,
      );
    }
    return object(data);
  } catch (error) {
    if (deadlineExpired || now() >= deadlineAt) {
      deadlineExpired = true;
      controller.abort();
      throw new CycleCollectionPending();
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
