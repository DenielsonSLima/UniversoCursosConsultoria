import { cancelBaneseBoleto } from "../banese/core/adapter.ts";
import {
  BaneseCancellationRequiresReviewError,
  type Environment,
} from "../banese/core/adapter/types.ts";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const MAX_BODY_BYTES = 1_024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CancelResult = {
  situationCode: number;
  remoteStatus: string;
  alreadyCanceled: boolean;
};

type AdminClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type CancelBoleto = (
  admin: AdminClient,
  environment: Environment,
  input: {
    convenio: unknown;
    nossoNumero: unknown;
    onMutationStart?: () => void;
  },
) => Promise<CancelResult>;

type CancellationJob = {
  jobId: string;
  leaseToken: string;
  receivableId: string;
  environment: Environment;
  convenio: string;
  nossoNumero: string;
};

export type CancellationBatchSummary = {
  claimed: number;
  completed: number;
  alreadyCanceled: number;
  reviewRequired: number;
  failed: number;
  auditFailures: number;
};

type HandlerDependencies = {
  createAdmin: (url: string, serviceRoleKey: string) => AdminClient;
  getEnv?: (name: string) => string | undefined;
  cancelBoleto?: CancelBoleto;
  logger?: { error: (...data: unknown[]) => void };
};

type FailureDecision = {
  errorClass: string;
  message: string;
  reviewRequired: boolean;
};

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

const readSmallBody = async (req: Request) => {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new globalThis.TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("INVALID_BODY");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
};

const readLimit = async (req: Request) => {
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("INVALID_BODY");
  }
  const text = await readSmallBody(req);
  if (!text.trim()) return DEFAULT_LIMIT;

  const body = JSON.parse(text);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("INVALID_BODY");
  }
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "limit")) throw new Error("INVALID_BODY");
  if (!("limit" in body)) return DEFAULT_LIMIT;
  const limit = (body as Record<string, unknown>).limit;
  if (
    typeof limit !== "number" || !Number.isInteger(limit) ||
    limit < 1 || limit > MAX_LIMIT
  ) {
    throw new Error("INVALID_BODY");
  }
  return limit;
};

const requiredString = (
  item: Record<string, unknown>,
  snakeCase: string,
  camelCase: string,
) => String(item[snakeCase] ?? item[camelCase] ?? "").trim();

const normalizeJob = (value: unknown): CancellationJob => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_CLAIM_CONTRACT");
  }
  const item = value as Record<string, unknown>;
  const jobId = requiredString(item, "job_id", "jobId");
  const leaseToken = requiredString(item, "lease_token", "leaseToken");
  const receivableId = requiredString(item, "receivable_id", "receivableId");
  const environment = requiredString(
    item,
    "environment",
    "environment",
  ) as Environment;
  const convenio = requiredString(item, "convenio", "convenio");
  const nossoNumero = requiredString(item, "nosso_numero", "nossoNumero");

  if (
    !UUID_PATTERN.test(jobId) || !UUID_PATTERN.test(leaseToken) ||
    !UUID_PATTERN.test(receivableId) ||
    !["sandbox", "production"].includes(environment) ||
    !/^\d{1,20}$/.test(convenio) || !/^\d{9}$/.test(nossoNumero)
  ) {
    throw new Error("INVALID_CLAIM_CONTRACT");
  }
  return {
    jobId,
    leaseToken,
    receivableId,
    environment,
    convenio,
    nossoNumero,
  };
};

const normalizeClaimedJobs = (data: unknown) => {
  const values = Array.isArray(data)
    ? data
    : data && typeof data === "object" &&
        Array.isArray((data as Record<string, unknown>).items)
    ? (data as Record<string, unknown>).items as unknown[]
    : null;
  if (!values) throw new Error("INVALID_CLAIM_CONTRACT");
  return values.map(normalizeJob);
};

const classifyFailure = (
  error: unknown,
  mutationStarted: boolean,
  remoteConfirmed: boolean,
): FailureDecision => {
  if (remoteConfirmed) {
    return {
      errorClass: "LOCAL_SYNC_AFTER_REMOTE",
      message:
        "O banco confirmou o cancelamento, mas a sincronização local não foi concluída.",
      reviewRequired: true,
    };
  }
  if (mutationStarted) {
    return {
      errorClass: "REMOTE_CANCELLATION_AMBIGUOUS",
      message:
        "A baixa remota pode ter sido iniciada; confirme o título antes de repetir.",
      reviewRequired: true,
    };
  }
  if (error instanceof BaneseCancellationRequiresReviewError) {
    return {
      errorClass: "REMOTE_REVIEW_REQUIRED",
      message: "O estado remoto do título exige revisão financeira.",
      reviewRequired: true,
    };
  }
  // O adapter representa REGISTERING (code 0) como erro transitório genérico.
  // Somente os demais estados não canceláveis usam o erro explícito de revisão.
  return {
    errorClass: "REMOTE_PREFLIGHT_ERROR",
    message:
      "Não foi possível confirmar com segurança o estado remoto do título.",
    reviewRequired: false,
  };
};

const hasBooleanAck = (data: unknown, field: "completed" | "failed") =>
  Boolean(
    data && typeof data === "object" && !Array.isArray(data) &&
      (data as Record<string, unknown>)[field] === true,
  );

