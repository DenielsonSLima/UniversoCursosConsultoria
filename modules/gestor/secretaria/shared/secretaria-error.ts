type ErrorLike = {
  code?: unknown;
  details?: unknown;
  message?: unknown;
  status?: unknown;
};

const textValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const isTechnicalDatabaseMessage = (message: string) => (
  /record ".+" is not assigned yet/i.test(message)
  || /column reference ".+" is ambiguous/i.test(message)
  || /violates (?:check|foreign key|not-null|unique) constraint/i.test(message)
  || /syntax error at or near/i.test(message)
  || /function .+ does not exist/i.test(message)
);

export const getSecretariaErrorMessage = (
  error: unknown,
  fallback = 'Não foi possível concluir a operação. Tente novamente.',
) => {
  const candidate = (
    error && typeof error === 'object'
      ? error as ErrorLike
      : {}
  );
  const message = error instanceof Error
    ? error.message.trim()
    : textValue(candidate.message) || textValue(error);
  const details = textValue(candidate.details);
  const code = textValue(candidate.code);
  const status = Number(candidate.status);
  const combined = `${message} ${details}`.trim();

  if (
    /failed to fetch|networkerror|network request failed|load failed|offline/i.test(combined)
  ) {
    return 'Não foi possível comunicar com o servidor. Confira sua conexão e tente novamente.';
  }

  if (
    status === 401
    || status === 403
    || code === '42501'
    || code === 'PGRST301'
  ) {
    return 'Sua sessão não possui acesso a esta operação. Entre novamente ou confira suas permissões.';
  }

  if (
    status >= 500
    || isTechnicalDatabaseMessage(combined)
  ) {
    return 'O servidor não conseguiu processar esta operação. Tente novamente; se persistir, informe o suporte.';
  }

  return message || fallback;
};
