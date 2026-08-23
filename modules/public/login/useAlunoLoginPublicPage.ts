import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { supabase } from '../../../lib/supabase';
import { PORTAL_CONTEXT_HOME_ROUTES } from '../../login/portal-context.contract';
import { buildPortalFirstAccessPath } from '../../login/portal-first-access';
import { resolveProfilePostLoginRoute } from '../../login/profile-selection';
import {
  clearPortalSession,
  savePortalSession,
  type PortalAuthProfile,
} from '../../login/portal-session';
import { portalProfileKey } from '../../login/components/PortalProfileSelector';
import { resetProfileSelectionSession } from '../../login/profile-selection-session';
import {
  STUDENT_LOGIN_MOTIVATIONAL_PHRASES,
  getRandomMotivationalPhrase,
} from '../../login/motivationalPhrases';
import {
  clearOAuthReturnParams,
  clearPendingOAuthReturn,
  getOAuthReturnError,
  hasOAuthReturnInUrl,
  readPendingOAuthReturn,
} from '../../shared/auth/oauth-return-state';
import {
  alunoPublicAuthService,
  getSafePublicAlunoRedirectPath,
  isPublicAlunoAlreadyRegisteredError,
} from './aluno-public-auth.service';
import {
  EXPIRED_AUTH_LINK_MESSAGE,
  isExpiredAuthLink,
  openAlunoAppDocument,
} from './aluno-login-redirect';
import type { AuthMessage, AuthMode } from './aluno-login.utils';
import { useAlunoSignupForm } from './useAlunoSignupForm';

