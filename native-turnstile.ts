import {
  NATIVE_APP_ORIGINS,
  NATIVE_TURNSTILE_MESSAGE_TYPE,
  isNativeTurnstileAction,
  isValidNativeTurnstileNonce,
  type NativeTurnstileMessage,
} from './modules/shared/auth/native-turnstile-bridge';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const NATIVE_SITE_KEY = String(import.meta.env.VITE_TURNSTILE_NATIVE_SITE_KEY || '').trim();
const CHALLENGE_WATCHDOG_TIMEOUT_MS = 20_000;

const getTurnstile = () => (
  window as typeof window & { turnstile?: TurnstileApi }
).turnstile;

const setStatus = (message: string) => {
  const element = document.getElementById('native-turnstile-status');
  if (element) element.textContent = message;
};

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

const startChallenge = async () => {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  const nonce = params.get('nonce');
  const parentOrigin = params.get('parentOrigin');
  const container = document.getElementById('native-turnstile-container');

  if (
    window.parent === window
    || !isNativeTurnstileAction(action)
    || !isValidNativeTurnstileNonce(nonce)
    || !parentOrigin
    || !NATIVE_APP_ORIGINS.has(parentOrigin)
    || !NATIVE_SITE_KEY
    || !container
  ) {
    setStatus('Verificação de segurança indisponível.');
    return;
  }

  let widgetId = '';
  let failureCount = 0;
  let challengeWatchdogId = 0;
  let cancelled = false;

  const send = (payload: Omit<NativeTurnstileMessage, 'type' | 'nonce' | 'action'>) => {
    if (cancelled) return;
    window.parent.postMessage({
      type: NATIVE_TURNSTILE_MESSAGE_TYPE,
      nonce,
      action,
      ...payload,
    } satisfies NativeTurnstileMessage, parentOrigin);
  };

  const clearChallengeWatchdog = () => {
    window.clearTimeout(challengeWatchdogId);
    challengeWatchdogId = 0;
  };

  const startChallengeWatchdog = () => {
    clearChallengeWatchdog();
    challengeWatchdogId = window.setTimeout(() => {
      setStatus('A verificação demorou mais que o esperado. Tente novamente.');
      send({ status: 'error', errorCode: 'challenge-timeout' });
    }, CHALLENGE_WATCHDOG_TIMEOUT_MS);
  };

  const dispose = () => {
    if (cancelled) return;
    cancelled = true;
    clearChallengeWatchdog();
    const turnstile = getTurnstile();
    if (widgetId && turnstile) turnstile.remove(widgetId);
  };

  window.addEventListener('pagehide', dispose, { once: true });

  try {
    const turnstile = await loadTurnstile();
    if (cancelled) return;

    setStatus('Verificando seu acesso…');
    send({ status: 'verifying' });
    startChallengeWatchdog();

    widgetId = turnstile.render(container, {
      sitekey: NATIVE_SITE_KEY,
      action,
      language: 'pt-BR',
      theme: 'light',
      size: 'flexible',
      appearance: 'always',
      retry: 'auto',
      'retry-interval': 3000,
      'refresh-expired': 'auto',
      'refresh-timeout': 'auto',
      'feedback-enabled': false,
      'offlabel-show-help': false,
      callback: (token: string) => {
        clearChallengeWatchdog();
        failureCount = 0;
        setStatus('Verificação de segurança concluída.');
        send({ status: 'verified', token });
      },
      'expired-callback': () => {
        setStatus('A verificação expirou. Tentando novamente…');
        send({ status: 'expired' });
        startChallengeWatchdog();
      },
      'before-interactive-callback': () => {
        clearChallengeWatchdog();
        setStatus('Confirme abaixo que você é humano.');
        send({ status: 'interaction-required' });
      },
      'timeout-callback': () => {
        setStatus('A verificação expirou. Tentando novamente…');
        send({ status: 'retrying' });
        startChallengeWatchdog();
      },
      'unsupported-callback': () => {
        clearChallengeWatchdog();
        setStatus('Este aparelho não é compatível com a verificação.');
        send({ status: 'unsupported', errorCode: 'unsupported-browser' });
      },
      'error-callback': (errorCode: string) => {
        failureCount += 1;
        setStatus('Falha na verificação. Tentando novamente…');
        if (failureCount >= 3) clearChallengeWatchdog();
        else startChallengeWatchdog();
        send({
          status: failureCount >= 3 ? 'error' : 'retrying',
          errorCode,
        });
        return true;
      },
    });
  } catch (error) {
    clearChallengeWatchdog();
    const errorCode = error instanceof Error ? error.message : 'turnstile-load-error';
    setStatus('Não foi possível carregar a verificação de segurança.');
    send({ status: 'error', errorCode });
  }
};

void startChallenge();
