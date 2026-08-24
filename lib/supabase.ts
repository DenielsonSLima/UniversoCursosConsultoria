import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import {
  buildSupabaseAuthStorageKey,
  clearSupabaseAuthStorage,
} from './supabase-auth-storage';

const isBrowser = typeof window !== 'undefined';
type PasswordSetupKind = 'recovery' | 'invite';

interface InitialInviteCallback {
  accessToken: string;
}

const getInitialInviteCallback = (): InitialInviteCallback | null => {
  if (!isBrowser) return null;

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  const type = hashParams.get('type') || searchParams.get('type');
  const accessToken = hashParams.get('access_token') || searchParams.get('access_token');

  return type === 'invite' && accessToken
    ? { accessToken }
    : null;
};

// O cliente do Supabase pode limpar o callback antes de uma página lazy ser
// montada. Para convite implícito, mantenha o token do callback para conferir
// a sessão recebida; um `type` ou `code` isolado nunca autoriza a senha.
let pendingInitialInviteCallback = getInitialInviteCallback();

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.REACT_APP_SUPABASE_URL;

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY for local compatibility.'
  );
}

const SUPABASE_AUTH_STORAGE_KEY = buildSupabaseAuthStorageKey(supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Native apps are public OAuth clients. PKCE keeps access and refresh tokens
    // out of the callback URL and binds the one-time code to this app instance.
    flowType: Capacitor.isNativePlatform() ? 'pkce' : 'implicit',
    // O WebView mantém esta sessão entre fechamentos normais do app. Ela só é
    // removida por logout explícito, revogação/expiração ou limpeza dos dados.
    persistSession: true,
    autoRefreshToken: true,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
  },
});

const PASSWORD_SETUP_MARKER_KEY = 'universo.password-setup-session';
const PASSWORD_SETUP_MARKER_MAX_AGE_MS = 15 * 60 * 1000;

export const forceClearPersistedSupabaseSession = () => {
  if (!isBrowser) return false;

  const cleared = clearSupabaseAuthStorage(
    window.localStorage,
    SUPABASE_AUTH_STORAGE_KEY,
  );
  if (!cleared) return false;

  pendingInitialInviteCallback = null;
  try {
    window.sessionStorage.removeItem(PASSWORD_SETUP_MARKER_KEY);
  } catch {
    // O token principal já foi removido; o marcador expira e não cria sessão.
  }

  try {
    const channel = new window.BroadcastChannel(SUPABASE_AUTH_STORAGE_KEY);
    channel.postMessage({ event: 'SIGNED_OUT', session: null });
    channel.close();
  } catch {
    // Navegadores sem BroadcastChannel ainda ficam sem token persistido.
  }

  return true;
};

interface PasswordSetupMarker {
  userId: string;
  accessToken: string;
  createdAt: number;
  kind: PasswordSetupKind;
}

// PasswordRecoveryPage is lazy-loaded. Persist the trusted Auth event here,
// where the listener is registered as soon as the Supabase client is created,
// so the page never has to treat an unrelated existing session as recovery.
supabase.auth.onAuthStateChange((event, session) => {
  if (!isBrowser) return;

  let setupKind: PasswordSetupKind | null = event === 'PASSWORD_RECOVERY'
    ? 'recovery'
    : null;

  if (
    pendingInitialInviteCallback
    && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')
  ) {
    const callback = pendingInitialInviteCallback;
    pendingInitialInviteCallback = null;
    if (session?.access_token === callback.accessToken) {
      setupKind = 'invite';
    }
  }

  if (setupKind && session) {
    const marker: PasswordSetupMarker = {
      userId: session.user.id,
      accessToken: session.access_token,
      createdAt: Date.now(),
      kind: setupKind,
    };
    try {
      window.sessionStorage.setItem(PASSWORD_SETUP_MARKER_KEY, JSON.stringify(marker));
    } catch {
      // A pagina ainda pode autorizar pelo evento em memoria ou pelos tokens
      // explicitos do callback quando o storage do navegador estiver bloqueado.
    }
  } else if (event === 'SIGNED_OUT') {
    try {
      window.sessionStorage.removeItem(PASSWORD_SETUP_MARKER_KEY);
    } catch {
      // Storage indisponivel nao deve interromper o encerramento da sessao.
    }
  }
});

export const consumePasswordSetupMarker = (
  userId: string,
  accessToken: string,
): PasswordSetupKind | null => {
  if (!isBrowser) return null;

  let rawMarker: string | null;
  try {
    rawMarker = window.sessionStorage.getItem(PASSWORD_SETUP_MARKER_KEY);
    window.sessionStorage.removeItem(PASSWORD_SETUP_MARKER_KEY);
  } catch {
    return null;
  }

  if (!rawMarker) return null;

  try {
    const marker = JSON.parse(rawMarker) as Partial<PasswordSetupMarker>;
    const markerAge = typeof marker.createdAt === 'number'
      ? Date.now() - marker.createdAt
      : -1;
    return (
      marker.userId === userId
      && marker.accessToken === accessToken
      && markerAge >= 0
      && markerAge <= PASSWORD_SETUP_MARKER_MAX_AGE_MS
      && (marker.kind === 'recovery' || marker.kind === 'invite')
    ) ? marker.kind : null;
  } catch {
    return null;
  }
};
