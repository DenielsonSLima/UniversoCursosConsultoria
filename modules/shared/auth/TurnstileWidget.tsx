import React, { useEffect, useRef, useState } from 'react';

type TurnstileAction = 'login' | 'recover';
export type TurnstileStatus =
  | 'loading'
  | 'verifying'
  | 'interaction-required'
  | 'verified'
  | 'retrying'
  | 'error'
  | 'unsupported';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: TurnstileAction;
      theme: 'light';
      size: 'flexible';
      appearance: 'always' | 'interaction-only';
      retry: 'auto';
      'retry-interval': number;
      'refresh-expired': 'auto';
      'refresh-timeout': 'auto';
      'feedback-enabled': false;
      'offlabel-show-help': false;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'before-interactive-callback': () => void;
      'timeout-callback': () => void;
      'unsupported-callback': () => void;
      'error-callback': (errorCode: string) => boolean;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

const SCRIPT_ID = 'cloudflare-turnstile-script';
const SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SITE_KEY = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
const SCRIPT_LOAD_TIMEOUT_MS = 12_000;
const RETRY_INTERVAL_MS = 3_000;
const RETRY_FEEDBACK_TIMEOUT_MS = 8_000;
const DEFAULT_LOCAL_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
] as const;

const parseHostnameList = (value: unknown) =>
  String(value || '')
    .split(/[,\s]+/)
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);

const LOCAL_HOSTNAMES = new Set([
  ...DEFAULT_LOCAL_HOSTNAMES,
  ...parseHostnameList(import.meta.env.VITE_TURNSTILE_LOCAL_HOSTNAMES),
]);

let scriptPromise: Promise<void> | null = null;

const getTurnstile = () =>
  (window as typeof window & { turnstile?: TurnstileApi }).turnstile;

const isLocalTurnstileHost = () =>
  LOCAL_HOSTNAMES.has(window.location.hostname.toLowerCase());

const loadTurnstile = () => {
  if (getTurnstile()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    document.getElementById(SCRIPT_ID)?.remove();
    const script = document.createElement('script');
    let settled = false;
    let timeoutId = 0;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
    const handleLoad = () => {
      if (settled) return;
      if (!getTurnstile()) {
        handleError();
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const handleError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      scriptPromise = null;
      reject(new Error('Não foi possível carregar a proteção anti-robô.'));
    };

    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    timeoutId = window.setTimeout(handleError, SCRIPT_LOAD_TIMEOUT_MS);
    document.head.appendChild(script);
  });

  return scriptPromise;
};

type Props = {
  action: TurnstileAction;
  resetSignal: number;
  onTokenChange: (token: string) => void;
  onError?: (errorCode?: string) => void;
  onStatusChange?: (status: TurnstileStatus) => void;
};

