import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NATIVE_APP_ORIGINS,
  NATIVE_TURNSTILE_ROUTE,
  createNativeTurnstileNonce,
  getNativeTurnstileChallengeOrigin,
  isNativeTurnstileMessage,
  type NativeTurnstileAction,
} from './native-turnstile-bridge';
import type { TurnstileStatus } from './TurnstileWidget';

type NativeTurnstileStatus = TurnstileStatus;
const CHALLENGE_RESPONSE_TIMEOUT_MS = 25_000;
const CACHED_TOKEN_MAX_AGE_MS = 4 * 60 * 1000;

type CachedNativeTurnstileToken = {
  token: string;
  verifiedAt: number;
};

const verifiedTokenCache = new Map<
  NativeTurnstileAction,
  CachedNativeTurnstileToken
>();

const readCachedToken = (action: NativeTurnstileAction) => {
  const cached = verifiedTokenCache.get(action);
  if (!cached) return null;
  if (Date.now() - cached.verifiedAt > CACHED_TOKEN_MAX_AGE_MS) {
    verifiedTokenCache.delete(action);
    return null;
  }
  return cached;
};

type Props = {
  action: NativeTurnstileAction;
  resetSignal: number;
  onTokenChange: (token: string) => void;
  onStatusChange?: (status: NativeTurnstileStatus) => void;
  onError?: (errorCode?: string) => void;
};

