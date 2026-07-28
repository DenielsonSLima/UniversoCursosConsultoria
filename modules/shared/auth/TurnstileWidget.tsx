import React, { useEffect, useRef } from 'react';

type TurnstileAction = 'login' | 'recover';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: TurnstileAction;
      theme: 'light';
      size: 'flexible';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

const SCRIPT_ID = 'cloudflare-turnstile-script';
const SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SITE_KEY = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();

let scriptPromise: Promise<void> | null = null;

const getTurnstile = () =>
  (window as typeof window & { turnstile?: TurnstileApi }).turnstile;

const loadTurnstile = () => {
  if (getTurnstile()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing || document.createElement('script');

    const handleLoad = () => resolve();
    const handleError = () => {
      scriptPromise = null;
      reject(new Error('Não foi possível carregar a proteção anti-robô.'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
};

type Props = {
  action: TurnstileAction;
  resetSignal: number;
  onTokenChange: (token: string) => void;
  onError?: () => void;
};

const TurnstileWidget: React.FC<Props> = ({
  action,
  resetSignal,
  onTokenChange,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
    onErrorRef.current = onError;
  }, [onError, onTokenChange]);

  useEffect(() => {
    let cancelled = false;

    const renderWidget = async () => {
      if (!SITE_KEY || !containerRef.current) {
        onErrorRef.current?.();
        return;
      }

      try {
        await loadTurnstile();
        const turnstile = getTurnstile();
        if (cancelled || !containerRef.current || !turnstile) return;

        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          action,
          theme: 'light',
          size: 'flexible',
          callback: (token) => onTokenChangeRef.current(token),
          'expired-callback': () => onTokenChangeRef.current(''),
          'error-callback': () => {
            onTokenChangeRef.current('');
            onErrorRef.current?.();
          },
        });
      } catch {
        if (!cancelled) onErrorRef.current?.();
      }
    };

    void renderWidget();

    return () => {
      cancelled = true;
      const turnstile = getTurnstile();
      if (widgetIdRef.current && turnstile) {
        turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [action]);

  useEffect(() => {
    const turnstile = getTurnstile();
    if (!widgetIdRef.current || !turnstile) return;
    turnstile.reset(widgetIdRef.current);
    onTokenChangeRef.current('');
  }, [resetSignal]);

  return (
    <div className="min-h-[65px] w-full" aria-label="Verificação de segurança">
      <div ref={containerRef} className="w-full" />
    </div>
  );
};

export default TurnstileWidget;
