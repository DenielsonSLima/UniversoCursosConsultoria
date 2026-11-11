import type { CancellationRow } from "./handler.ts";
/** Server-only proof from the specific GET. The browser cannot supply this payload. */
export async function cancellationRetryProof(row: CancellationRow, result: Record<string, unknown>, retryRequestId: string) {
  const diagnostics = result.diagnostics as Record<string, unknown> | undefined;
  const consult = diagnostics?.consult as Record<string, unknown> | undefined;
  if (!row.signedEventXml || result.state !== "CANCELLATION_PENDING" || result.code !== "REGISTERED_EVENT_NOT_FOUND" ||
    diagnostics?.execution !== "RECONCILE_CANCEL" || diagnostics.postAttemptedInThisExecution !== false ||
    consult?.httpStatus !== 404 || consult.phase !== "RECONCILE") return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new globalThis.TextEncoder().encode(row.signedEventXml));
  return { retryRequestId, checkedAt: new Date().toISOString(), httpStatus: 404, probeCode: "REGISTERED_EVENT_NOT_FOUND",
    signedEventSha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("") };
}
