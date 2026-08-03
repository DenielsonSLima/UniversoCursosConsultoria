export type NativeTurnstileAction = 'login' | 'recover' | 'signup' | 'support';

export const NATIVE_TURNSTILE_ROUTE = '/native-auth/turnstile';
export const NATIVE_TURNSTILE_MESSAGE_TYPE = 'universo:native-turnstile:v1';

export const NATIVE_APP_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost',
]);

export type NativeTurnstileMessage = {
  type: typeof NATIVE_TURNSTILE_MESSAGE_TYPE;
  nonce: string;
  action: NativeTurnstileAction;
  status: 'verified' | 'expired' | 'error' | 'unsupported';
  token?: string;
  errorCode?: string;
};

const ACTIONS = new Set<NativeTurnstileAction>([
  'login',
  'recover',
  'signup',
  'support',
]);

export const isNativeTurnstileAction = (value: unknown): value is NativeTurnstileAction => (
  typeof value === 'string' && ACTIONS.has(value as NativeTurnstileAction)
);

export const isValidNativeTurnstileNonce = (value: unknown): value is string => (
  typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value)
);

export const isNativeTurnstileMessage = (value: unknown): value is NativeTurnstileMessage => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NativeTurnstileMessage>;
  if (
    candidate.type !== NATIVE_TURNSTILE_MESSAGE_TYPE
    || !isValidNativeTurnstileNonce(candidate.nonce)
    || !isNativeTurnstileAction(candidate.action)
    || !['verified', 'expired', 'error', 'unsupported'].includes(String(candidate.status))
  ) return false;

  if (candidate.status === 'verified') {
    return typeof candidate.token === 'string'
      && candidate.token.length > 0
      && candidate.token.length <= 2048;
  }

  return candidate.token === undefined;
};

export const createNativeTurnstileNonce = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const getNativeTurnstileChallengeOrigin = () => {
  const configuredUrl = String(
    import.meta.env.VITE_NATIVE_TURNSTILE_URL
      || `${import.meta.env.VITE_PUBLIC_SITE_URL || 'https://universocc.com.br'}${NATIVE_TURNSTILE_ROUTE}`,
  ).trim();

  try {
    const parsed = new URL(configuredUrl);
    return parsed.protocol === 'https:' ? parsed.origin : '';
  } catch {
    return '';
  }
};
