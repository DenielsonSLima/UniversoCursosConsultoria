import { createClient } from '@supabase/supabase-js';

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PASSWORD_RECOVERY_MARKER_KEY = 'universo.password-recovery-session';
const PASSWORD_RECOVERY_MARKER_MAX_AGE_MS = 15 * 60 * 1000;

interface PasswordRecoveryMarker {
  userId: string;
  accessToken: string;
  createdAt: number;
}

const isBrowser = typeof window !== 'undefined';

// PasswordRecoveryPage is lazy-loaded. Persist the trusted Auth event here,
// where the listener is registered as soon as the Supabase client is created,
// so the page never has to treat an unrelated existing session as recovery.
supabase.auth.onAuthStateChange((event, session) => {
  if (!isBrowser) return;

  if (event === 'PASSWORD_RECOVERY' && session) {
    const marker: PasswordRecoveryMarker = {
      userId: session.user.id,
      accessToken: session.access_token,
      createdAt: Date.now(),
    };
    try {
      window.sessionStorage.setItem(PASSWORD_RECOVERY_MARKER_KEY, JSON.stringify(marker));
    } catch {
      // A pagina ainda pode autorizar pelo evento em memoria ou pelos tokens
      // explicitos do callback quando o storage do navegador estiver bloqueado.
    }
  } else if (event === 'SIGNED_OUT') {
    try {
      window.sessionStorage.removeItem(PASSWORD_RECOVERY_MARKER_KEY);
    } catch {
      // Storage indisponivel nao deve interromper o encerramento da sessao.
    }
  }
});

export const consumePasswordRecoveryMarker = (
  userId: string,
  accessToken: string,
) => {
  if (!isBrowser) return false;

  let rawMarker: string | null;
  try {
    rawMarker = window.sessionStorage.getItem(PASSWORD_RECOVERY_MARKER_KEY);
    window.sessionStorage.removeItem(PASSWORD_RECOVERY_MARKER_KEY);
  } catch {
    return false;
  }

  if (!rawMarker) return false;

  try {
    const marker = JSON.parse(rawMarker) as Partial<PasswordRecoveryMarker>;
    const markerAge = typeof marker.createdAt === 'number'
      ? Date.now() - marker.createdAt
      : -1;
    return (
      marker.userId === userId
      && marker.accessToken === accessToken
      && markerAge >= 0
      && markerAge <= PASSWORD_RECOVERY_MARKER_MAX_AGE_MS
    );
  } catch {
    return false;
  }
};
