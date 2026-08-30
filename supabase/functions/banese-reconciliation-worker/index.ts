import { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  queryBaneseBoleto,
  requestBaneseBoletoAccessToken,
} from "../banese/core/adapter.ts";
import type { BaneseAccessToken, Environment } from "../banese/core/adapter.ts";
import {
  canLaunchAt,
  createLaunchPacing,
  remainingBaneseQueryBudgetMs,
  scheduledLaunchAt,
} from "./pacing.ts";
import { readRequestBody, safeEqual } from "./request-guards.ts";
import { json } from "./response.ts";
import {
  createLazyAsyncValue,
  queryWithSingleBaneseAuthRetry,
} from "./query-token-retry.ts";
import {
  classifyBaneseReconciliationError,
  guardBaneseErrorStatusUpdate,
  shouldHaltBaneseReconciliationBatch,
  shouldWriteBaneseReceivableError,
} from "./error-classification.ts";
import {
  recoverBaneseIncidentBatch,
  shouldPauseNormalReconciliationForIncident,
} from "./incident-recovery.ts";
import {
  discountRepairDiagnosticCode,
  repairMarkedBaneseDiscountBeforeBatch,
} from "./discount-removal-maintenance.ts";

type CachedToken = { token: BaneseAccessToken; expiresAt: number };

