
import { supabase } from '../../lib/supabase';
import { LoginCredentials, AuthResponse } from './login.types';
import { buildAuthRedirectUrl } from '../../lib/app-url';
import { formatCpf, isCpfLike, normalizeEmail, onlyDigits } from '../shared/utils/identityValidation';
import { clearPortalSession } from './portal-session';

const AUTH_GENERIC_ERROR = 'Não foi possível autenticar com as credenciais informadas. Verifique seus dados e tente novamente.';

const sanitizeAuthError = (message: string) => {
  if (!message) return AUTH_GENERIC_ERROR;
  return AUTH_GENERIC_ERROR;
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });

    if (error) {
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
    if (error) throw error;
  },

  async loginWithGoogle(redirectPath = '/sistema/login') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: buildAuthRedirectUrl(redirectPath),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw new Error(getFriendlyOAuthError(error.message));
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
