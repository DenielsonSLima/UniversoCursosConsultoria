import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useNavigate } from 'react-router';
import { consumePasswordSetupMarker, supabase } from '../../../lib/supabase';
import { getPortalProfile } from '../portal-session';
import { loginService } from '../login.service';
import type { TurnstileStatus } from '../../shared/auth/TurnstileWidget';
import {
  clearRecoveryAuthParams,
  getAuthReturnParam,
  getPasswordSetupTypeInUrl,
  type PasswordRecoveryPageProps,
  type PasswordSetupKind,
  type RecoveryAuthorization,
  type RecoveryMode,
} from './password-recovery-auth';

export const usePasswordRecovery = ({ appFlow = false }: PasswordRecoveryPageProps) => {
  const navigate = useNavigate();
  const recoverySource = new URLSearchParams(window.location.search).get('source');
  const isResponsavelRecovery = recoverySource === 'responsavel';
  const alunoLoginPath = appFlow || recoverySource === 'login-app'
    ? '/aluno/login-app'
    : window.location.pathname.startsWith('/aluno/')
      ? '/aluno/entrar'
      : '/login';
  const [mode, setMode] = useState<RecoveryMode>('request');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>('loading');
  const [recoveryAuthorization, setRecoveryAuthorization] =
    useState<RecoveryAuthorization | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const loginRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoverySubmitInFlightRef = useRef(false);

  const passwordChecks = useMemo(() => {
    const hasMinLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    return {
      hasMinLength,
      hasUppercase,
      hasLowercase,
      hasNumber,
      isStrong: hasMinLength && hasUppercase && hasLowercase && hasNumber,
    };
  }, [password]);

  useEffect(() => {
    let mounted = true;
    const passwordSetupType = getPasswordSetupTypeInUrl();
    const returnError = getAuthReturnParam('error_description') || getAuthReturnParam('error');
    const code = getAuthReturnParam('code');
    const recoveryAccessToken = getAuthReturnParam('access_token');

    const authorizePasswordSetup = (
      session: { access_token: string; user: { id: string; email?: string } },
      kind: PasswordSetupKind,
    ) => {
      if (!mounted) return;
      setRecoveryAuthorization({
        userId: session.user.id,
        accessToken: session.access_token,
        kind,
      });
      setMode('reset');
      if (session.user.email) setIdentifier(session.user.email);
      clearRecoveryAuthParams();
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        authorizePasswordSetup(session, 'recovery');
        return;
      }

      if (event === 'SIGNED_OUT') {
        setRecoveryAuthorization(null);
        return;
      }

      if (session) {
        setRecoveryAuthorization((authorization) => (
          authorization
          && authorization.userId === session.user.id
          && authorization.accessToken === session.access_token
            ? authorization
            : null
        ));
      }
    });

    const detectPasswordSetupSession = async () => {
      if (returnError) {
        clearRecoveryAuthParams();
        if (mounted) {
          setMessage({
            tone: 'error',
            text: 'O link de recuperação é inválido ou expirou. Solicite um novo link abaixo.',
          });
        }
        return;
      }

      // getSession aguarda a inicializacao do cliente, inclusive a troca PKCE
      // automática. Somente os eventos/markers confiáveis ou os tokens do
      // callback de recovery/convite autorizam a alteração da senha.
      const { data: currentSessionData } = await supabase.auth.getSession();
      const currentSession = currentSessionData.session;

      if (
        passwordSetupType
        && recoveryAccessToken
        && currentSession?.access_token === recoveryAccessToken
      ) {
        authorizePasswordSetup(currentSession, passwordSetupType);
        return;
      }

      const markerKind = currentSession
        ? consumePasswordSetupMarker(
            currentSession.user.id,
            currentSession.access_token,
          )
        : null;
      if (currentSession && markerKind) {
        authorizePasswordSetup(currentSession, markerKind);
        return;
      }

      if (code || passwordSetupType || recoveryAccessToken) {
        clearRecoveryAuthParams();
        setMessage({
          tone: 'error',
          text: passwordSetupType === 'invite'
            ? 'O link de primeiro acesso não criou uma sessão válida. Peça o reenvio do convite.'
            : 'O link de recuperação não criou uma sessão válida. Solicite um novo link abaixo.',
        });
      }
    };

    void detectPasswordSetupSession();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      if (loginRedirectTimerRef.current) {
        clearTimeout(loginRedirectTimerRef.current);
        loginRedirectTimerRef.current = null;
      }
    };
  }, []);

  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (
      recoverySubmitInFlightRef.current
      || !turnstileToken
      || turnstileStatus !== 'verified'
    ) return;

    recoverySubmitInFlightRef.current = true;
    setIsLoading(true);
    const verifiedToken = turnstileToken;
    setTurnstileToken('');

    try {
      const genericMessage = await loginService.requestPasswordRecovery(
        identifier,
        verifiedToken,
        appFlow
          ? '/aluno/recuperar-senha-app'
          : isResponsavelRecovery
            ? '/recuperar-senha?source=responsavel'
            : '/recuperar-senha',
      );
      setMessage({ tone: 'success', text: genericMessage });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error
          ? error.message
          : 'A verificação de segurança não pôde ser concluída. Tente novamente.',
      });
    } finally {
      recoverySubmitInFlightRef.current = false;
      setIsLoading(false);
      setTurnstileResetSignal((value) => value + 1);
    }
  };

  const confirmReset = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!recoveryAuthorization) {
      setMessage({
        tone: 'error',
        text: 'Abra o link mais recente enviado ao seu e-mail antes de definir uma nova senha.',
      });
      setMode('request');
      return;
    }

    const { data: currentSessionData } = await supabase.auth.getSession();
    const currentSession = currentSessionData.session;
    if (
      !currentSession
      || currentSession.user.id !== recoveryAuthorization.userId
      || currentSession.access_token !== recoveryAuthorization.accessToken
    ) {
      setRecoveryAuthorization(null);
      setMode('request');
      setMessage({
        tone: 'error',
        text: 'A sessão mudou antes da redefinição. Abra novamente o link enviado ao seu e-mail.',
      });
      return;
    }

    if (!passwordChecks.isStrong) {
      setMessage({
        tone: 'error',
        text: 'A nova senha precisa ter no mínimo 8 caracteres, 1 maiúscula, 1 minúscula e 1 número.',
      });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ tone: 'error', text: 'As senhas não conferem.' });
      return;
    }

    setIsLoading(true);

    try {
      const error = await loginService.updatePassword(password);
      if (error) {
        setMessage({ tone: 'error', text: error });
        return;
      }

      let postResetPath = isResponsavelRecovery ? '/login' : alunoLoginPath;
      if (!isResponsavelRecovery) {
        try {
          const profile = await getPortalProfile({ authenticatedUser: currentSession.user });
          if (profile?.tipo && ['Gestor', 'Professor', 'Coordenador'].includes(profile.tipo)) {
            postResetPath = '/sistema/login';
          } else if (profile?.tipo === 'Responsavel') {
            postResetPath = '/login';
          } else if (
            ['usuarios_sistema', 'cadastro_professor'].includes(
              String(currentSession.user.user_metadata?.origem || ''),
            )
          ) {
            postResetPath = '/sistema/login';
          }
        } catch (profileError) {
          console.warn(
            'A senha foi alterada, mas não foi possível determinar o login de destino.',
            profileError,
          );
        }
      }

      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) {
        console.warn(
          'A senha foi alterada, mas a sessão local não pôde ser encerrada.',
          signOutError,
        );
      }

      setMessage({
        tone: 'success',
        text: recoveryAuthorization.kind === 'invite'
          ? 'Senha criada com sucesso. Você já pode entrar no sistema.'
          : 'Senha alterada com sucesso. Você já pode entrar com a nova senha.',
      });

      loginRedirectTimerRef.current = setTimeout(() => {
        loginRedirectTimerRef.current = null;
        navigate(postResetPath);
      }, 1000);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível alterar a senha.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const requirements = [
    { label: '8+ caracteres', valid: passwordChecks.hasMinLength },
    { label: 'Letra maiúscula', valid: passwordChecks.hasUppercase },
    { label: 'Letra minúscula', valid: passwordChecks.hasLowercase },
    { label: 'Um número', valid: passwordChecks.hasNumber },
  ];

  return {
    alunoLoginPath,
    mode,
    identifier,
    setIdentifier,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    isLoading,
    message,
    showPassword,
    setShowPassword,
    turnstileToken,
    turnstileResetSignal,
    turnstileStatus,
    setTurnstileStatus,
    setTurnstileToken,
    showConfirmation,
    setShowConfirmation,
    requirements,
    isFirstAccess: recoveryAuthorization?.kind === 'invite',
    onBackToLogin: () => navigate(alunoLoginPath),
    requestReset,
    confirmReset,
  };
};

export type PasswordRecoveryModel = ReturnType<typeof usePasswordRecovery>;
