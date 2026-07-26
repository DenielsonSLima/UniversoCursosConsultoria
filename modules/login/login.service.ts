
import { supabase } from '../../lib/supabase';
import { LoginCredentials, AuthResponse } from './login.types';
import { buildAuthRedirectUrl } from '../../lib/app-url';
import { formatCpf, isCpfLike, normalizeEmail, onlyDigits } from '../shared/utils/identityValidation';
import { clearPortalSession } from './portal-session';
import {
  clearPendingOAuthReturn,
  rememberPendingOAuthReturn,
} from '../shared/auth/oauth-return-state';

const AUTH_GENERIC_ERROR = 'Não foi possível autenticar com as credenciais informadas. Verifique seus dados e tente novamente.';
const AUTH_EMAIL_NOT_CONFIRMED_ERROR = 'Falta confirmar seu e-mail. Enviamos um novo link; olhe sua caixa de entrada e também o spam/lixo eletrônico.';
const AUTH_EMAIL_NOT_CONFIRMED_RESEND_ERROR = 'Falta confirmar seu e-mail. Olhe sua caixa de entrada e também o spam/lixo eletrônico antes de tentar entrar.';
const AUTH_CONFIRMED_INVALID_PASSWORD_ERROR = 'Seu e-mail já está confirmado, mas a senha não confere. Digite novamente ou use “Esqueceu a senha?”.';

const isEmailNotConfirmedError = (error: any) => {
  const code = String(error?.code || error?.error_code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'email_not_confirmed' || message.includes('email not confirmed');
};

const isInvalidCredentialsError = (error: any) => {
  const code = String(error?.code || error?.error_code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'invalid_credentials' || message.includes('invalid login credentials');
};

const sanitizeAuthError = (message: string) => {
  if (!message) return AUTH_GENERIC_ERROR;
  return AUTH_GENERIC_ERROR;
};

const resendSignupConfirmation = async (email: string) => {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: buildAuthRedirectUrl(`/confirmacao-email?redirect=${encodeURIComponent('/login')}`),
    },
  });

  return !error;
};

const getAlunoAuthStatus = async (identifier: string) => {
  const { data, error } = await supabase.rpc('get_public_aluno_auth_status', {
    p_identifier: identifier,
  });

  if (error) {
    console.warn('Não foi possível consultar status de confirmação do aluno:', error);
    return null;
  }

  return Array.isArray(data) ? data[0] : null;
};

const buildUnconfirmedEmailError = async (email: string) => {
  const confirmationResent = await resendSignupConfirmation(email);
  return confirmationResent ? AUTH_EMAIL_NOT_CONFIRMED_ERROR : AUTH_EMAIL_NOT_CONFIRMED_RESEND_ERROR;
};

const resolveLoginEmail = async (identifier: string) => {
  const value = identifier.trim();
  if (!isCpfLike(value)) return normalizeEmail(value);

  const { data, error } = await supabase.rpc('resolve_portal_login_email', {
    p_identifier: onlyDigits(value) || formatCpf(value),
  });

  if (error) throw new Error(error.message);
  if (data) return normalizeEmail(String(data));

  throw new Error(AUTH_GENERIC_ERROR);
};

const getFriendlyOAuthError = (message: string) => {
  if (message.includes('Manual linking is disabled')) {
    return 'O projeto do Supabase não permite vínculo manual de contas. Ative "Allow manual linking" em Authentication > Settings.';
  }

  if (message.includes('Unsupported provider: provider is not enabled')) {
    return 'Login com Google não está habilitado no projeto do Supabase ainda. Ative em Authentication > Providers > Google e configure CLIENT_ID/CLIENT_SECRET do OAuth.';
  }

  return message;
};

export const loginService = {
  async login({
    email,
    password,
  }: LoginCredentials): Promise<AuthResponse> {
    let resolvedEmail: string;
    try {
      resolvedEmail = await resolveLoginEmail(email);
    } catch (error) {
      return {
        user: null,
        session: null,
        error: error instanceof Error ? error.message : 'Não foi possível localizar o CPF informado.',
      };
    }

    const authStatus = await getAlunoAuthStatus(resolvedEmail);
    if (
      authStatus?.user_exists === true &&
      authStatus?.is_student === true &&
      authStatus?.email_confirmed === false
    ) {
      return {
        user: null,
        session: null,
        error: await buildUnconfirmedEmailError(authStatus.resolved_email || resolvedEmail),
      };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });

    if (error) {
      if (isEmailNotConfirmedError(error)) {
        return {
          user: null,
          session: null,
          error: await buildUnconfirmedEmailError(resolvedEmail),
        };
      }

      const latestAuthStatus = await getAlunoAuthStatus(resolvedEmail);
      if (
        latestAuthStatus?.user_exists === true &&
        latestAuthStatus?.is_student === true &&
        latestAuthStatus?.email_confirmed === false
      ) {
        return {
          user: null,
          session: null,
          error: await buildUnconfirmedEmailError(latestAuthStatus.resolved_email || resolvedEmail),
        };
      }

      if (
        isInvalidCredentialsError(error) &&
        latestAuthStatus?.user_exists === true &&
        latestAuthStatus?.is_student === true &&
        latestAuthStatus?.email_confirmed === true
      ) {
        return {
          user: null,
          session: null,
          error: AUTH_CONFIRMED_INVALID_PASSWORD_ERROR,
        };
      }

      return {
        user: null,
        session: null,
        error: sanitizeAuthError(error.message),
      };
    }

    return {
      user: data.user,
      session: data.session,
      error: null,
    };
  },

  async logout() {
    clearPortalSession();

    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (!error) return;

    // Se a revogação global falhar por rede, ainda removemos o token deste
    // navegador para impedir que um F5 restaure uma sessão já encerrada na UI.
    const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
    if (localError) throw error;

    console.warn('Sessão encerrada localmente; não foi possível revogar as outras sessões.', error);
  },

  async loginWithGoogle(
    callbackPath = '/sistema/login',
    postLoginRedirectPath: string | null = null,
  ) {
    rememberPendingOAuthReturn('institucional', postLoginRedirectPath);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: buildAuthRedirectUrl(callbackPath),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw new Error(getFriendlyOAuthError(error.message));
    } catch (error) {
      clearPendingOAuthReturn('institucional');
      throw error;
    }
  },
  
  // Função auxiliar para recuperar sessão atual (útil para persistência)
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  async requestPasswordRecovery(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: buildAuthRedirectUrl('/recuperar-senha'),
    });

    return error ? error.message : null;
  },

  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return error.message;

    const { error: auditError } = await supabase.rpc('registrar_sistema_evento_manual', {
      p_modulo: 'Sistema',
      p_entidade: 'auth.users',
      p_acao: 'Alterou senha',
      p_descricao: 'Usuário alterou a senha de acesso',
      p_detalhes: { origem: 'updatePassword' },
    });

    if (auditError) {
      console.warn('Não foi possível registrar auditoria de alteração de senha:', auditError);
    }

    return null;
  }
};
