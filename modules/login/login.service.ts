
import { supabase } from '../../lib/supabase';
import { Capacitor } from '@capacitor/core';
import { LoginCredentials, AuthResponse } from './login.types';
import { buildAuthRedirectUrl } from '../../lib/app-url';
import { clearPortalSession, getPortalProfile } from './portal-session';
import {
  clearPendingOAuthReturn,
  rememberPendingOAuthReturn,
} from '../shared/auth/oauth-return-state';

const AUTH_GENERIC_ERROR = 'Não foi possível autenticar com as credenciais informadas. Verifique seus dados e tente novamente.';
const AUTH_RATE_LIMIT_ERROR = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
const AUTH_CHALLENGE_ERROR = 'A verificação de segurança expirou ou falhou. Tente verificá-la novamente.';
const AUTH_SERVICE_ERROR = 'O serviço de autenticação está temporariamente indisponível. Tente novamente em instantes.';
const RECOVERY_GENERIC_MESSAGE = 'Se existir uma conta vinculada aos dados informados, enviaremos as instruções de recuperação.';

const getFriendlyOAuthError = (message: string) => {
  if (message.includes('Manual linking is disabled')) {
    return 'O projeto do Supabase não permite vínculo manual de contas. Ative "Allow manual linking" em Authentication > Settings.';
  }

  if (message.includes('Unsupported provider: provider is not enabled')) {
    return 'Login com Google não está habilitado no projeto do Supabase ainda. Ative em Authentication > Providers > Google e configure CLIENT_ID/CLIENT_SECRET do OAuth.';
  }

  return message;
};

const readPortalAuthFailure = async (error: unknown) => {
  const context = (error as {
    context?: {
      status?: number;
      clone?: () => Response;
    };
  })?.context;
  const status = context?.status;
  const errorName = error instanceof Error ? error.name : '';
  let code = '';

  if (typeof context?.clone === 'function') {
    try {
      const body = await context.clone().json() as { code?: unknown };
      code = typeof body?.code === 'string' ? body.code : '';
    } catch {
      // A categoria HTTP ainda permite uma mensagem segura e útil.
    }
  }

  return {
    status,
    code,
    transportFailure:
      !context
      || errorName === 'FunctionsFetchError'
      || errorName === 'FunctionsRelayError',
  };
};

const getPortalAuthFailureMessage = (
  failure: { status?: number; code: string; transportFailure: boolean },
) => {
  if (failure.status === 429 || failure.code === 'rate_limited') {
    return AUTH_RATE_LIMIT_ERROR;
  }
  if (failure.status === 403 || failure.code === 'challenge_failed') {
    return AUTH_CHALLENGE_ERROR;
  }
  if (failure.status === 503 || failure.code === 'service_unavailable') {
    return AUTH_SERVICE_ERROR;
  }
  if (failure.transportFailure) {
    return AUTH_SERVICE_ERROR;
  }
  return AUTH_GENERIC_ERROR;
};

export const loginService = {
  async login({
    email,
    password,
    turnstileToken,
  }: LoginCredentials): Promise<AuthResponse> {
    const { data, error } = await supabase.functions.invoke('portal-auth', {
      body: {
        action: 'login',
        identifier: email.trim(),
        password,
        turnstileToken,
        challengeContext: Capacitor.isNativePlatform() ? 'native' : 'web',
      },
    });

    if (error) {
      const failure = await readPortalAuthFailure(error);
      return {
        user: null,
        session: null,
        error: getPortalAuthFailureMessage(failure),
      };
    }

    const accessToken = typeof data?.accessToken === 'string' ? data.accessToken : '';
    const refreshToken = typeof data?.refreshToken === 'string' ? data.refreshToken : '';
    if (!accessToken || !refreshToken) {
      return { user: null, session: null, error: AUTH_GENERIC_ERROR };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError || !sessionData.session || !sessionData.user) {
      return { user: null, session: null, error: AUTH_GENERIC_ERROR };
    }

    return {
      user: sessionData.user,
      session: sessionData.session,
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

  async requestPasswordRecovery(
    identifier: string,
    turnstileToken: string,
    redirectPath = '/recuperar-senha',
  ) {
    const { error } = await supabase.functions.invoke('portal-auth', {
      body: {
        action: 'recover',
        identifier: identifier.trim(),
        turnstileToken,
        redirectTo: buildAuthRedirectUrl(redirectPath),
        challengeContext: Capacitor.isNativePlatform() ? 'native' : 'web',
      },
    });

    if (error) {
      const failure = await readPortalAuthFailure(error);
      if (
        failure.status === 403
        || failure.status === 429
        || failure.status === 503
        || failure.transportFailure
      ) {
        throw new Error(getPortalAuthFailureMessage(failure));
      }
      console.warn('Não foi possível concluir a solicitação de recuperação.');
    }
    return RECOVERY_GENERIC_MESSAGE;
  },

  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return error.message;

    const alunoProfile = await getPortalProfile({
      preferredRole: 'Aluno',
      allowedRoles: ['Aluno'],
    }).catch(() => null);
    if (alunoProfile?.requiresPasswordReset) {
      const { error: accessFlagError } = await supabase
        .from('parceiros')
        .update({ troca_senha_obrigatoria: false })
        .eq('id', alunoProfile.id);
      if (accessFlagError) {
        console.warn('A senha foi alterada, mas não foi possível atualizar o indicador de primeiro acesso.');
      }
    }

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
  },

  async reauthenticateWithPassword(currentPassword: string) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (userError || !email) {
      return 'Sua sessão expirou. Entre novamente para alterar a senha.';
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (error) {
      return 'A senha atual está incorreta.';
    }

    return null;
  }
};
