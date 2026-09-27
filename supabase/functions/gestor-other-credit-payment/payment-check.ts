import { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import { classifyBaneseReconciliationError } from "../banese-reconciliation-worker/error-classification.ts";
import type { Environment } from "../banese/core/adapter.ts";
import {
  parseOtherCreditRequest,
  PaymentReadError,
  readOtherCreditPayment,
} from "./payment-reader.ts";
import { createPdvBankQuery } from "./payment-check-query.ts";

type PaymentDto = Awaited<ReturnType<typeof readOtherCreditPayment>>;
type Confirmation = {
  status: "CHECKED" | "WAITING" | "STOPPED";
  reason:
    | "PAID"
    | "PENDING"
    | "INTERVAL"
    | "BUSY"
    | "BUDGET"
    | "COOLDOWN"
    | "PAUSED"
    | "SUSPENDED"
    | "INELIGIBLE"
    | "ERROR";
  checkedAt: string | null;
  nextCheckAt: string | null;
  retryAfterMs: number | null;
};
type Dependencies = {
  read?: typeof readOtherCreditPayment;
  reconcile?: typeof reconcileBaneseReceivable;
  query?: typeof createPdvBankQuery;
  now?: () => number;
};
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const waitingReasons = new Set(["INTERVAL", "BUSY", "BUDGET", "COOLDOWN"]);

export const parseOtherCreditAction = (value: unknown) => {
  const body = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const action = body.action;
  if (action !== "get" && action !== "check") {
    throw new PaymentReadError(400, "Consulta de cobrança inválida.");
  }
  return {
    action,
    receivableId: parseOtherCreditRequest({ ...body, action: "get" }),
  };
};

const date = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
const stopped = (dto: PaymentDto, checkedAt: string | null): Confirmation => ({
  status: "STOPPED",
  reason: dto.payment.status === "PAGO" ? "PAID" : "INELIGIBLE",
  checkedAt,
  nextCheckAt: null,
  retryAfterMs: null,
});
const canCheck = (dto: PaymentDto) =>
  dto.canRefresh && !dto.needsReview &&
  ["PENDENTE", "VENCIDO", "AGUARDANDO_CONFIRMACAO"].includes(
    dto.payment.status,
  );

export const checkOtherCreditPayment = async (
  req: Request,
  admin: any,
  receivableId: string,
  dependencies: Dependencies = {},
): Promise<PaymentDto & { confirmation: Confirmation }> => {
  const read = dependencies.read ?? readOtherCreditPayment;
  const now = dependencies.now ?? Date.now;
  // JWT/profile/tab/polo, financial role and standalone scope precede every claim.
  const initial = await read(req, admin, receivableId);
  if (!canCheck(initial)) {
    return { ...initial, confirmation: stopped(initial, null) };
  }
  const { data: claim, error } = await admin.rpc(
    "claim_banese_pdv_confirmation",
    {
      p_receivable_id: receivableId,
    },
  );
  if (error || !claim || typeof claim.enabled !== "boolean") {
    throw new PaymentReadError(503, "Não foi possível iniciar a confirmação.");
  }
  if (!claim.enabled) {
    const reason = String(claim.reason);
    const waiting = waitingReasons.has(reason);
    const retryAfterMs = waiting
      ? Math.max(
        1000,
        Math.min(3_600_000, Number(claim.retryAfterMs) || 15_000),
      )
      : null;
    return {
      ...initial,
      confirmation: {
        status: waiting ? "WAITING" : "STOPPED",
        reason: (waiting || ["PAUSED", "SUSPENDED"].includes(reason)
          ? reason
          : "INELIGIBLE") as Confirmation["reason"],
        checkedAt: date(claim.checkedAt),
        nextCheckAt: retryAfterMs === null ? null : date(claim.nextCheckAt) ??
          new Date(now() + retryAfterMs).toISOString(),
        retryAfterMs,
      },
    };
  }
  if (
    !UUID_RE.test(String(claim.runId)) ||
    !["production", "sandbox"].includes(claim.environment) ||
    claim.environment !== initial.payment.gateway_environment
  ) {
    throw new PaymentReadError(503, "Reserva de confirmação inválida.");
  }
  const startedAt = now();
  const metrics = { requests: 0, reused: false };
  const controller = new AbortController();
  const timer = setTimeout(() =>
    controller.abort(
      new globalThis.DOMException("Banese query timeout", "TimeoutError"),
    ), 8_000);
  let outcome: "PAID" | "PENDING" | "ERROR" | "THROTTLED";
  let remoteStatus: string | null = null;
  let errorClass: string | null = null;
  let httpStatus: number | null = null;
  let auditFailed = false;
  try {
    const query = (dependencies.query ?? createPdvBankQuery)(
      admin,
      claim.environment as Environment,
      Math.max(
        30,
        Math.min(300, Number(claim.oauthRefreshMarginSeconds) || 60),
      ),
      controller.signal,
      metrics,
    );
    const result = await (dependencies.reconcile ?? reconcileBaneseReceivable)(
      admin,
      receivableId,
      {
        queryBoleto: query,
        // This endpoint can only query an existing title. Even concurrent drift
        // into a repair marker cannot reach the bank's PUT repair operation.
        repairDiscountRemoval: async () => {
          throw new Error("Correção bancária bloqueada na consulta PDV.");
        },
      },
    );
    outcome = result.paid ? "PAID" : "PENDING";
    remoteStatus = result.remoteStatus || null;
  } catch (failure) {
    const classification = classifyBaneseReconciliationError(failure);
    outcome = classification.result;
    errorClass = classification.errorClass;
    httpStatus = classification.httpStatus;
  } finally {
    clearTimeout(timer);
  }
  // Neither the browser's signal nor the eight-second bank deadline may abandon
  // financial persistence or its audit. A late confirmed settlement stays paid.
  const attempt = await admin.rpc("record_banese_reconciliation_attempt", {
    p_run_id: claim.runId,
    p_receivable_id: receivableId,
    p_result: outcome,
    p_remote_status: remoteStatus,
    p_error_class: errorClass,
    p_http_status: httpStatus,
    p_duration_ms: Math.max(0, now() - startedAt),
  });
  auditFailed ||= Boolean(attempt.error);
  const finish = await admin.rpc("finish_banese_reconciliation_run", {
    p_run_id: claim.runId,
    p_oauth_requests: metrics.requests,
    p_oauth_reused: metrics.reused,
    p_duration_ms: Math.max(0, now() - startedAt),
  });
  auditFailed ||= Boolean(finish.error);
  const current = await read(req, admin, receivableId);
  const checkedAt = new Date(now()).toISOString();
  if (!canCheck(current)) {
    return { ...current, confirmation: stopped(current, checkedAt) };
  }
  const successful = !auditFailed &&
    (outcome === "PENDING" || outcome === "PAID");
  const retryAfterMs = successful
    ? 15_000
    : outcome === "THROTTLED"
    ? 3_600_000
    : 900_000;
  return {
    ...current,
    confirmation: {
      status: successful ? "CHECKED" : "WAITING",
      reason: successful ? "PENDING" : "ERROR",
      checkedAt,
      nextCheckAt: new Date(now() + retryAfterMs).toISOString(),
      retryAfterMs,
    },
  };
};
