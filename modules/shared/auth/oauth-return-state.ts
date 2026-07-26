export type PortalOAuthFlow = 'aluno' | 'institucional';

type PendingOAuthReturn = {
  version: 1;
  startedAt: number;
  redirectPath: string | null;
};

const OAUTH_RETURN_MAX_AGE_MS = 10 * 60 * 1000;
const storageKey = (flow: PortalOAuthFlow) => `portal_oauth_return:${flow}:v1`;
const AUTH_RETURN_PARAM_KEYS = [
  'access_token',
  'refresh_token',
  'expires_at',
  'expires_in',
  'token_type',
  'provider_token',
  'provider_refresh_token',
  'code',
  'error',
  'error_code',
  'error_description',
] as const;

const readAuthReturnParams = () => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);

  return { hashParams, searchParams };
};

export const getOAuthReturnError = () => {
  const { hashParams, searchParams } = readAuthReturnParams();
  return (
    hashParams.get('error_description') ||
    searchParams.get('error_description') ||
    hashParams.get('error_code') ||
    searchParams.get('error_code') ||
    hashParams.get('error') ||
    searchParams.get('error')
  );
};

export const hasOAuthReturnInUrl = () => {
  const { hashParams, searchParams } = readAuthReturnParams();
  return (
    hashParams.has('access_token') ||
    searchParams.has('code') ||
    Boolean(getOAuthReturnError())
  );
};

export const clearOAuthReturnParams = () => {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const hasAuthHash = AUTH_RETURN_PARAM_KEYS.some((key) => hashParams.has(key));

  AUTH_RETURN_PARAM_KEYS.forEach((key) => url.searchParams.delete(key));

  if (hasAuthHash) {
    AUTH_RETURN_PARAM_KEYS.forEach((key) => hashParams.delete(key));
    const remainingHash = hashParams.toString();
    url.hash = remainingHash ? `#${remainingHash}` : '';
  }

  window.history.replaceState(
    window.history.state,
    document.title,
    `${url.pathname}${url.search}${url.hash}`,
  );
};

export const rememberPendingOAuthReturn = (
  flow: PortalOAuthFlow,
  redirectPath: string | null = null,
) => {
  try {
    const pendingReturn: PendingOAuthReturn = {
      version: 1,
      startedAt: Date.now(),
      redirectPath,
    };
    sessionStorage.setItem(storageKey(flow), JSON.stringify(pendingReturn));
  } catch {
    // O callback continua detectável pelos parâmetros da URL quando o storage
    // do navegador não estiver disponível.
  }
};

export const readPendingOAuthReturn = (flow: PortalOAuthFlow): PendingOAuthReturn | null => {
  try {
    const rawValue = sessionStorage.getItem(storageKey(flow));
    if (!rawValue) return null;

    const pendingReturn = JSON.parse(rawValue) as Partial<PendingOAuthReturn>;
    const isCurrentVersion = pendingReturn.version === 1;
    const pendingAge = typeof pendingReturn.startedAt === 'number'
      ? Date.now() - pendingReturn.startedAt
      : -1;
    const isRecent =
      pendingAge >= 0 &&
      pendingAge <= OAUTH_RETURN_MAX_AGE_MS;

    if (!isCurrentVersion || !isRecent) {
      sessionStorage.removeItem(storageKey(flow));
      return null;
    }

    return {
      version: 1,
      startedAt: pendingReturn.startedAt,
      redirectPath:
        typeof pendingReturn.redirectPath === 'string'
          ? pendingReturn.redirectPath
          : null,
    };
  } catch {
    return null;
  }
};

export const clearPendingOAuthReturn = (flow: PortalOAuthFlow) => {
  try {
    sessionStorage.removeItem(storageKey(flow));
  } catch {
    // Não há estado obrigatório para limpar quando o storage está indisponível.
  }
};
