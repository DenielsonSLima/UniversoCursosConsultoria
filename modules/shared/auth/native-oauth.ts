import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { supabase } from '../../../lib/supabase';
import type { PortalOAuthFlow } from './oauth-return-state';

export const NATIVE_OAUTH_CALLBACK_URL = 'br.com.universocc.aluno://auth/callback';
export const NATIVE_OAUTH_STARTED_EVENT = 'universo:native-oauth-started';
export const NATIVE_OAUTH_BROWSER_FINISHED_EVENT = 'universo:native-oauth-browser-finished';

const NATIVE_OAUTH_PENDING_KEY = 'universo.native-oauth.pending.v1';
const NATIVE_OAUTH_MAX_AGE_MS = 10 * 60 * 1000;

type NativeOAuthPending = {
  version: 1;
  flow: PortalOAuthFlow;
  startedAt: number;
  redirectPath: string | null;
};

export type NativeOAuthErrorCode =
  | 'cancelled'
  | 'expired'
  | 'invalid_callback'
  | 'missing_session'
  | 'oauth_failed';

export type NativeOAuthResult =
  | { handled: false }
  | {
      handled: true;
      flow: PortalOAuthFlow;
      redirectPath: string | null;
      errorCode: NativeOAuthErrorCode | null;
    };

const isExpectedCallbackUrl = (url: URL) => (
  url.protocol.toLowerCase() === 'br.com.universocc.aluno:'
  && url.hostname.toLowerCase() === 'auth'
  && url.pathname === '/callback'
);

const readCallbackParams = (url: URL) => {
  const searchParams = url.searchParams;
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const read = (key: string) => hashParams.get(key) || searchParams.get(key);

  return {
    code: read('code'),
    error: read('error_description') || read('error_code') || read('error'),
  };
};

const parsePending = (value: string | null): NativeOAuthPending | null => {
  if (!value) return null;

  try {
    const pending = JSON.parse(value) as Partial<NativeOAuthPending>;
    const age = typeof pending.startedAt === 'number'
      ? Date.now() - pending.startedAt
      : -1;
    const validFlow = pending.flow === 'aluno' || pending.flow === 'institucional';

    if (
      pending.version !== 1
      || !validFlow
      || age < 0
      || age > NATIVE_OAUTH_MAX_AGE_MS
    ) return null;

    return {
      version: 1,
      flow: pending.flow,
      startedAt: pending.startedAt,
      redirectPath: typeof pending.redirectPath === 'string'
        ? pending.redirectPath
        : null,
    };
  } catch {
    return null;
  }
};

export const isNativeOAuthPlatform = () => Capacitor.isNativePlatform();

export const readPendingNativeOAuth = async () => {
  if (!isNativeOAuthPlatform()) return null;
  const { value } = await Preferences.get({ key: NATIVE_OAUTH_PENDING_KEY });
  const pending = parsePending(value);
  if (!pending && value) {
    await Preferences.remove({ key: NATIVE_OAUTH_PENDING_KEY });
  }
  return pending;
};

export const clearPendingNativeOAuth = async () => {
  if (!isNativeOAuthPlatform()) return;
  await Preferences.remove({ key: NATIVE_OAUTH_PENDING_KEY });
};

export const startNativeGoogleOAuth = async (
  flow: PortalOAuthFlow,
  redirectPath: string | null,
) => {
  if (!isNativeOAuthPlatform()) {
    throw new Error('O fluxo OAuth nativo só pode ser iniciado no aplicativo.');
  }

  const pending: NativeOAuthPending = {
    version: 1,
    flow,
    startedAt: Date.now(),
    redirectPath,
  };
  await Preferences.set({
    key: NATIVE_OAUTH_PENDING_KEY,
    value: JSON.stringify(pending),
  });
  window.dispatchEvent(new window.CustomEvent(NATIVE_OAUTH_STARTED_EVENT));

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: NATIVE_OAUTH_CALLBACK_URL,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) throw error;
    if (!data.url) throw new Error('O provedor não retornou uma URL de autenticação.');

    await Browser.open({ url: data.url });
  } catch (error) {
    await clearPendingNativeOAuth();
    throw error;
  }
};

export const consumeNativeOAuthUrl = async (rawUrl: string): Promise<NativeOAuthResult> => {
  if (!isNativeOAuthPlatform()) return { handled: false };

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(rawUrl);
  } catch {
    return { handled: false };
  }

  if (!isExpectedCallbackUrl(callbackUrl)) return { handled: false };

  const pending = await readPendingNativeOAuth();
  if (!pending) {
    await clearPendingNativeOAuth();
    return {
      handled: true,
      flow: 'aluno',
      redirectPath: null,
      errorCode: 'expired',
    };
  }

  const resultBase = {
    handled: true as const,
    flow: pending.flow,
    redirectPath: pending.redirectPath,
  };
  const callback = readCallbackParams(callbackUrl);

  if (callback.error) {
    await clearPendingNativeOAuth();
    const normalizedError = callback.error.toLowerCase();
    return {
      ...resultBase,
      errorCode: normalizedError.includes('access_denied')
        ? 'cancelled'
        : 'oauth_failed',
    };
  }

  if (!callback.code) {
    await clearPendingNativeOAuth();
    return { ...resultBase, errorCode: 'missing_session' };
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(callback.code);
  await clearPendingNativeOAuth();

  if (error || !data.session) {
    return { ...resultBase, errorCode: 'missing_session' };
  }

  return { ...resultBase, errorCode: null };
};
