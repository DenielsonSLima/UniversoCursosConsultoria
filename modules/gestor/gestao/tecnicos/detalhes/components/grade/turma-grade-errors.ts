export const resolveErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return 'Não foi possível concluir a operação.';

  const normalized = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
    error_description?: string;
  };

  if (normalized.message) {
    return normalized.code ? `[${normalized.code}] ${normalized.message}` : normalized.message;
  }
  if (normalized.error_description) return normalized.error_description;
  if (normalized.details) return normalized.details;
  if (normalized.hint) return normalized.hint;

  return 'Não foi possível concluir a operação.';
};

export const isPermissionError = (message: string) => message.includes('Sem permissão')
  || message.includes('permission');

export const isExcessHoursMessage = (message: string) => message.includes('Carga horaria excedida')
  || message.includes('carga horária');

