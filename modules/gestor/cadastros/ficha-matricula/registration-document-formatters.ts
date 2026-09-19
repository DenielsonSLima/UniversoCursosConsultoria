const text = (value: unknown) => String(value ?? '').trim();

/** Preserve legacy digits; presentation must not complete or validate voter IDs. */
export const formatRegistrationVoterId = (value: unknown): string => {
  const raw = text(value);
  if (!/^[\d\s.-]+$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11 && digits.length !== 12) return raw;
  return `${digits.slice(0, -8)} ${digits.slice(-8, -4)} ${digits.slice(-4)}`;
};

export const formatRegistrationIssuerState = (issuer: unknown, state: unknown): string => {
  const normalizedIssuer = text(issuer).replace(/\s*\/+\s*$/, '').trim();
  const normalizedState = text(state).replace(/^\/+|\/+$/g, '').trim();
  if (!normalizedIssuer) return normalizedState;
  if (!normalizedState) return normalizedIssuer;
  const existingState = normalizedIssuer.split('/').at(-1)?.trim().toUpperCase();
  return existingState === normalizedState.toUpperCase()
    ? normalizedIssuer
    : `${normalizedIssuer} / ${normalizedState}`;
};

export const formatRegistrationReservist = (value: unknown, sex: unknown): string => (
  ['F', 'FEMININO'].includes(text(sex).toUpperCase()) ? 'NÃO POSSUI' : text(value)
);

export const replaceRegistrationIssuerState = (
  template: string,
  issuerState: string,
): string => template.replace(
  /{{ALUNO_RG_ORGAO}}\s*\/\s*{{ALUNO_RG_UF}}/g,
  () => issuerState,
);
