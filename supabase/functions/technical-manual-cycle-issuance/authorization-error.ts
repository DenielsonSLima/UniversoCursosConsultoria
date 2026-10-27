const authorizationMessages = {
  CYCLE_AUTHORIZATION_FINGERPRINT_MISMATCH:
    "Os dados da cobrança diferem da autorização original. A emissão foi preservada e exige revisão antes de retomar.",
  CYCLE_AUTHORIZATION_CONTEXT_MISMATCH:
    "A autorização não corresponde à mesma operação do ciclo. A emissão foi preservada e exige revisão.",
} as const;

export const manualCycleAuthorizationDiagnostic = (error: unknown) => {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  if (record.code !== "PT422" || typeof record.details !== "string") return null;
  const code = record.details.trim();
  if (code !== "CYCLE_AUTHORIZATION_FINGERPRINT_MISMATCH"
    && code !== "CYCLE_AUTHORIZATION_CONTEXT_MISMATCH") return null;
  return { code, message: authorizationMessages[code] };
};
