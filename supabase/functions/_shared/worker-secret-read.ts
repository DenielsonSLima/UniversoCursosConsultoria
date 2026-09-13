export type WorkerSecretGetter =
  | "get_banese_reconciliation_worker_secret"
  | "get_push_notification_worker_secret";

type RpcResponse = { data: unknown; error: unknown; status?: number };
type SecretQuery = PromiseLike<RpcResponse> & {
  retry: (enabled: boolean) => SecretQuery;
  abortSignal: (signal: AbortSignal) => SecretQuery;
};
export type WorkerSecretAdmin = { rpc: (name: string) => unknown };
export type WorkerSecretMetadata = {
  stage: "WORKER_SECRET";
  attempts: number;
  status: number;
  code: string;
  durationMs: number;
};
export type WorkerSecretResult =
  | { ok: true; secret: string; metadata: WorkerSecretMetadata }
  | { ok: false; metadata: WorkerSecretMetadata };
export type WorkerSecretReadOptions = {
  minimumLength?: number;
  trimForValidation?: boolean;
  logger?: (metadata: WorkerSecretMetadata) => void;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

export type WorkerSecretRuntime<AdminFactory> = {
  createAdmin?: AdminFactory;
  getEnv?: (name: string) => string | undefined;
  readSecret?: typeof readWorkerSecret;
};
export function logWorkerSecretRead(
  worker: string,
  metadata: WorkerSecretMetadata,
  logger: { error: (...args: unknown[]) => void; info?: (...args: unknown[]) => void } = console,
) {
  if (metadata.code === "RECOVERED") logger.info?.(worker, metadata);
  else logger.error(worker, metadata);
}

const GETTERS = new Set<string>([
  "get_banese_reconciliation_worker_secret",
  "get_push_notification_worker_secret",
]);
const TOTAL_BUDGET_MS = 12_000;
const INITIAL_BUDGET_MS = 8_000;
const SAFE_CODES = new Set([
  "PGRST003", "PGRST002", "PGRST202", "PGRST301", "42501", "57014", "RPC_CONTRACT_ERROR",
]);
const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const codeFromError = (error: unknown) => {
  const code = error && typeof error === "object"
    ? String((error as Record<string, unknown>).code || "")
    : "";
  return SAFE_CODES.has(code) ? code : "RPC_ERROR";
};
const isTransportFailure = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  return value.name === "NetworkError" ||
    /fetch failed|failed to fetch|network error|network request failed|connection reset/i
      .test(String(value.message || ""));
};

async function requestWithinBudget(
  admin: WorkerSecretAdmin,
  getter: WorkerSecretGetter,
  timeoutMs: number,
): Promise<RpcResponse> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const builder = admin.rpc(getter) as SecretQuery | null;
    if (
      !builder || typeof builder.retry !== "function" ||
      typeof builder.abortSignal !== "function"
    ) return { data: null, error: { code: "RPC_CONTRACT_ERROR" }, status: 0 };
    const request = builder.retry(false).abortSignal(controller.signal);
    // O teto também encerra o await se um transporte não respeitar o abort.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new globalThis.DOMException("Worker secret deadline", "TimeoutError"));
      }, timeoutMs);
    });
    return await Promise.race([Promise.resolve(request), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function readWorkerSecret(
  admin: WorkerSecretAdmin,
  getter: WorkerSecretGetter,
  options: WorkerSecretReadOptions = {},
): Promise<WorkerSecretResult> {
  const now = options.now ?? (() => globalThis.performance.now());
  const startedAt = now();
  const elapsed = () => Math.max(0, now() - startedAt);
  const metadata = (attempts: number, status: number, code: string): WorkerSecretMetadata => ({
    stage: "WORKER_SECRET", attempts, status, code,
    durationMs: Math.round(elapsed()),
  });
  const log = (value: WorkerSecretMetadata) => {
    try { options.logger?.(value); } catch { /* Telemetria não altera a guarda. */ }
  };
  if (!GETTERS.has(getter)) {
    const result = metadata(0, 0, "GETTER_NOT_ALLOWED");
    log(result);
    return { ok: false, metadata: result };
  }

  let last = metadata(0, 0, "DEADLINE_EXCEEDED");
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const remaining = TOTAL_BUDGET_MS - elapsed();
    if (remaining <= 0) break;
    let retryable: boolean;
    try {
      const response = await requestWithinBudget(
        admin, getter,
        attempt === 1 ? Math.min(INITIAL_BUDGET_MS, remaining) : remaining,
      );
      const status = Number.isInteger(response.status) && response.status! >= 0 && response.status! <= 599
        ? response.status! : response.error ? 0 : 200;
      if (elapsed() >= TOTAL_BUDGET_MS) {
        last = metadata(attempt, status, "DEADLINE_EXCEEDED");
        log(last);
        return { ok: false, metadata: last };
      }
      if (!response.error && status >= 200 && status < 300) {
        const checkedSecret = typeof response.data === "string"
          ? options.trimForValidation ? response.data.trim() : response.data
          : "";
        if (checkedSecret.length < (options.minimumLength ?? 1)) {
          last = metadata(attempt, status, "INVALID_SECRET");
          log(last);
          return { ok: false, metadata: last };
        }
        const result = metadata(attempt, status, attempt > 1 ? "RECOVERED" : "OK");
        if (attempt > 1) log(result);
        return { ok: true, secret: response.data as string, metadata: result };
      }
      const code = codeFromError(response.error);
      last = metadata(attempt, status, code);
      const terminalHttp = status >= 400 && status < 500;
      retryable = !terminalHttp && (
        [502, 503, 504].includes(status) || code === "PGRST003" ||
        (status === 0 && isTransportFailure(response.error))
      );
    } catch (error) {
      const timeout = error instanceof globalThis.DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      retryable = timeout || isTransportFailure(error);
      last = metadata(attempt, 0, timeout ? "TIMEOUT" : retryable ? "TRANSPORT_ERROR" : "RPC_ERROR");
    }
    log(last);
    if (!retryable || attempt === 2) return { ok: false, metadata: last };
    const random = Math.max(0, Math.min(1, (options.random ?? Math.random)()));
    const jitter = 250 + Math.floor(random * 500);
    if (TOTAL_BUDGET_MS - elapsed() <= jitter) break;
    await (options.sleep ?? sleep)(jitter);
  }
  const result = metadata(last.attempts, last.status, "DEADLINE_EXCEEDED");
  log(result);
  return { ok: false, metadata: result };
}
