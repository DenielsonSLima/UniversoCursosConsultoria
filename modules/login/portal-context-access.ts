import type { User } from '@supabase/supabase-js';
import type { PortalRole } from './portal-context.contract';
import type { PortalAuthProfile } from './portal-session';

export const PORTAL_ACCESS_TIMEOUT_MS = 8_000;

export type PortalAccessRole = Extract<
  PortalRole,
  'Responsavel' | 'Coordenador' | 'Professor'
>;

interface PortalAuthUserResult {
  data: { user: User | null };
  error: unknown | null;
}

export type PortalAccessResolution =
  | { status: 'authorized'; profile: PortalAuthProfile }
  | { status: 'unauthorized' }
  | { status: 'transient-error'; error: unknown }
  | { status: 'cancelled' };

interface ResolvePortalAccessOptions {
  role: PortalAccessRole;
  getUser: () => PromiseLike<PortalAuthUserResult>;
  getProfile: (user: User) => PromiseLike<PortalAuthProfile | null>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

class PortalAccessTimeoutError extends Error {
  readonly code = 'PORTAL_ACCESS_TIMEOUT';

  constructor() {
    super('O serviço de acesso não respondeu dentro do prazo esperado.');
    this.name = 'PortalAccessTimeoutError';
  }
}

class PortalAccessCancelledError extends Error {
  constructor() {
    super('A conferência de acesso foi cancelada.');
    this.name = 'PortalAccessCancelledError';
  }
}

const withPortalAccessTimeout = <T,>(
  request: () => PromiseLike<T>,
  timeoutMs: number,
  signal?: AbortSignal,
) => new Promise<T>((resolve, reject) => {
  let settled = false;
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  const cleanup = () => {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', cancel);
  };
  const finish = (callback: (value: T | unknown) => void, value: T | unknown) => {
    if (settled) return;
    settled = true;
    cleanup();
    callback(value);
  };
  const cancel = () => finish(reject, new PortalAccessCancelledError());

  if (signal?.aborted) {
    cancel();
    return;
  }

  signal?.addEventListener('abort', cancel, { once: true });
  timeoutId = globalThis.setTimeout(
    () => finish(reject, new PortalAccessTimeoutError()),
    timeoutMs,
  );

  try {
    Promise.resolve(request()).then(
      (value) => finish(resolve as (value: T | unknown) => void, value),
      (error) => finish(reject, error),
    );
  } catch (error) {
    finish(reject, error);
  }
});

export const isDefinitivePortalAuthFailure = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const source = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof source.code === 'string' ? source.code.toLowerCase() : '';
  const message = typeof source.message === 'string' ? source.message.toLowerCase() : '';
  const status = typeof source.status === 'number'
    ? source.status
    : Number.parseInt(String(source.status || ''), 10);

  return status === 401
    || status === 403
    || [
      'session_not_found',
      'refresh_token_not_found',
      'bad_jwt',
      'invalid_jwt',
      'user_not_found',
      'pgrst301',
      '42501',
    ].includes(code)
    || message.includes('auth session missing')
    || message.includes('refresh token not found')
    || message.includes('invalid jwt')
    || message.includes('jwt expired')
    || message.includes('token is expired')
    || message.includes('autenticacao_obrigatoria');
};

/**
 * Confere identidade e perfil somente nos serviços autoritativos. Falhas de
 * transporte permanecem fechadas para a UI, mas não destroem a sessão local.
 */
export const resolvePortalContextAccess = async ({
  role,
  getUser,
  getProfile,
  signal,
  timeoutMs = PORTAL_ACCESS_TIMEOUT_MS,
}: ResolvePortalAccessOptions): Promise<PortalAccessResolution> => {
  try {
    const authResult = await withPortalAccessTimeout(getUser, timeoutMs, signal);
    if (signal?.aborted) return { status: 'cancelled' };
    if (authResult.error) throw authResult.error;
    if (!authResult.data.user) return { status: 'unauthorized' };

    const profile = await withPortalAccessTimeout(
      () => getProfile(authResult.data.user as User),
      timeoutMs,
      signal,
    );
    if (signal?.aborted) return { status: 'cancelled' };
    if (!profile || profile.tipo !== role || !profile.contextId) {
      return { status: 'unauthorized' };
    }

    return { status: 'authorized', profile };
  } catch (error) {
    if (signal?.aborted || error instanceof PortalAccessCancelledError) {
      return { status: 'cancelled' };
    }
    if (isDefinitivePortalAuthFailure(error)) {
      return { status: 'unauthorized' };
    }
    return { status: 'transient-error', error };
  }
};
