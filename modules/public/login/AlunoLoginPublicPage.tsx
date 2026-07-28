import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  alunoPublicAuthService,
  getSafePublicAlunoRedirectPath,
} from './aluno-public-auth.service';
import { supabase } from '../../../lib/supabase';
import { savePortalSession } from '../../login/portal-session';
import { isValidCpf, isValidEmail } from '../../shared/utils/identityValidation';
import { formatCep, lookupBrazilianCep } from '../../shared/utils/brazilianCep';
import ArkhenSignature from '../../shared/components/ArkhenSignature';
import AccessCheckingScreen from '../../shared/components/AccessCheckingScreen';
import {
  STUDENT_LOGIN_MOTIVATIONAL_PHRASES,
  getRandomMotivationalPhrase,
} from '../../login/motivationalPhrases';
import AlunoLoginAuthCard from './AlunoLoginAuthCard';
import { AlunoLoginHero, AlunoLoginMobileHeader } from './AlunoLoginHero';
import {
  type AuthMessage,
  type AuthMode,
} from './aluno-login.utils';
import { isPublicAlunoOlderThanTen } from './aluno-birth-date';
import {
  clearOAuthReturnParams,
  clearPendingOAuthReturn,
  getOAuthReturnError,
  hasOAuthReturnInUrl,
  readPendingOAuthReturn,
} from '../../shared/auth/oauth-return-state';

type SignupStep = 'dados' | 'endereco';
type CepStatus = 'idle' | 'loading' | 'resolved' | 'not-found' | 'error';

const AlunoLoginPublicPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingGoogleReturn] = useState(() => readPendingOAuthReturn('aluno'));
  const [hasExternalAuthReturn] = useState(
    () => hasOAuthReturnInUrl() || Boolean(pendingGoogleReturn),
  );
  const initialMode = window.location.pathname === '/cadastro' || searchParams.get('mode') === 'cadastro'
    ? 'cadastro'
    : 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [checkingExternalLogin, setCheckingExternalLogin] = useState(hasExternalAuthReturn);
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
  const [signupStep, setSignupStep] = useState<SignupStep>('dados');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle');

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
    const redirect = searchParams.get('redirect') || pendingGoogleReturn?.redirectPath;
    return getSafePublicAlunoRedirectPath(redirect);
  }, [pendingGoogleReturn, searchParams]);
  const hasExplicitRedirect = searchParams.has('redirect') || Boolean(pendingGoogleReturn?.redirectPath);

  const finishAuth = async (
    profile?: { tipo?: string; acceptedTermsAt?: string | null; requiresPasswordReset?: boolean },
  ): Promise<boolean> => {
    if (!profile) return false;

    if (alunoPublicAuthService.needsInitialAccess(profile)) {
      const redirect = hasExplicitRedirect ? redirectPath : '/aluno';
      const firstAccessParams = new URLSearchParams();
      firstAccessParams.set('next', redirect);
      navigate(`/primeiro-acesso?${firstAccessParams.toString()}`, { replace: true });
      return true;
    }

    savePortalSession(profile as any);

    if (hasExplicitRedirect) {
      navigate(redirectPath, { replace: true });
      return true;
    }
    navigate(profile?.tipo === 'Aluno' ? '/aluno' : redirectPath, { replace: true });
    return true;
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (signupStep !== 'endereco') return undefined;

    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepStatus('idle');
      return undefined;
    }

    const controller = new globalThis.AbortController();
    const timer = window.setTimeout(async () => {
      setCepStatus('loading');
      try {
        const address = await lookupBrazilianCep(cep, controller.signal);
        if (!address) {
          setCepStatus('not-found');
          return;
        }

        setCep(address.cep);
        setEndereco(address.endereco);
        setBairro(address.bairro);
        setCidade(address.cidade);
        setUf(address.uf);
        setCepStatus('resolved');
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setCepStatus('error');
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cep, signupStep]);

  useEffect(() => {
    let mounted = true;

    const checkAuthRedirectReturn = async () => {
      let isLeavingLoginPage = false;

      try {
        if (!hasExternalAuthReturn) return;

        const authReturnError = getOAuthReturnError();
        if (authReturnError) {
          setMessage({
            tone: 'error',
            text: alunoPublicAuthService.getFriendlyAuthRedirectError(authReturnError),
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

        const profile = await alunoPublicAuthService.finishExternalLogin();
        if (!mounted) return;
        isLeavingLoginPage = await finishAuth(profile);
      } catch (error) {
        if (!mounted) return;
        setMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'Não foi possível concluir a autenticação.',
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

    checkAuthRedirectReturn();
    return () => {
      mounted = false;
    };
  }, [hasExternalAuthReturn]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage(null);
    setSignupStep('dados');
    const next = new URLSearchParams(searchParams);
    next.set('mode', nextMode);
    setSearchParams(next, { replace: true });
  };

  const handleLogin = async (
    event: React.FormEvent,
    turnstileToken: string,
  ) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const profile = await alunoPublicAuthService.login(
        loginIdentifier,
        loginPassword,
        turnstileToken,
      );
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

  const validateSignupPersonalData = () => {
    setMessage(null);

    if (nome.trim().length < 3) {
      setMessage({ tone: 'error', text: 'Informe o nome completo para continuar.' });
      return false;
    }
    if (!isValidEmail(email)) {
      setMessage({ tone: 'error', text: 'Informe um e-mail válido. Ele será usado como login do aluno.' });
      return false;
    }
    if (!isValidCpf(cpf)) {
      setMessage({ tone: 'error', text: 'Informe um CPF válido para concluir o cadastro.' });
      return false;
    }
    if (!dataNascimento) {
      setMessage({ tone: 'error', text: 'Informe a data de nascimento para concluir o cadastro.' });
      return false;
    }
    if (!isPublicAlunoOlderThanTen(dataNascimento)) {
      setMessage({ tone: 'error', text: 'O cadastro é permitido somente para alunos com mais de 10 anos de idade.' });
      return false;
    }
    if (telefone.replace(/\D/g, '').length < 10) {
      setMessage({ tone: 'error', text: 'Informe um WhatsApp válido para continuar.' });
      return false;
    }
    if (password.length < 6 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setMessage({
        tone: 'error',
        text: 'A senha deve ter no mínimo 6 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.',
      });
      return false;
    }
    if (password !== confirmPassword) {
      setMessage({ tone: 'error', text: 'As senhas não conferem.' });
      return false;
    }
    if (!acceptedTerms) {
      setMessage({ tone: 'error', text: 'Você precisa aceitar os Termos de Uso para finalizar o cadastro.' });
      return false;
    }

    return true;
  };

  const handleSignupNext = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateSignupPersonalData()) return;
    setSignupStep('endereco');
    setMessage(null);
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!validateSignupPersonalData()) {
      setSignupStep('dados');
      return;
    }

    if (cep.replace(/\D/g, '').length !== 8) {
      setMessage({ tone: 'error', text: 'Informe um CEP válido com 8 números.' });
      return;
    }
    if (!endereco.trim() || !numero.trim() || !bairro.trim() || !cidade.trim() || uf.trim().length !== 2) {
      setMessage({
        tone: 'error',
        text: 'Complete endereço, número, bairro, cidade e UF para concluir o cadastro.',
      });
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
        cep,
        endereco,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
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
      <ArkhenSignature tone="dark" className="absolute bottom-6 right-6 z-30" />
      <main className="grid min-h-screen lg:grid-cols-[1.04fr_0.96fr]">
        <AlunoLoginHero {...heroProps} />
        <section className="aluno-auth-typography flex flex-col items-center justify-center bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
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
            signupStep={signupStep}
            cep={cep}
            endereco={endereco}
            numero={numero}
            complemento={complemento}
            bairro={bairro}
            cidade={cidade}
            uf={uf}
            cepStatus={cepStatus}
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
            onCepChange={(value) => {
              setCepStatus('idle');
              setCep(formatCep(value));
            }}
            onEnderecoChange={(value) => setEndereco(value.toLocaleUpperCase('pt-BR'))}
            onNumeroChange={(value) => setNumero(value.toLocaleUpperCase('pt-BR'))}
            onComplementoChange={(value) => setComplemento(value.toLocaleUpperCase('pt-BR'))}
            onBairroChange={(value) => setBairro(value.toLocaleUpperCase('pt-BR'))}
            onCidadeChange={(value) => setCidade(value.toLocaleUpperCase('pt-BR'))}
            onUfChange={(value) => setUf(value.toLocaleUpperCase('pt-BR').slice(0, 2))}
            onSignupBack={() => {
              setSignupStep('dados');
              setMessage(null);
            }}
            onLogin={handleLogin}
            onSignupNext={handleSignupNext}
            onSignup={handleSignup}
            onGoogleLogin={handleGoogleLogin}
          />
        </section>
      </main>
    </div>
  );
};

export default AlunoLoginPublicPage;
