import { createClient } from "npm:@supabase/supabase-js@2";
import { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import {
  queryBaneseBoleto,
  requestBaneseBoletoAccessToken,
} from "../banese/core/adapter.ts";
import type {
  BaneseAccessToken,
  Environment,
} from "../banese/core/adapter.ts";

type CachedToken = {
  token: BaneseAccessToken;
  expiresAt: number;
};

const tokenCache = new Map<Environment, CachedToken>();
const tokenRequests = new Map<Environment, Promise<BaneseAccessToken>>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const safeEqual = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
};

const readRequestBody = async (req: Request) => {
  const text = await req.text();
  if (!text) return;
  if (text.length > 1_024) throw new Error("Corpo da requisição inválido.");
  JSON.parse(text);
};

const wait = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted || milliseconds <= 0) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });

const classifyError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const statusMatch = message.match(/\((\d{3})\)/);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : null;
  if (httpStatus === 429) {
    return {
      result: "THROTTLED" as const,
      errorClass: "RATE_LIMIT",
      httpStatus,
      publicMessage: "Consulta Banese temporariamente limitada (HTTP 429).",
    };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      result: "ERROR" as const,
      errorClass: "AUTH",
      httpStatus,
      publicMessage: "Falha de autenticação na consulta Banese.",
    };
  }
  if (httpStatus && httpStatus >= 500) {
    return {
      result: "ERROR" as const,
      errorClass: "UPSTREAM_5XX",
      httpStatus,
      publicMessage: "Serviço Banese temporariamente indisponível.",
    };
  }
  if (/timeout|timed out|aborted/i.test(message)) {
    return {
      result: "ERROR" as const,
      errorClass: "TIMEOUT",
      httpStatus,
      publicMessage: "Tempo esgotado na consulta Banese.",
    };
  }
  if (/SUPABASE_AUDIT_WRITE/i.test(message)) {
    return {
      result: "ERROR" as const,
      errorClass: "AUDIT_WRITE",
      httpStatus,
      publicMessage: "A consulta ocorreu, mas a auditoria interna falhou.",
    };
  }
  if (/diverge|inválid|inval|bloquead|mudou durante/i.test(message)) {
    return {
      result: "ERROR" as const,
      errorClass: "REVIEW_REQUIRED",
      httpStatus,
      publicMessage: "Consulta Banese requer revisão financeira.",
    };
  }
  return {
    result: "ERROR" as const,
    errorClass: "QUERY_ERROR",
    httpStatus,
    publicMessage: "Não foi possível confirmar o título no Banese.",
  };
};

const invalidateToken = (environment: Environment) => {
  tokenCache.delete(environment);
  tokenRequests.delete(environment);
};

