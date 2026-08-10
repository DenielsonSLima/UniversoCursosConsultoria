type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

const asErrorLike = (error: unknown): ErrorLike | null => (
  error !== null && typeof error === 'object' ? error as ErrorLike : null
);

export const getPatrimonioErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  const errorLike = asErrorLike(error);
  return typeof errorLike?.message === 'string' && errorLike.message.trim()
    ? errorLike.message
    : fallback;
};

export const isPatrimonioConflictError = (error: unknown) => {
  const errorLike = asErrorLike(error);
  const code = String(errorLike?.code ?? '');
  if (code === '40001') return true;

  const message = getPatrimonioErrorMessage(error, '').toLocaleLowerCase('pt-BR');
  return [
    'conflit',
    'concorr',
    'alterado por outro usuário',
    'atualizado por outro',
    'expected_updated_at',
    'stale',
  ].some((fragment) => message.includes(fragment));
};