const NativeTurnstileWidget: React.FC<Props> = ({
  action,
  resetSignal,
  onTokenChange,
  onStatusChange,
  onError,
}) => {
  const initialCachedTokenRef = useRef(readCachedToken(action));
  const iframeRef = useRef<globalThis.HTMLIFrameElement>(null);
  const lastChallengeRef = useRef({ action, resetSignal });
  const statusRef = useRef<NativeTurnstileStatus>('loading');
  const onTokenChangeRef = useRef(onTokenChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);
  const [nonce, setNonce] = useState(createNativeTurnstileNonce);
  const [status, setStatus] = useState<NativeTurnstileStatus>(
    initialCachedTokenRef.current ? 'verified' : 'loading',
  );
  const challengeOrigin = getNativeTurnstileChallengeOrigin();
  const parentOrigin = window.location.origin;

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
    onStatusChangeRef.current = onStatusChange;
    onErrorRef.current = onError;
  }, [onError, onStatusChange, onTokenChange]);

  const clearToken = useCallback(() => onTokenChangeRef.current(''), []);
  const reportStatus = useCallback((nextStatus: NativeTurnstileStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    onStatusChangeRef.current?.(nextStatus);
  }, []);

  useEffect(() => {
    const cached = readCachedToken(action);
    if (!cached) return;
    onTokenChangeRef.current(cached.token);
    reportStatus('verified');
  }, [action, reportStatus]);

  useEffect(() => {
    const previous = lastChallengeRef.current;
    if (previous.action === action && previous.resetSignal === resetSignal) return;
    lastChallengeRef.current = { action, resetSignal };

    if (previous.action !== action) {
      const cached = readCachedToken(action);
      if (cached) {
        onTokenChangeRef.current(cached.token);
        reportStatus('verified');
        return;
      }
    } else {
      verifiedTokenCache.delete(action);
    }

    clearToken();
    reportStatus('loading');
    setNonce(createNativeTurnstileNonce());
  }, [action, clearToken, reportStatus, resetSignal]);

  useEffect(() => {
    const handleMessage = (event: globalThis.MessageEvent) => {
      if (
        event.origin !== challengeOrigin
        || event.source !== iframeRef.current?.contentWindow
        || !isNativeTurnstileMessage(event.data)
        || event.data.nonce !== nonce
        || event.data.action !== action
      ) return;

      if (event.data.status === 'verified') {
        iframeRef.current?.blur();
        const token = event.data.token || '';
        verifiedTokenCache.set(action, { token, verifiedAt: Date.now() });
        onTokenChangeRef.current(token);
        reportStatus('verified');
        return;
      }

      if (
        event.data.status === 'verifying'
        || event.data.status === 'interaction-required'
      ) {
        reportStatus(event.data.status);
        return;
      }

      if (event.data.status === 'retrying' || event.data.status === 'expired') {
        verifiedTokenCache.delete(action);
        clearToken();
        reportStatus('retrying');
        return;
      }

      clearToken();
      verifiedTokenCache.delete(action);
      const nextStatus = event.data.status === 'unsupported' ? 'unsupported' : 'error';
      reportStatus(nextStatus);
      onErrorRef.current?.(event.data.errorCode);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [action, challengeOrigin, clearToken, nonce, reportStatus]);

  const iframeUrl = useMemo(() => {
    if (!challengeOrigin || !NATIVE_APP_ORIGINS.has(parentOrigin)) return '';
    const url = new URL(NATIVE_TURNSTILE_ROUTE, challengeOrigin);
    url.searchParams.set('action', action);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('parentOrigin', parentOrigin);
    return url.toString();
  }, [action, challengeOrigin, nonce, parentOrigin]);

  useEffect(() => {
    if (!iframeUrl) return undefined;
    const timeoutId = window.setTimeout(() => {
      if (
        statusRef.current === 'verified'
        || statusRef.current === 'error'
        || statusRef.current === 'unsupported'
        || statusRef.current === 'interaction-required'
      ) return;

      clearToken();
      reportStatus('error');
      onErrorRef.current?.('challenge-timeout');
    }, CHALLENGE_RESPONSE_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [clearToken, iframeUrl, reportStatus]);

  const retry = () => {
    verifiedTokenCache.delete(action);
    clearToken();
    reportStatus('loading');
    setNonce(createNativeTurnstileNonce());
  };

  const isVerified = status === 'verified';

  if (!iframeUrl) {
    return (
      <p role="alert" className="text-xs font-semibold text-red-600">
        A verificação de segurança nativa não está configurada.
      </p>
    );
  }

  return (
    <div className={`w-full ${isVerified ? '' : 'space-y-2'}`} aria-label="Verificação de segurança">
      <div
        className={isVerified
          ? 'relative h-0 overflow-hidden'
          : 'relative h-[104px] overflow-hidden rounded-lg bg-white'}
      >
        {!isVerified ? (
          <iframe
            key={iframeUrl}
            ref={iframeRef}
            title="Verificação de segurança"
            src={iframeUrl}
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
            className="h-[104px] w-full border-0 bg-transparent opacity-100"
          />
        ) : null}
      </div>
      <div
        className={isVerified
          ? 'flex min-h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-emerald-800'
          : 'flex items-center justify-between gap-3'}
      >
        {isVerified ? (
          <span
            aria-hidden="true"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-black text-white"
          >
            ✓
          </span>
        ) : null}
        <p
          role={status === 'error' || status === 'unsupported' ? 'alert' : 'status'}
          aria-live="polite"
          className={`text-xs ${isVerified ? 'font-bold' : 'font-semibold'} ${
            status === 'verified'
              ? 'text-emerald-800'
              : status === 'error' || status === 'unsupported'
                ? 'text-red-600'
                : 'text-slate-500'
          }`}
        >
          {status === 'verified'
            ? 'Verificação de segurança concluída.'
            : status === 'verifying'
              ? 'Verificando seu navegador com segurança…'
              : status === 'interaction-required'
                ? 'Confirme abaixo que você é humano.'
            : status === 'retrying'
              ? 'Reconectando à verificação de segurança…'
              : status === 'error'
                ? 'Não foi possível concluir a verificação de segurança.'
                : status === 'unsupported'
                  ? 'Este aparelho não é compatível com a verificação de segurança.'
                  : 'Preparando verificação de segurança…'}
        </p>
        {status === 'error' ? (
          <button type="button" onClick={retry} className="shrink-0 text-xs font-black text-blue-600">
            Tentar novamente
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default NativeTurnstileWidget;
