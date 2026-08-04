import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  NATIVE_APP_ORIGINS,
  NATIVE_TURNSTILE_ROUTE,
  createNativeTurnstileNonce,
  getNativeTurnstileChallengeOrigin,
  isNativeTurnstileMessage,
  type NativeTurnstileAction,
} from './native-turnstile-bridge';

type NativeTurnstileStatus = 'loading' | 'retrying' | 'verified' | 'error' | 'unsupported';

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
  const iframeRef = useRef<globalThis.HTMLIFrameElement>(null);
  const [nonce, setNonce] = useState(createNativeTurnstileNonce);
  const [status, setStatus] = useState<NativeTurnstileStatus>('loading');
  const challengeOrigin = getNativeTurnstileChallengeOrigin();
  const parentOrigin = window.location.origin;

  useEffect(() => {
    onTokenChange('');
    setStatus('loading');
    onStatusChange?.('loading');
    setNonce(createNativeTurnstileNonce());
  }, [action, resetSignal]);

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
        onTokenChange(event.data.token || '');
        setStatus('verified');
        onStatusChange?.('verified');
        return;
      }

      if (event.data.status === 'retrying' || event.data.status === 'expired') {
        onTokenChange('');
        setStatus('retrying');
        onStatusChange?.('retrying');
        return;
      }

      onTokenChange('');
      const nextStatus = event.data.status === 'unsupported' ? 'unsupported' : 'error';
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
      onError?.(event.data.errorCode);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [action, challengeOrigin, nonce, onError, onStatusChange, onTokenChange]);

  const iframeUrl = useMemo(() => {
    if (!challengeOrigin || !NATIVE_APP_ORIGINS.has(parentOrigin)) return '';
    const url = new URL(NATIVE_TURNSTILE_ROUTE, challengeOrigin);
    url.searchParams.set('action', action);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('parentOrigin', parentOrigin);
    return url.toString();
  }, [action, challengeOrigin, nonce, parentOrigin]);

  const retry = () => {
    onTokenChange('');
    setStatus('loading');
    onStatusChange?.('loading');
    setNonce(createNativeTurnstileNonce());
  };

  if (!iframeUrl) {
    return (
      <p role="alert" className="text-xs font-semibold text-red-600">
        A verificação de segurança nativa não está configurada.
      </p>
    );
  }

  return (
    <div className="w-full space-y-2" aria-label="Verificação de segurança">
      <iframe
        key={iframeUrl}
        ref={iframeRef}
        title="Verificação de segurança"
        src={iframeUrl}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        className="h-[104px] w-full border-0 bg-white"
      />
      <div className="flex items-center justify-between gap-3">
        <p
          role={status === 'error' || status === 'unsupported' ? 'alert' : 'status'}
          aria-live="polite"
          className={`text-xs font-semibold ${
            status === 'verified'
              ? 'text-emerald-700'
              : status === 'error' || status === 'unsupported'
                ? 'text-red-600'
                : 'text-slate-500'
          }`}
        >
          {status === 'verified'
            ? 'Verificação de segurança concluída.'
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
