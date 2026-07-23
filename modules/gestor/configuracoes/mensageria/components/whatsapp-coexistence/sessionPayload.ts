export const parseSessionPayload = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }

  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
};

export const isTrustedFacebookOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (
      url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com')
    );
  } catch {
    return false;
  }
};

export const embeddedSignupErrorMessage = (payload: Record<string, unknown>) => {
  const data = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : {};
  const errorMessage = typeof data.error_message === 'string' ? data.error_message.trim() : '';
  const errorCode = typeof data.error_code === 'string'
    ? data.error_code.trim()
    : typeof data.error_id === 'string'
      ? data.error_id.trim()
      : '';
  const currentStep = typeof data.current_step === 'string' ? data.current_step.trim() : '';

  if (errorMessage) {
    return `${errorMessage}${errorCode ? ` (codigo ${errorCode})` : ''}`;
  }
  if (currentStep) return `Fluxo encerrado antes da conclusao na etapa ${currentStep}.`;
  return 'Fluxo de coexistencia cancelado antes da conclusao.';
};
