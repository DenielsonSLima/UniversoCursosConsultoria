import type { BaneseCreationEvidence } from "../banese/core/adapter/creation-evidence.ts";
import { type Admin, record, rpc } from "./contract.ts";

interface Timing {
  now: () => number;
  wait: (milliseconds: number) => Promise<void>;
}
const timing: Timing = {
  now: () => globalThis.performance.now(),
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};
const retryable = (error: unknown) => {
  const item = record(error), code = String(item.code || ""), status = Number(item.status);
  if (["40001", "42501", "55000", "PGRST301", "PGRST302", "401", "403"].includes(code)
    || [401, 403].includes(status)) return false;
  return ["55P03", "57014", "PGRST003"].includes(code)
    || status === 429 || status >= 500 && status <= 599
    || /network|fetch failed|failed to fetch|timeout|timed out|abort|TRANSPORT|\((429|5\d\d)\)/i.test(String(item.message || ""));
};
async function bounded<T>(work: Promise<T>, remaining: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("TRANSPORT: evidence persistence deadline")), remaining);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

/** Retry only immutable local evidence; this helper never invokes the bank. */
export async function preserveServiceCreationEvidence(admin: Admin, jobId: string, apiAttemptToken: unknown,
  evidence: BaneseCreationEvidence, clock: Timing = timing) {
  const deadline = clock.now() + 15_000;
  const args = { p_job_id: jobId, p_api_attempt_token: apiAttemptToken, p_evidence: globalThis.structuredClone(evidence) };
  let attempt = 0, lastError: unknown;
  for (;;) {
    const remaining = deadline - clock.now();
    if (remaining <= 0) throw lastError ?? new Error("TRANSPORT: evidence persistence deadline");
    try {
      return await bounded(rpc(admin, "preserve_nfse_service_bolepix_creation_internal", args), remaining);
    } catch (error) {
      lastError = error;
      if (!retryable(error) || clock.now() >= deadline) throw error;
      await clock.wait(Math.min(250 * 2 ** Math.min(attempt++, 2), deadline - clock.now()));
      if (clock.now() >= deadline) throw error;
    }
  }
}
