const SAFE_ERROR_CODE = /^[A-Z0-9_.-]{1,64}$/i;

/**
 * Registra somente metadados operacionais controlados. `message`, payloads,
 * e-mails, URLs, SQL e tokens nunca entram no log deste helper.
 */
export const logPortalHandlerFailure = (
  action: string,
  phase: string,
  error: unknown,
) => {
  const source = error && typeof error === "object"
    ? error as Record<string, unknown>
    : null;
  const rawCode = source?.code;
  const errorCode = typeof rawCode === "string" && SAFE_ERROR_CODE.test(rawCode)
    ? rawCode
    : null;
  console.error("portal-user-management internal failure", {
    action,
    phase,
    kind: error instanceof Error ? "error" : typeof error,
    ...(errorCode ? { errorCode } : {}),
  });
};
