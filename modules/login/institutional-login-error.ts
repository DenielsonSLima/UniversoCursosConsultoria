export const PORTAL_ACCESS_ERROR_MESSAGE =
  'Não foi possível carregar seus perfis de acesso. Tente novamente em instantes.';

const isPortalContextServiceError = (error: unknown): error is Error => (
  error instanceof Error && error.name === 'PortalContextServiceError'
);

export const getPortalAccessErrorMessage = (
  error: unknown,
  fallbackMessage: string,
) => {
  if (isPortalContextServiceError(error)) {
    return PORTAL_ACCESS_ERROR_MESSAGE;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
};

export const getPortalAccessErrorLog = (error: unknown) => {
  if (!(error instanceof Error)) {
    return { name: 'UnknownError' } as const;
  }

  const candidateCode = (error as Error & { code?: unknown }).code;
  const code = typeof candidateCode === 'string'
    && /^[A-Z0-9_-]{1,32}$/iu.test(candidateCode)
    ? candidateCode
    : undefined;

  return code
    ? { name: error.name || 'Error', code }
    : { name: error.name || 'Error' };
};