export const useAlunoLoginPublicPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingGoogleReturn] = useState(() => readPendingOAuthReturn('aluno'));
  const [hasExternalAuthReturn] = useState(
    () => hasOAuthReturnInUrl() || Boolean(pendingGoogleReturn),
  );
  const isInstalledAlunoRoute = window.location.pathname.startsWith('/aluno/');
  const alunoAppBasePath = isInstalledAlunoRoute ? '/aluno' : '';
  const initialMode = ['/cadastro', '/aluno/cadastro'].includes(window.location.pathname)
    || searchParams.get('mode') === 'cadastro'
    ? 'cadastro'
    : 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [checkingExternalLogin, setCheckingExternalLogin] = useState(hasExternalAuthReturn);
  const [publicProfiles, setPublicProfiles] = useState<PortalAuthProfile[]>([]);
  const [isSelectingProfile, setIsSelectingProfile] = useState(false);
  const [pendingProfileKey, setPendingProfileKey] = useState<string | null>(null);
  const [message, setMessage] = useState<AuthMessage | null>(() => (
    searchParams.get('reason') === 'session_expired'
      ? { tone: 'error', text: 'Sua sessão expirou. Entre novamente para continuar com segurança.' }
      : null
  ));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const signup = useAlunoSignupForm({ setMessage });

  const redirectPath = useMemo(() => {
    const redirect = searchParams.get('redirect') || pendingGoogleReturn?.redirectPath;
    return getSafePublicAlunoRedirectPath(redirect);
  }, [pendingGoogleReturn, searchParams]);
  const hasExplicitRedirect = searchParams.has('redirect')
    || Boolean(pendingGoogleReturn?.redirectPath);

  const finishAuth = async (profile?: PortalAuthProfile): Promise<boolean> => {
    if (!profile) return false;

    if (alunoPublicAuthService.needsInitialAccess(profile)) {
      queryClient.clear();
      const redirect = hasExplicitRedirect
        ? redirectPath
        : PORTAL_CONTEXT_HOME_ROUTES[profile.tipo];
      if (!profile.contextId || (profile.tipo !== 'Aluno' && profile.tipo !== 'Responsavel')) {
        throw new Error('O contexto do primeiro acesso não está disponível. Entre novamente.');
      }
      const firstAccessPath = buildPortalFirstAccessPath(
        profile.tipo,
        profile.contextId,
        redirect,
      );
      if (!openAlunoAppDocument(firstAccessPath)) {
        navigate(firstAccessPath, { replace: true });
      }
      return true;
    }

    queryClient.clear();
    savePortalSession(profile);
    const postLoginRoute = resolveProfilePostLoginRoute(
      profile.tipo,
      hasExplicitRedirect ? redirectPath : null,
    );

    if (profile.tipo === 'Aluno') {
      if (!openAlunoAppDocument(postLoginRoute)) {
        navigate(postLoginRoute, { replace: true });
      }
      return true;
    }

    navigate(postLoginRoute, { replace: true });
    return true;
  };

  const continueWithProfiles = async (profiles: readonly PortalAuthProfile[]) => {
    if (profiles.length === 0) {
      throw new Error('Não há perfil ativo disponível para este acesso.');
    }
    if (profiles.length === 1) {
      return finishAuth(profiles[0]);
    }
    setPublicProfiles([...profiles]);
    return false;
  };

  const handleProfileSelect = async (profile: PortalAuthProfile) => {
    const profileKey = portalProfileKey(profile);
    setIsSelectingProfile(true);
    setPendingProfileKey(profileKey);
    setMessage(null);
    try {
      await finishAuth(profile);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error
          ? error.message
          : 'Não foi possível concluir o acesso com o perfil selecionado.',
      });
    } finally {
      setIsSelectingProfile(false);
      setPendingProfileKey(null);
    }
  };

  const handleProfileSelectionBack = async () => {
    setIsSelectingProfile(true);
    setMessage(null);
    try {
      await resetProfileSelectionSession({
        signOutLocal: () => supabase.auth.signOut({ scope: 'local' }),
        clearPortalSession,
        clearQueryCache: () => queryClient.clear(),
      });
      setPublicProfiles([]);
    } catch {
      setMessage({
        tone: 'error',
        text: 'Não foi possível encerrar esta sessão neste dispositivo. Tente novamente.',
      });
    } finally {
      setIsSelectingProfile(false);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkAuthRedirectReturn = async () => {
      let isLeavingLoginPage = false;

      try {
        if (!hasExternalAuthReturn) return;

        const authReturnError = getOAuthReturnError();
        if (authReturnError) {
          const expiredAuthLink = isExpiredAuthLink(authReturnError);
          setMessage({
            tone: 'error',
            text: expiredAuthLink
              ? EXPIRED_AUTH_LINK_MESSAGE
              : alunoPublicAuthService.getFriendlyAuthRedirectError(authReturnError),
            action: expiredAuthLink ? 'request-new-link' : undefined,
          });
          return;
        }

        // getSession aguarda a inicialização do cliente. Com
        // detectSessionInUrl ativo, o próprio supabase-js já troca o PKCE ou
        // restaura os tokens do fragmento; repetir exchangeCodeForSession aqui
        // consumiria o mesmo callback duas vezes.
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw new Error(
            alunoPublicAuthService.getFriendlyAuthRedirectError(sessionError.message),
          );
        }

        if (!data.session) {
          if (mounted) {
            setMessage({
              tone: 'error',
              text: 'Não foi possível recuperar a sessão do Google. Tente entrar novamente.',
            });
          }
          return;
        }

        const profiles = await alunoPublicAuthService.finishExternalLoginAndListProfiles();
        if (!mounted) return;
        isLeavingLoginPage = await continueWithProfiles(profiles);
      } catch (error) {
        if (!mounted) return;
        const errorText = error instanceof Error
          ? error.message
          : 'Não foi possível concluir a autenticação.';
        const expiredAuthLink = isExpiredAuthLink(errorText);
        setMessage({
          tone: 'error',
          text: expiredAuthLink ? EXPIRED_AUTH_LINK_MESSAGE : errorText,
          action: expiredAuthLink ? 'request-new-link' : undefined,
        });
      } finally {
        if (mounted) {
          clearPendingOAuthReturn('aluno');
          clearOAuthReturnParams();
          // Quando o OAuth terminou com redirecionamento, mantenha a validação
          // visível até o React Router montar a próxima rota. Desligá-la aqui
          // expõe a tela de login por um quadro entre /login e /aluno.
          if (!isLeavingLoginPage) setCheckingExternalLogin(false);
        }
      }
    };

    void checkAuthRedirectReturn();
    return () => {
      mounted = false;
    };
  }, [hasExternalAuthReturn]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage(null);
    signup.setSignupStep('dados');
    const next = new URLSearchParams(searchParams);
    next.set('mode', nextMode);
    setSearchParams(next, { replace: true });
  };

  const handleLogin = async (event: FormEvent, turnstileToken: string) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const profiles = await alunoPublicAuthService.loginAndListProfiles(
        loginIdentifier,
        loginPassword,
        turnstileToken,
      );
      await continueWithProfiles(profiles);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível entrar.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (event: FormEvent, turnstileToken: string) => {
    event.preventDefault();
    setMessage(null);

    if (!signup.validateSignupPersonalData()) {
      signup.setSignupStep('dados');
      return;
    }
    if (!signup.validateSignupAddress()) return;

    setLoading(true);
    const { email, ...signupValues } = signup.values;
    try {
      const result = await alunoPublicAuthService.signup({
        ...signupValues,
        email,
        turnstileToken,
        redirectPath: hasExplicitRedirect ? redirectPath : undefined,
      });

      if (result.emailConfirmationRequired) {
        const next = new URLSearchParams(searchParams);
        next.set('mode', 'login');
        setMode('login');
        setSearchParams(next, { replace: true });
        setLoginIdentifier(email);
        setMessage({
          tone: 'success',
          text: `Cadastro criado. Enviamos um link para ${email}. Confirme o e-mail para ativar sua conta; só então você poderá entrar e concluir a compra. Verifique também Spam ou Lixo eletrônico.`,
        });
        return;
      }
      await finishAuth(result.profile || undefined);
    } catch (error) {
      const existingAccount = isPublicAlunoAlreadyRegisteredError(error);
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível criar seu cadastro.',
        action: existingAccount ? 'existing-account' : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage(null);
    try {
      await alunoPublicAuthService.loginWithGoogle(redirectPath);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error
          ? error.message
          : 'Não foi possível iniciar o login com Google.',
      });
      setLoading(false);
    }
  };

  const formattedDate = currentTime.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const formattedTime = currentTime.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dailyPhrase = useMemo(
    () => getRandomMotivationalPhrase(STUDENT_LOGIN_MOTIVATIONAL_PHRASES),
    [],
  );

  return {
    checkingExternalLogin,
    heroProps: {
      formattedDate,
      formattedTime,
      dailyPhrase,
      navigateTo: navigate,
    },
    profileSelectorProps: {
      profiles: publicProfiles,
      isSelecting: isSelectingProfile,
      pendingProfileKey,
      onSelect: handleProfileSelect,
      onBack: handleProfileSelectionBack,
    },
    cardProps: {
      mode,
      loading,
      message,
      loginIdentifier,
      loginPassword,
      showLoginPassword,
      ...signup.cardProps,
      recoveryHref: `${alunoAppBasePath}/recuperar-senha`,
      onModeChange: switchMode,
      onExistingAccountLogin: () => {
        setLoginIdentifier(signup.values.email);
        switchMode('login');
      },
      onLoginIdentifierChange: setLoginIdentifier,
      onLoginPasswordChange: setLoginPassword,
      onToggleLoginPassword: () => setShowLoginPassword((previous) => !previous),
      onSignupBack: () => {
        signup.setSignupStep('dados');
        setMessage(null);
      },
      onLogin: handleLogin,
      onSignupNext: signup.handleSignupNext,
      onSignup: handleSignup,
      onGoogleLogin: handleGoogleLogin,
    },
  };
};

export type AlunoLoginPublicPageModel = ReturnType<typeof useAlunoLoginPublicPage>;