const hasStartedAck = (data: unknown) =>
  Boolean(
    data && typeof data === "object" && !Array.isArray(data) &&
      (data as Record<string, unknown>).started === true,
  );

const failJob = async (
  admin: AdminClient,
  job: CancellationJob,
  failure: FailureDecision,
  remoteMutationStarted: boolean,
) => {
  try {
    const { data, error } = await admin.rpc("fail_banese_cancellation_job", {
      p_job_id: job.jobId,
      p_lease_token: job.leaseToken,
      p_error_class: failure.errorClass,
      p_error_message: failure.message,
      p_review_required: failure.reviewRequired,
      p_remote_mutation_started: remoteMutationStarted,
    });
    return !error && hasBooleanAck(data, "failed");
  } catch {
    return false;
  }
};

export const processBaneseCancellationBatch = async (
  admin: AdminClient,
  limit: number,
  dependencies: { cancelBoleto?: CancelBoleto } = {},
): Promise<CancellationBatchSummary> => {
  const { data, error } = await admin.rpc(
    "claim_banese_cancellation_batch",
    { p_limit: limit },
  );
  if (error) throw new Error("CLAIM_FAILED");
  const jobs = normalizeClaimedJobs(data);
  const summary: CancellationBatchSummary = {
    claimed: jobs.length,
    completed: 0,
    alreadyCanceled: 0,
    reviewRequired: 0,
    failed: 0,
    auditFailures: 0,
  };

  for (const job of jobs) {
    let mutationStarted = false;
    let remoteConfirmed = false;
    try {
      const { data: startData, error: startError } = await admin.rpc(
        "start_banese_cancellation_remote_attempt",
        {
          p_job_id: job.jobId,
          p_lease_token: job.leaseToken,
        },
      );
      if (startError || !hasStartedAck(startData)) {
        throw new Error("REMOTE_ATTEMPT_GUARD_FAILED");
      }

      const cancel = dependencies.cancelBoleto ??
        cancelBaneseBoleto as unknown as CancelBoleto;
      const canceled = await cancel(admin, job.environment, {
        convenio: job.convenio,
        nossoNumero: job.nossoNumero,
        onMutationStart: () => {
          mutationStarted = true;
        },
      });
      remoteConfirmed = canceled.situationCode === 5;
      if (!remoteConfirmed || canceled.remoteStatus !== "CANCELED") {
        throw new Error("REMOTE_CONFIRMATION_INVALID");
      }

      const { data: completionData, error: completionError } = await admin.rpc(
        "complete_banese_cancellation_job",
        {
          p_job_id: job.jobId,
          p_lease_token: job.leaseToken,
          p_remote_status: "CANCELED",
          p_already_canceled: canceled.alreadyCanceled,
        },
      );
      if (
        completionError || !hasBooleanAck(completionData, "completed")
      ) {
        throw new Error("LOCAL_COMPLETION_FAILED");
      }
      summary.completed += 1;
      if (canceled.alreadyCanceled) summary.alreadyCanceled += 1;
    } catch (processingError) {
      const failure = classifyFailure(
        processingError,
        mutationStarted,
        remoteConfirmed,
      );
      if (failure.reviewRequired) summary.reviewRequired += 1;
      else summary.failed += 1;
      if (!await failJob(admin, job, failure, mutationStarted)) {
        summary.auditFailures += 1;
      }
    }
  }
  return summary;
};

export const createBaneseCancellationWorkerHandler = (
  dependencies: HandlerDependencies,
) =>
async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const getEnv = dependencies.getEnv ?? ((name: string) => Deno.env.get(name));
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    dependencies.logger?.error("banese cancellation worker unavailable", {
      errorClass: "ENVIRONMENT_ERROR",
    });
    return json({ error: "Configuração indisponível." }, 500);
  }

  const admin = dependencies.createAdmin(supabaseUrl, serviceRoleKey);
  const { data: configuredSecret, error: secretError } = await admin.rpc(
    "get_banese_reconciliation_worker_secret",
  );
  const expectedSecret = String(configuredSecret ?? "").trim();
  const requestSecret = String(
    req.headers.get("X-Banese-Worker-Token") ?? "",
  ).trim();
  if (secretError || expectedSecret.length < 32) {
    dependencies.logger?.error("banese cancellation worker secret unavailable", {
      errorClass: "SECRET_UNAVAILABLE",
    });
    return json({ error: "Configuração indisponível." }, 503);
  }
  if (!safeEqual(requestSecret, expectedSecret)) {
    return json({ error: "Não autorizado." }, 401);
  }

  let limit: number;
  try {
    limit = await readLimit(req);
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }

  try {
    const summary = await processBaneseCancellationBatch(admin, limit, {
      cancelBoleto: dependencies.cancelBoleto,
    });
    if (summary.auditFailures > 0) {
      dependencies.logger?.error("banese cancellation audit failed", {
        errorClass: "AUDIT_WRITE_ERROR",
      });
      return json({
        success: false,
        error: "O lote terminou, mas a auditoria não foi confirmada.",
        ...summary,
      }, 500);
    }
    return json({ success: true, ...summary });
  } catch {
    dependencies.logger?.error("banese cancellation worker failed", {
      errorClass: "WORKER_ERROR",
    });
    return json({ error: "Não foi possível processar o lote." }, 500);
  }
};