const TurnstileWidget: React.FC<Props> = ({
  action,
  resetSignal,
  onTokenChange,
  onError,
  onStatusChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const onErrorRef = useRef(onError);
  const onStatusChangeRef = useRef(onStatusChange);
  const lastResetSignalRef = useRef(resetSignal);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [status, setStatus] = useState<TurnstileStatus>('loading');

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
    onErrorRef.current = onError;
    onStatusChangeRef.current = onStatusChange;
  }, [onError, onStatusChange, onTokenChange]);

  useEffect(() => {
    if (lastResetSignalRef.current === resetSignal) return;
    lastResetSignalRef.current = resetSignal;
    setRetryAttempt((value) => value + 1);
  }, [resetSignal]);

  useEffect(() => {
    let cancelled = false;
    let retryFeedbackTimeoutId = 0;

    const reportStatus = (nextStatus: TurnstileStatus) => {
      if (cancelled) return;
      setStatus(nextStatus);
      onStatusChangeRef.current?.(nextStatus);
    };
    const clearRetryFeedbackTimeout = () => {
      window.clearTimeout(retryFeedbackTimeoutId);
      retryFeedbackTimeoutId = 0;
    };
    const reportRetrying = () => {
      clearRetryFeedbackTimeout();
      reportStatus('retrying');
      retryFeedbackTimeoutId = window.setTimeout(
        () => reportStatus('error'),
        RETRY_FEEDBACK_TIMEOUT_MS,
      );
    };

    const renderWidget = async () => {
      reportStatus('loading');
      onTokenChangeRef.current('');

      if (!SITE_KEY || !containerRef.current) {
        reportStatus('error');
        onErrorRef.current?.();
        return;
      }

      try {
        await loadTurnstile();
        const turnstile = getTurnstile();
        if (cancelled || !containerRef.current || !turnstile) return;

        reportStatus('verifying');
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          action,
          theme: 'light',
          size: 'flexible',
          appearance: isLocalTurnstileHost() ? 'always' : 'interaction-only',
          retry: 'auto',
          'retry-interval': RETRY_INTERVAL_MS,
          'refresh-expired': 'auto',
          'refresh-timeout': 'auto',
          'feedback-enabled': false,
          'offlabel-show-help': false,
          callback: (token) => {
            clearRetryFeedbackTimeout();
            onTokenChangeRef.current(token);
            reportStatus('verified');
          },
          'expired-callback': () => {
            onTokenChangeRef.current('');
            reportRetrying();
          },
          'before-interactive-callback': () => {
            clearRetryFeedbackTimeout();
            reportStatus('interaction-required');
          },
          'timeout-callback': () => {
            onTokenChangeRef.current('');
            reportRetrying();
          },
          'unsupported-callback': () => {
            onTokenChangeRef.current('');
            reportStatus('unsupported');
            onErrorRef.current?.('unsupported-browser');
          },
          'error-callback': (errorCode) => {
            onTokenChangeRef.current('');
            reportRetrying();
            onErrorRef.current?.(errorCode);
            // Retornar true apenas evita log duplicado; retry:'auto' permanece ativo.
            return true;
          },
        });
      } catch {
        if (!cancelled) {
          reportStatus('error');
          onErrorRef.current?.();
        }
      }
    };

    void renderWidget();

    return () => {
      cancelled = true;
      clearRetryFeedbackTimeout();
      const turnstile = getTurnstile();
      if (widgetIdRef.current && turnstile) {
        turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [action, retryAttempt]);

  const retry = () => {
    onTokenChangeRef.current('');
    setStatus('loading');
    onStatusChangeRef.current?.('loading');
    setRetryAttempt((value) => value + 1);
  };

  const statusMessage: Record<TurnstileStatus, string> = {
    loading: 'Preparando verificação de segurança…',
    verifying: 'Verificando seu navegador com segurança…',
    'interaction-required': 'Confirme abaixo que você é humano.',
    verified: 'Verificação de segurança concluída.',
    retrying: 'Reconectando à verificação de segurança…',
    error: 'Não foi possível carregar a verificação de segurança.',
    unsupported: 'Este navegador não é compatível com a verificação de segurança.',
  };

  const statusClassName =
    status === 'verified'
      ? 'text-emerald-700'
      : status === 'error' || status === 'unsupported'
        ? 'text-red-600'
        : 'text-slate-500';

  return (
    <div className="w-full space-y-2" aria-label="Verificação de segurança">
      <div ref={containerRef} className="min-h-[68px] w-full" />
      <div className="flex items-center justify-between gap-3">
        <p
          role={status === 'error' || status === 'unsupported' ? 'alert' : 'status'}
          aria-live="polite"
          className={`text-xs font-semibold ${statusClassName}`}
        >
          {statusMessage[status]}
        </p>
        {status === 'error' ? (
          <button
            type="button"
            onClick={retry}
            className="shrink-0 text-xs font-black text-blue-600 transition hover:text-blue-800"
          >
            Tentar novamente
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default TurnstileWidget;
