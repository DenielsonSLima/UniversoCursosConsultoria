import { classifyBaneseReconciliationError } from "../banese-reconciliation-worker/error-classification.ts";

const RETRYABLE_RECONCILIATION_ERRORS = new Set([
  "RATE_LIMIT",
  "UPSTREAM_5XX",
  "TIMEOUT",
  "NETWORK",
]);

export const manualCycleRecoveryFailure = (error: unknown) => {
  const classification = classifyBaneseReconciliationError(error);
  return {
    retryable: RETRYABLE_RECONCILIATION_ERRORS.has(
      classification.errorClass,
    ),
    diagnosticCode: classification.diagnosticCode,
  };
};

export const skipManualCycleFailureMutation = (error: unknown) =>
  Boolean(
    error && typeof error === "object" &&
      (error as Record<string, unknown>).skipFailureMutation === true,
  );

export const reconciliationClaimError = (
  message: string,
  code: "COOLDOWN" | "MAX_AGE",
) => Object.assign(new Error(message), { code, skipFailureMutation: true });
