import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { alunoPublicAuthService } from './aluno-public-auth.service';
import { supabase } from '../../../lib/supabase';
import { savePortalSession } from '../../login/portal-session';
import { isValidCpf, isValidEmail } from '../../shared/utils/identityValidation';
import DailabsSignature from '../../shared/components/DailabsSignature';
import AccessCheckingScreen from '../../shared/components/AccessCheckingScreen';
import {
  STUDENT_LOGIN_MOTIVATIONAL_PHRASES,
  getRandomMotivationalPhrase,
} from '../../login/motivationalPhrases';
import AlunoLoginAuthCard from './AlunoLoginAuthCard';
import { AlunoLoginHero, AlunoLoginMobileHeader } from './AlunoLoginHero';
import {
  clearAuthReturnParams,
  getAuthReturnCode,
  getAuthReturnError,
  hasAuthReturnInUrl,
  type AuthMessage,
  type AuthMode,
} from './aluno-login.utils';

const AlunoLoginPublicPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'cadastro' ? 'cadastro' : 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [checkingExternalLogin, setCheckingExternalLogin] = useState(hasAuthReturnInUrl);
  const [message, setMessage] = useState<AuthMessage | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [password, setPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const passwordChecks = useMemo(() => {
    const hasMinLength = password.length >= 6;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const score = Number(hasMinLength) + Number(hasUppercase) + Number(hasLowercase) + Number(hasNumber);
    const strength = score >= 3 ? 'Forte' : score >= 2 ? 'Médio' : 'Fraco';

    return { hasMinLength, hasUppercase, hasLowercase, hasNumber, score, strength } as const;
  }, [password]);

  const redirectPath = useMemo(() => {
    const redirect = searchParams.get('redirect');
    if (!redirect) return '/aluno';
    try {
      const decoded = decodeURIComponent(redirect);
      return decoded.startsWith('/') ? decoded : '/aluno';
    } catch {
      return '/aluno';
    }
  }, [searchParams]);
  const hasExplicitRedirect = searchParams.has('redirect');

  const finishAuth = async (profile?: { tipo?: string; acceptedTermsAt?: string | null; requiresPasswordReset?: boolean }) => {
    if (!profile) return;

    if (alunoPublicAuthService.needsInitialAccess(profile)) {
      const redirect = hasExplicitRedirect ? redirectPath : '/aluno';
      const firstAccessParams = new URLSearchParams();
      firstAccessParams.set('next', redirect);
      navigate(`/primeiro-acesso?${firstAccessParams.toString()}`, { replace: true });
      return;
    }

    savePortalSession(profile as any);

    if (hasExplicitRedirect) {
      navigate(redirectPath);
      return;
    }
    navigate(profile?.tipo === 'Aluno' ? '/aluno' : redirectPath);
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
      try {
        if (!hasAuthReturnInUrl()) return;

        const authReturnError = getAuthReturnError();
        if (authReturnError) {
          setMessage({
            tone: 'error',
            text: alunoPublicAuthService.getFriendlyAuthRedirectError(authReturnError),
          });
          return;
        }

        const authCode = getAuthReturnCode();
        let { data } = await supabase.auth.getSession();
        const hasAuthReturn = hasAuthReturnInUrl();

        if (authCode) {
          const { data: exchangedData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
          if (exchangeError) {
            throw new Error(alunoPublicAuthService.getFriendlyAuthRedirectError(exchangeError.message));
          }
          data = exchangedData;
          clearAuthReturnParams();
        }

        if (!data.session) {
          if (hasAuthReturn && mounted) {
            setMessage({
              tone: 'error',
              text: 'Não foi possível recuperar a sessão de confirmação. Tente entrar novamente para receber um novo link, se necessário.',
            });
          }
          return;
        }

        const profile = await alunoPublicAuthService.finishExternalLogin();
        if (!mounted) return;
        await finishAuth(profile);
      } catch (error) {
        if (!mounted) return;
        setMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'Não foi possível concluir a autenticação.',
        });
      } finally {
        if (mounted) setCheckingExternalLogin(false);
      }
    };

    checkAuthRedirectReturn();
    return () => {
      mounted = false;
    };
  }, []);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage(null);
    const next = new URLSearchParams(searchParams);
    next.set('mode', nextMode);
    setSearchParams(next, { replace: true });
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const profile = await alunoPublicAuthService.login(loginIdentifier, loginPassword);
      await finishAuth(profile);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível entrar.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!isValidEmail(email)) {
      setMessage({ tone: 'error', text: 'Informe um e-mail válido. Ele será usado como login do aluno.' });
      return;
    }
    if (!isValidCpf(cpf)) {
      setMessage({ tone: 'error', text: 'Informe um CPF válido para concluir o cadastro.' });
      return;
    }
    if (!dataNascimento) {
      setMessage({ tone: 'error', text: 'Informe a data de nascimento para concluir o cadastro.' });
      return;
    }
    if (password.length < 6 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setMessage({
        tone: 'error',
        text: 'A senha deve ter no mínimo 6 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.',
      });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ tone: 'error', text: 'As senhas não conferem.' });
      return;
    }
    if (!acceptedTerms) {
      setMessage({ tone: 'error', text: 'Você precisa aceitar os Termos de Uso para finalizar o cadastro.' });
      return;
    }

    setLoading(true);
    try {
      const result = await alunoPublicAuthService.signup({
        nome,
        email,
        telefone,
        cpf,
        dataNascimento,
        password,
        acceptedTerms,
      });

      if (result.emailConfirmationRequired) {
        const next = new URLSearchParams(searchParams);
        next.set('mode', 'login');
        setMode('login');
        setSearchParams(next, { replace: true });
        setLoginIdentifier(email);
        setMessage({
          tone: 'success',
          text: 'Cadastro criado. Confirme seu e-mail e depois entre para concluir a compra.',
        });
        return;
      }
      await finishAuth(result.profile || undefined);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível criar seu cadastro.',
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
        text: error instanceof Error ? error.message : 'Não foi possível iniciar o login com Google.',
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
    []
  );

  if (checkingExternalLogin) {
    return <AccessCheckingScreen portal="Aluno" />;
  }

  const heroProps = {
    formattedDate,
    formattedTime,
    dailyPhrase,
    navigateTo: navigate,
  };

  return (
    <div className="relative min-h-screen bg-slate-50">
      <DailabsSignature tone="dark" className="absolute bottom-6 right-6 z-30" />
      <main className="grid min-h-screen lg:grid-cols-[1.04fr_0.96fr]">
        <AlunoLoginHero {...heroProps} />
        <section className="flex flex-col items-center justify-center bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
          <AlunoLoginMobileHeader {...heroProps} />
          <AlunoLoginAuthCard
            mode={mode}
            loading={loading}
            message={message}
            loginIdentifier={loginIdentifier}
            loginPassword={loginPassword}
            showLoginPassword={showLoginPassword}
            nome={nome}
            cpf={cpf}
            dataNascimento={dataNascimento}
            telefone={telefone}
            email={email}
            password={password}
            showSignupPassword={showSignupPassword}
            confirmPassword={confirmPassword}
            showSignupConfirmPassword={showSignupConfirmPassword}
            acceptedTerms={acceptedTerms}
            passwordChecks={passwordChecks}
            onModeChange={switchMode}
            onLoginIdentifierChange={setLoginIdentifier}
            onLoginPasswordChange={setLoginPassword}
            onToggleLoginPassword={() => setShowLoginPassword((prev) => !prev)}
            onNomeChange={(value) => setNome(value.toLocaleUpperCase('pt-BR'))}
            onCpfChange={setCpf}
            onDataNascimentoChange={setDataNascimento}
            onTelefoneChange={setTelefone}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onToggleSignupPassword={() => setShowSignupPassword((prev) => !prev)}
            onConfirmPasswordChange={setConfirmPassword}
            onToggleSignupConfirmPassword={() => setShowSignupConfirmPassword((prev) => !prev)}
            onAcceptedTermsChange={setAcceptedTerms}
            onLogin={handleLogin}
            onSignup={handleSignup}
            onGoogleLogin={handleGoogleLogin}
          />
        </section>
      </main>
    </div>
  );
};

export default AlunoLoginPublicPage;