const getSharedToken = async (
  admin: any,
  environment: Environment,
  refreshMarginSeconds: number,
  metrics: { requests: number; reused: boolean },
  signal?: AbortSignal,
) => {
  const cached = tokenCache.get(environment);
  if (cached && cached.expiresAt > Date.now()) {
    metrics.reused = true;
    return cached.token;
  }

  const inFlight = tokenRequests.get(environment);
  if (inFlight) {
    metrics.reused = true;
    return await inFlight;
  }

  const request = requestBaneseBoletoAccessToken(admin, environment, {
    signal,
  });
  tokenRequests.set(environment, request);
  metrics.requests += 1;
  try {
    const token = await request;
    const expiresIn = Math.max(
      60,
      Number(token.expiresIn || 3600) - refreshMarginSeconds,
    );
    tokenCache.set(environment, {
      token,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    return token;
  } finally {
    tokenRequests.delete(environment);
  }
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("banese reconciliation worker missing Supabase environment");
    return json({ error: "Configuração indisponível." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: configuredSecret, error: secretError } = await admin.rpc(
    "get_banese_reconciliation_worker_secret",
  );
  const requestSecret = String(
    req.headers.get("X-Banese-Worker-Token") ?? "",
  ).trim();
  const expectedSecret = String(configuredSecret ?? "").trim();
  if (
    secretError || expectedSecret.length < 32 ||
    !safeEqual(requestSecret, expectedSecret)
  ) {
    return json({ error: "Não autorizado." }, 401);
  }

  try {
    await readRequestBody(req);
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }

  const startedAt = Date.now();
  const { data: runConfig, error: beginError } = await admin.rpc(
    "begin_banese_reconciliation_run",
  );
  if (beginError) {
    console.error("banese reconciliation begin failed", {
      errorClass: "BEGIN_RUN_ERROR",
    });
    return json({ error: "Não foi possível iniciar a conciliação." }, 500);
  }
  if (!runConfig?.enabled) {
    return json({
      success: true,
      skipped: true,
      reason: String(runConfig?.reason || "DISABLED"),
    });
  }

  const runId = String(runConfig.runId || "");
  const environment = String(runConfig.environment || "") as Environment;
  const targetTitles = Math.max(
    1,
    Math.min(375, Number(runConfig.targetTitles || 1)),
  );
  const maxConcurrency = Math.max(
    1,
    Math.min(8, Number(runConfig.maxConcurrency || 1)),
  );
  const refreshMarginSeconds = Math.max(
    30,
    Math.min(300, Number(runConfig.oauthRefreshMarginSeconds || 60)),
  );

  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_banese_reconciliation_batch_v2",
    { p_run_id: runId },
  );
  if (claimError) {
    console.error("banese reconciliation claim failed", {
      errorClass: "CLAIM_ERROR",
    });
    const { error: failureAuditError } = await admin.rpc(
      "fail_banese_reconciliation_run",
      {
        p_run_id: runId,
        p_error_class: "CLAIM_ERROR",
        p_decision: "Falha interna ao preparar a fila de consulta Banese.",
        p_duration_ms: Date.now() - startedAt,
      },
    );
    if (failureAuditError) {
      console.error("banese reconciliation failure audit failed", {
        errorClass: "FAILURE_AUDIT_ERROR",
      });
    }
    return json({ error: "Não foi possível iniciar a conciliação." }, 500);
  }

  const items = (Array.isArray(claimed) ? claimed : [])
    .map((item) => ({
      receivableId: String(item?.receivable_id ?? ""),
      modality: String(item?.modality ?? "OUTROS_CREDITOS"),
    }))
    .filter((item) => Boolean(item.receivableId));
  let reconciled = 0;
  let paid = 0;
  let failed = 0;
  let pending = 0;
  let throttled = false;
  let halted = false;
  let launched = 0;
  let auditFailure = false;
  const oauthMetrics = { requests: 0, reused: false };
  const batchController = new globalThis.AbortController();
  const processingStartedAt = Date.now();
  const queryDeadline = startedAt + 40_000;
  const hardDeadline = startedAt + 50_000;
  const launchWindowMs = Math.max(
    1_000,
    Math.min(30_000, queryDeadline - processingStartedAt - 8_000),
  );
  const launchIntervalMs = targetTitles <= 1
    ? 0
    : Math.max(80, Math.floor(launchWindowMs / (targetTitles - 1)));
  const launchDeadline = processingStartedAt + launchWindowMs;
  let cursor = 0;

  const processItem = async (
    item: { receivableId: string; modality: string },
    index: number,
  ) => {
    const scheduledAt = processingStartedAt + index * launchIntervalMs;
    if (scheduledAt > Date.now()) {
      await wait(scheduledAt - Date.now(), batchController.signal);
    }
    if (
      halted || batchController.signal.aborted ||
      Date.now() > launchDeadline
    ) return;
    const { receivableId } = item;
    launched += 1;
    const attemptStartedAt = Date.now();
    const queryController = new globalThis.AbortController();
    const abortQuery = () => queryController.abort(batchController.signal.reason);
    batchController.signal.addEventListener("abort", abortQuery, { once: true });
    const remainingMs = Math.max(
      250,
      Math.min(8_000, queryDeadline - Date.now()),
    );
    const timeout = setTimeout(
      () => queryController.abort(
        new globalThis.DOMException("Banese query timeout", "TimeoutError"),
      ),
      remainingMs,
    );
    try {
      let token = await getSharedToken(
        admin,
        environment,
        refreshMarginSeconds,
        oauthMetrics,
        queryController.signal,
      );
      let renewedAfterUnauthorized = false;
      const queryWithSharedToken = async (
        queryAdmin: any,
        queryEnvironment: Environment,
        input: { convenio: unknown; nossoNumero: unknown },
      ) => {
        try {
          return await queryBaneseBoleto(queryAdmin, queryEnvironment, {
            ...input,
            accessToken: token,
            signal: queryController.signal,
          });
        } catch (error) {
          const classification = classifyError(error);
          if (
            classification.errorClass !== "AUTH" ||
            renewedAfterUnauthorized
          ) {
            throw error;
          }
          renewedAfterUnauthorized = true;
          invalidateToken(queryEnvironment);
          token = await getSharedToken(
            queryAdmin,
            queryEnvironment,
            refreshMarginSeconds,
            oauthMetrics,
            queryController.signal,
          );
          return await queryBaneseBoleto(queryAdmin, queryEnvironment, {
            ...input,
            accessToken: token,
            signal: queryController.signal,
          });
        }
      };

      const result = await reconcileBaneseReceivable(admin, receivableId, {
        queryBoleto: queryWithSharedToken,
      });
      if (Date.now() > hardDeadline) {
        // A reconciliação pode já ter aplicado a baixa e ativado o EAD.
        // Depois desse ponto, atraso é telemetria — nunca convertemos sucesso
        // financeiro em TIMEOUT nem reabrimos a fila como se a consulta falhasse.
        console.warn("banese reconciliation completed after target deadline", {
          receivableId,
          errorClass: "LATE_COMPLETION",
        });
      }
      reconciled += 1;
      if (result.paid) {
        paid += 1;
      } else {
        pending += 1;
      }
      const { error: attemptError } = await admin.rpc(
        "record_banese_reconciliation_attempt",
        {
        p_run_id: runId,
        p_receivable_id: receivableId,
        p_result: result.paid ? "PAID" : "PENDING",
        p_remote_status: result.remoteStatus || null,
        p_error_class: null,
        p_http_status: null,
        p_duration_ms: Date.now() - attemptStartedAt,
        },
      );
      if (attemptError) {
        throw new Error("SUPABASE_AUDIT_WRITE");
      }
    } catch (error) {
      const cancelledByPeer = halted &&
        batchController.signal.aborted &&
        queryController.signal.aborted;
      if (cancelledByPeer) return;
      failed += 1;
      const classification = classifyError(error);
      throttled ||= classification.result === "THROTTLED";
      halted = true;
      batchController.abort(classification.errorClass);
      console.error("banese reconciliation item failed", {
        receivableId,
        errorClass: classification.errorClass,
        httpStatus: classification.httpStatus,
      });
      if (classification.errorClass !== "AUDIT_WRITE") {
        const { error: updateError } = await admin
          .from("contas_receber")
          .update({
            gateway_last_error: classification.publicMessage,
            gateway_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", receivableId)
          .eq("gateway_provider", "banese_card");
        if (updateError) auditFailure = true;

        const { error: attemptError } = await admin.rpc(
          "record_banese_reconciliation_attempt",
          {
            p_run_id: runId,
            p_receivable_id: receivableId,
            p_result: classification.result,
            p_remote_status: null,
            p_error_class: classification.errorClass,
            p_http_status: classification.httpStatus,
            p_duration_ms: Date.now() - attemptStartedAt,
          },
        );
        if (attemptError) auditFailure = true;
      } else {
        auditFailure = true;
      }
      return;
    } finally {
      clearTimeout(timeout);
      batchController.signal.removeEventListener("abort", abortQuery);
    }
  };

  const worker = async () => {
    while (!halted && Date.now() < launchDeadline) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await processItem(items[index], index);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(maxConcurrency, Math.max(1, items.length)) },
      () => worker(),
    ),
  );

  const { data: finishResult, error: finishError } = await admin.rpc(
    "finish_banese_reconciliation_run",
    {
      p_run_id: runId,
      p_oauth_requests: oauthMetrics.requests,
      p_oauth_reused: oauthMetrics.reused,
      p_duration_ms: Date.now() - startedAt,
    },
  );
  if (finishError) {
    console.error("banese reconciliation finish failed", {
      errorClass: "FINISH_RUN_ERROR",
    });
    return json({ error: "A consulta terminou, mas a auditoria falhou." }, 500);
  }

  return json({
    success: true,
    runId,
    profileId: runConfig.profileId,
    claimed: items.length,
    launched,
    reconciled,
    pending,
    paid,
    failed,
    throttled,
    auditFailure,
    oauthRequests: oauthMetrics.requests,
    oauthReused: oauthMetrics.reused,
    decision: finishResult?.decision || null,
  });
});
