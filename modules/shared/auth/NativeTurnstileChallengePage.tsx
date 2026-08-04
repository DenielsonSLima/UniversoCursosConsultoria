import React, { useEffect, useRef, useState } from 'react';
import {
  NATIVE_APP_ORIGINS,
  NATIVE_TURNSTILE_MESSAGE_TYPE,
  isNativeTurnstileAction,
  isValidNativeTurnstileNonce,
  type NativeTurnstileMessage,
} from './native-turnstile-bridge';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const NATIVE_SITE_KEY = String(import.meta.env.VITE_TURNSTILE_NATIVE_SITE_KEY || '').trim();

const getTurnstile = () => (
  window as typeof window & { turnstile?: TurnstileApi }
).turnstile;

const loadTurnstile = () => new Promise<TurnstileApi>((resolve, reject) => {
  const existing = getTurnstile();
  if (existing) {
    resolve(existing);
    return;
  }

  const script = document.createElement('script');
  const timeout = window.setTimeout(() => {
    script.remove();
    reject(new Error('turnstile-load-timeout'));
  }, 12_000);
  script.src = SCRIPT_URL;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    window.clearTimeout(timeout);
    const api = getTurnstile();
    if (api) resolve(api);
    else reject(new Error('turnstile-api-unavailable'));
  };
  script.onerror = () => {
    window.clearTimeout(timeout);
    reject(new Error('turnstile-script-error'));
  };
  document.head.appendChild(script);
});

const NativeTurnstileChallengePage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const failureCountRef = useRef(0);
  const [message, setMessage] = useState('Preparando verificação de segurança…');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const nonce = params.get('nonce');
    const parentOrigin = params.get('parentOrigin');

    if (
      window.parent === window
      || !isNativeTurnstileAction(action)
      || !isValidNativeTurnstileNonce(nonce)
      || !parentOrigin
      || !NATIVE_APP_ORIGINS.has(parentOrigin)
      || !NATIVE_SITE_KEY
      || !containerRef.current
    ) {
      setMessage('Verificação de segurança indisponível.');
      return undefined;
    }

    let cancelled = false;
    let widgetId = '';
    const send = (payload: Omit<NativeTurnstileMessage, 'type' | 'nonce' | 'action'>) => {
      if (cancelled) return;
      window.parent.postMessage({
        type: NATIVE_TURNSTILE_MESSAGE_TYPE,
        nonce,
        action,
        ...payload,
      } satisfies NativeTurnstileMessage, parentOrigin);
    };

    void loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        setMessage('Verificando seu acesso…');
        widgetId = turnstile.render(containerRef.current, {
          sitekey: NATIVE_SITE_KEY,
          action,
          language: 'pt-BR',
          theme: 'light',
          size: 'flexible',
          appearance: 'interaction-only',
          retry: 'auto',
          'retry-interval': 3000,
          'refresh-expired': 'auto',
          'refresh-timeout': 'auto',
          'feedback-enabled': false,
          callback: (token: string) => {
            failureCountRef.current = 0;
            setMessage('Verificação de segurança concluída.');
            send({ status: 'verified', token });
          },
          'expired-callback': () => {
            setMessage('A verificação expirou. Tentando novamente…');
            send({ status: 'expired' });
          },
          'unsupported-callback': () => {
            setMessage('Este aparelho não é compatível com a verificação.');
            send({ status: 'unsupported', errorCode: 'unsupported-browser' });
          },
          'error-callback': (errorCode: string) => {
            failureCountRef.current += 1;
            setMessage('Falha na verificação. Tentando novamente…');
            send({
              status: failureCountRef.current >= 3 ? 'error' : 'retrying',
              errorCode,
            });
            return true;
          },
        });
      })
      .catch((error: unknown) => {
        const errorCode = error instanceof Error ? error.message : 'turnstile-load-error';
        setMessage('Não foi possível carregar a verificação de segurança.');
        send({ status: 'error', errorCode });
      });

    return () => {
      cancelled = true;
      const turnstile = getTurnstile();
      if (widgetId && turnstile) turnstile.remove(widgetId);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-2 text-slate-700">
      <div className="w-full max-w-md">
        <div ref={containerRef} className="min-h-[68px] w-full" />
        <p role="status" aria-live="polite" className="mt-2 text-xs font-semibold">
          {message}
        </p>
      </div>
    </main>
  );
};

export default NativeTurnstileChallengePage;
