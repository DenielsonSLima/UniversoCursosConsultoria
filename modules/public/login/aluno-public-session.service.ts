import { buildAuthRedirectUrl } from '../../../lib/app-url';
import { supabase } from '../../../lib/supabase';
import {
  getPortalAccessErrorLog,
  getPortalAccessErrorMessage,
} from '../../login/institutional-login-error';
import { loginService } from '../../login/login.service';
import {
  getPortalProfile,
  getPublicPortalProfiles,
  type PortalAuthProfile,
} from '../../login/portal-session';
import {
  clearPendingOAuthReturn,
  rememberPendingOAuthReturn,
} from '../../shared/auth/oauth-return-state';
import {
  isNativeOAuthPlatform,
  startNativeGoogleOAuth,
} from '../../shared/auth/native-oauth';
import { PUBLIC_ALUNO_EMAIL_CONFIRMATION_REQUIRED_MESSAGE } from './aluno-public-auth.contract';
import { getFriendlyOAuthError, getSafePublicAlunoRedirectPath } from './aluno-public-auth.helpers';
import {
  clearUnconfirmedLocalSession,
  hasConfirmedEmail,
} from './aluno-public-auth-session.helpers';
import { finalizePublicSignupFromMetadata } from './aluno-public-signup.service';

const getExistingOrFinalizePublicAlunoProfile = async () => {
  // O perfil sincronizado pelo Auth pode já existir e ter sido corrigido pela
  // secretaria depois do cadastro. Nesse caso, os metadados originais não
  // devem sobrescrever novamente CPF, telefone ou outros dados a cada login.
  const existingProfile = await getPortalProfile({
    preferredRole: 'Aluno',
    allowedRoles: ['Aluno'],
  });
  if (existingProfile) return existingProfile;

  return finalizePublicSignupFromMetadata();
};

const getPublicLoginProfiles = async (): Promise<PortalAuthProfile[]> => {
  let profiles: PortalAuthProfile[];
  try {
    profiles = await getPublicPortalProfiles();
  } catch (error) {
    console.error(
      'Falha ao resolver acesso público do aluno:',
      getPortalAccessErrorLog(error),
    );
    throw new Error(getPortalAccessErrorMessage(
      error,
      'Não foi possível carregar os perfis disponíveis para este acesso.',
    ), { cause: error });
  }

  if (profiles.length > 0) return profiles;
  throw new Error(
    'Esta conta não possui um vínculo ativo para acesso ao portal. Solicite a verificação do vínculo à secretaria.',
  );
};

const rejectUnconfirmedEmail = async (user: { email_confirmed_at?: string | null } | null) => {
  if (!user || hasConfirmedEmail(user)) return;
  await clearUnconfirmedLocalSession();
  throw new Error(PUBLIC_ALUNO_EMAIL_CONFIRMATION_REQUIRED_MESSAGE);
};

export const loginPublicAluno = async (
  email: string,
  password: string,
  turnstileToken: string,
) => {
  const { error, user } = await loginService.login({ email, password, turnstileToken });
  if (error) throw new Error(error);
  await rejectUnconfirmedEmail(user);

  try {
    const profile = await getExistingOrFinalizePublicAlunoProfile();
    if (!profile || profile.tipo !== 'Aluno') {
      throw new Error(
        'Este login é exclusivo para alunos. Use uma conta de aluno ou acesse o portal institucional.',
      );
    }
    return profile;
  } catch (profileError) {
    await loginService.logout();
    throw profileError;
  }
};

/**
 * Fluxo novo de login público. A escolha só é apresentada para contextos
 * que a RPC já devolveu como ativos e autorizados.
 */
export const loginPublicAlunoAndListProfiles = async (
  email: string,
  password: string,
  turnstileToken: string,
): Promise<PortalAuthProfile[]> => {
  const { error, user } = await loginService.login({ email, password, turnstileToken });
  if (error) throw new Error(error);
  await rejectUnconfirmedEmail(user);

  try {
    return await getPublicLoginProfiles();
  } catch (profileError) {
    await loginService.logout();
    throw profileError;
  }
};

export const loginPublicAlunoWithGoogle = async (redirectPath = '/aluno') => {
  const safeRedirectPath = getSafePublicAlunoRedirectPath(redirectPath);

  if (isNativeOAuthPlatform()) {
    try {
      await startNativeGoogleOAuth('aluno', safeRedirectPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      throw new Error(getFriendlyOAuthError(message), { cause: error });
    }
    return;
  }

  rememberPendingOAuthReturn('aluno', safeRedirectPath);

  // O callback precisa ser uma URL fixa da allowlist do Supabase. O destino
  // final fica no sessionStorage e não participa da validação do redirectTo.
  const redirectTo = buildAuthRedirectUrl('/login');
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw new Error(getFriendlyOAuthError(error.message));
  } catch (error) {
    clearPendingOAuthReturn('aluno');
    throw error;
  }
};

export const finishPublicAlunoExternalLogin = async () => {
  try {
    const profile = await getExistingOrFinalizePublicAlunoProfile();
    if (!profile || profile.tipo !== 'Aluno') {
      throw new Error(
        'Esta conta não possui vínculo de aluno. Use um e-mail de aluno ou crie o cadastro de aluno antes de entrar.',
      );
    }
    return profile;
  } catch (profileError) {
    await loginService.logout();
    throw profileError;
  }
};

export const finishPublicAlunoExternalLoginAndListProfiles = async (): Promise<PortalAuthProfile[]> => {
  try {
    return await getPublicLoginProfiles();
  } catch (profileError) {
    await loginService.logout();
    throw profileError;
  }
};