const tokenCache = new Map<Environment, CachedToken>();
const tokenRequests = new Map<Environment, Promise<BaneseAccessToken>>();

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
  if (
    secretError || typeof configuredSecret !== "string" ||
    configuredSecret.length < 32
  ) {
    const errorCode = String(
      (secretError as { code?: unknown } | null)?.code || "RPC",
    );
    console.error("banese reconciliation worker secret unavailable", {
      code: errorCode,
    });
    return json({ error: "Configuração indisponível.", code: errorCode }, 500);
  }
  const requestSecret = String(
    req.headers.get("X-Banese-Worker-Token") ?? "",
  ).trim();
  if (!safeEqual(requestSecret, configuredSecret)) {
    return json({ error: "Não autorizado." }, 401);
  }

  try {
    await readRequestBody(req);
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }

  try {
    const discountRepair = await repairMarkedBaneseDiscountBeforeBatch(
      admin,
      reconcileBaneseReceivable,
    );
    if (discountRepair) {
      return json({ success: true, discountRepair });
    }
  } catch (error) {
    console.error("banese marked discount repair failed", {
      errorClass: "DISCOUNT_REPAIR_ERROR",
      diagnosticCode: discountRepairDiagnosticCode(error),
    });
    return json({ error: "Não foi possível corrigir o desconto Banese." }, 500);
  }

  let incidentRecovery;
  try {
    incidentRecovery = await recoverBaneseIncidentBatch(admin, supabaseUrl);
  } catch {
    console.error("banese incident recovery failed", {
      errorClass: "INCIDENT_RECOVERY_ERROR",
    });
    return json(
      { error: "Não foi possível executar a recuperação Banese segura." },
      500,
    );
  }
  if (shouldPauseNormalReconciliationForIncident(incidentRecovery)) {
    return json({
      success: incidentRecovery.failed === 0,
      skipped: true,
      reason: "INCIDENT_RECOVERY_PENDING",
      incidentRecovery,
    }, incidentRecovery.failed > 0 ? 503 : 200);
  }

  const startedAt = Date.now();
  const { data: runConfig, error: prepareError } = await admin.rpc(
    "prepare_banese_reconciliation_batch_v3",
  );
  if (prepareError) {
    console.error("banese reconciliation prepare failed", {
      errorClass: "PREPARE_ERROR",
    });
    return json({ error: "Não foi possível iniciar a conciliação." }, 500);
  }
  if (
    !runConfig || typeof runConfig !== "object" ||
    typeof runConfig.enabled !== "boolean"
  ) {
    console.error("banese reconciliation prepare returned invalid response", {
      errorClass: "PREPARE_CONTRACT_ERROR",
    });
    return json(
      { error: "A reserva da conciliação retornou dados inválidos." },
      500,
    );
  }
  if (runConfig.enabled === false) {
    return json({
      success: true,
      skipped: true,
      reason: String(runConfig?.reason || "DISABLED"),
      incidentRecovery,
    });
  }

  const runId = String(runConfig.runId || "");
  const environment = String(runConfig.environment || "") as Environment;
  const targetTitles = Math.max(
    1,
    Math.min(9_000, Number(runConfig.targetTitles || 1)),
  );
  const maxConcurrency = Math.max(
    1,
    Math.min(25, Number(runConfig.maxConcurrency || 1)),
  );
  const refreshMarginSeconds = Math.max(
    30,
    Math.min(300, Number(runConfig.oauthRefreshMarginSeconds || 60)),
  );

  const rawItems: Array<Record<string, unknown>> =
    Array.isArray(runConfig.items)
      ? runConfig.items.filter(
        (item: unknown): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      : [];
  const items = rawItems
    .map((item) => ({
      receivableId: String(item?.receivableId ?? ""),
      modality: String(item?.modality ?? "OUTROS_CREDITOS"),
    }))
    .filter((item) => Boolean(item.receivableId));

  const claimed = Number(runConfig.claimed || 0);
  if (
    !runId || !environment || claimed !== items.length || items.length === 0
  ) {
    console.error("banese reconciliation prepare returned invalid batch", {
      errorClass: "PREPARE_CONTRACT_ERROR",
      hasRunId: Boolean(runId),
      hasEnvironment: Boolean(environment),
      claimed,
      items: items.length,
    });
    if (runId) {
      const { error: failureAuditError } = await admin.rpc(
        "fail_banese_reconciliation_run",
        {
          p_run_id: runId,
          p_error_class: "PREPARE_CONTRACT_ERROR",
          p_decision: "A reserva Banese retornou um lote inconsistente.",
          p_duration_ms: Date.now() - startedAt,
        },
      );
      if (failureAuditError) {
        console.error("banese reconciliation failure audit failed", {
          errorClass: "FAILURE_AUDIT_ERROR",
        });
      }
    }
    return json(
      { error: "A reserva da conciliação retornou dados inválidos." },
      500,
    );
  }
  let reconciled = 0;
  let paid = 0;
  let failed = 0;
  let pending = 0;
  let throttled = false;
  let halted = false;
  let launched = 0;
  let auditFailure = false;
  const oauthMetrics = { requests: 0, reused: false };
  const pacing = createLaunchPacing(startedAt, Date.now(), targetTitles);
  let cursor = 0;

  const processItem = async (
    item: { receivableId: string; modality: string },
    index: number,
  ) => {
    const scheduledAt = scheduledLaunchAt(pacing, index);
    await wait(Math.max(0, scheduledAt - Date.now()));
    if (halted || !canLaunchAt(pacing, Date.now())) return;
    const { receivableId } = item;
    launched += 1;
    const attemptStartedAt = Date.now();
    const queryController = new globalThis.AbortController();
    const remainingMs = remainingBaneseQueryBudgetMs(pacing, Date.now());
    const timeout = setTimeout(
      () =>
        queryController.abort(
          new globalThis.DOMException("Banese query timeout", "TimeoutError"),
        ),
      remainingMs,
    );
    try {
      const token = createLazyAsyncValue(() =>
        getSharedToken(
          admin,
          environment,
          refreshMarginSeconds,
          oauthMetrics,
          queryController.signal,
        )
      );
      const queryWithSharedToken = async (
        queryAdmin: any,
        queryEnvironment: Environment,
        input: Omit<
          Parameters<typeof queryBaneseBoleto>[2],
          "accessToken" | "signal"
        >,
      ) => {
        return await queryWithSingleBaneseAuthRetry({
          query: async () =>
            queryBaneseBoleto(queryAdmin, queryEnvironment, {
              ...input,
              accessToken: await token.get(),
              signal: queryController.signal,
            }),
          renew: async () => {
            invalidateToken(queryEnvironment);
            token.reset();
            await token.get();
          },
          deferredError: (snapshot) => snapshot.paymentsError,
        });
      };

      // O prazo local cancela apenas OAuth/GET no Banese. A persistência
      // PostgREST termina pelo statement_timeout do PostgreSQL e devolve o
      // erro ao worker, sem abandonar uma transação no servidor.
      const result = await reconcileBaneseReceivable(admin, receivableId, {
        queryBoleto: queryWithSharedToken,
      });
      if (Date.now() > pacing.hardDeadline) {
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
      failed += 1;
      const classification = classifyBaneseReconciliationError(error);
      throttled ||= classification.result === "THROTTLED";
      if (shouldHaltBaneseReconciliationBatch(classification.errorClass)) {
        halted = true;
      }
      console.error("banese reconciliation item failed", {
        receivableId,
        errorClass: classification.errorClass,
        diagnosticCode: classification.diagnosticCode ||
          classification.errorClass,
        httpStatus: classification.httpStatus,
      });
      if (shouldWriteBaneseReceivableError(classification.errorClass)) {
        let errorUpdate = admin
          .from("contas_receber")
          .update({
            gateway_last_error: classification.publicMessage,
            gateway_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", receivableId)
          .eq("gateway_provider", "banese_card");
        // Nunca marque outro estado com erro pós-baixa nem apague o prefixo
        // recuperável de um título que já esteja PAGO.
        errorUpdate = guardBaneseErrorStatusUpdate(
          errorUpdate,
          classification.errorClass,
        );
        const { error: updateError } = await errorUpdate;
        if (updateError) {
          auditFailure = true;
          halted = true;
        }
      }
      // Falha técnica continua sendo uma tentativa auditável da execução,
      // mas não transforma o recebível em revisão financeira.
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
      if (attemptError) {
        auditFailure = true;
        halted = true;
      }
      return;
    } finally {
      clearTimeout(timeout);
    }
  };

  const worker = async () => {
    while (!halted && Date.now() < pacing.launchDeadline) {
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
    incidentRecovery,
  });
});
