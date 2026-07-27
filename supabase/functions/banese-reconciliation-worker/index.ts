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

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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

  const request = requestBaneseBoletoAccessToken(admin, environment);
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
    Math.min(10, Number(runConfig.targetTitles || 1)),
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
    await admin.rpc("finish_banese_reconciliation_run", {
      p_run_id: runId,
      p_oauth_requests: 0,
      p_oauth_reused: false,
      p_duration_ms: Date.now() - startedAt,
    });
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
  const oauthMetrics = { requests: 0, reused: false };
  const intervalMs = Math.min(1_000, Math.floor(60_000 / targetTitles / 2));

  for (let index = 0; index < items.length; index += 1) {
    const { receivableId } = items[index];
    const attemptStartedAt = Date.now();
    try {
      let token = await getSharedToken(
        admin,
        environment,
        refreshMarginSeconds,
        oauthMetrics,
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
          );
          return await queryBaneseBoleto(queryAdmin, queryEnvironment, {
            ...input,
            accessToken: token,
          });
        }
      };

      const result = await reconcileBaneseReceivable(admin, receivableId, {
        queryBoleto: queryWithSharedToken,
      });
      reconciled += 1;
      if (result.paid) {
        paid += 1;
      } else {
        pending += 1;
      }
      await admin.rpc("record_banese_reconciliation_attempt", {
        p_run_id: runId,
        p_receivable_id: receivableId,
        p_result: result.paid ? "PAID" : "PENDING",
        p_remote_status: result.remoteStatus || null,
        p_error_class: null,
        p_http_status: null,
        p_duration_ms: Date.now() - attemptStartedAt,
      });
    } catch (error) {
      failed += 1;
      const classification = classifyError(error);
      throttled = classification.result === "THROTTLED";
      console.error("banese reconciliation item failed", {
        receivableId,
        errorClass: classification.errorClass,
        httpStatus: classification.httpStatus,
      });
      await admin
        .from("contas_receber")
        .update({
          gateway_last_error: classification.publicMessage,
          gateway_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivableId)
        .eq("gateway_provider", "banese_card");
      await admin.rpc("record_banese_reconciliation_attempt", {
        p_run_id: runId,
        p_receivable_id: receivableId,
        p_result: classification.result,
        p_remote_status: null,
        p_error_class: classification.errorClass,
        p_http_status: classification.httpStatus,
        p_duration_ms: Date.now() - attemptStartedAt,
      });
      if (throttled) break;
    }
    if (index < items.length - 1 && !throttled) await wait(intervalMs);
  }

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
    reconciled,
    pending,
    paid,
    failed,
    throttled,
    oauthRequests: oauthMetrics.requests,
    oauthReused: oauthMetrics.reused,
    decision: finishResult?.decision || null,
  });
});
