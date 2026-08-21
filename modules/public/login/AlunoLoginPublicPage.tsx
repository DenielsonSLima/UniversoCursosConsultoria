import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  alunoPublicAuthService,
  getSafePublicAlunoRedirectPath,
  isPublicAlunoAlreadyRegisteredError,
} from './aluno-public-auth.service';
import { supabase } from '../../../lib/supabase';
import { savePortalSession, type PortalAuthProfile } from '../../login/portal-session';
import { resolveProfilePostLoginRoute } from '../../login/profile-selection';
import PortalProfileSelector, { portalProfileKey } from '../../login/components/PortalProfileSelector';
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

const openAlunoAppDocument = (path: string): boolean => {
  if (path !== '/aluno' && !path.startsWith('/aluno/')) return false;

  // O Safari captura manifesto, nome e ícone no carregamento do documento.
  // Uma navegação completa impede que a identidade global do site permaneça
  // em cache quando o aluno entra no portal a partir do login público.
  window.location.replace(path);
  return true;
};

const isExpiredAuthLink = (message: string) => {
  // Não disparamos e-mail daqui: o CTA abre o fluxo protegido por Turnstile,
  // sem expor se o endereço possui uma conta. "invalid" isolado é comum em
  // callbacks OAuth e não deve ser confundido com um convite vencido.
  const lower = String(message || '').toLowerCase();
  return (
    lower.includes('token')
    || lower.includes('expired')
    || lower.includes('otp')
  );
};

const EXPIRED_AUTH_LINK_MESSAGE =
  'Este link de acesso expirou ou já foi usado. Se este era seu primeiro acesso, você ainda não possui senha: solicite um novo link para criar sua senha e aceitar os termos. Se sua conta já estava ativa, use o mesmo fluxo para recuperar a senha.';

const AlunoLoginPublicPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingGoogleReturn] = useState(() => readPendingOAuthReturn('aluno'));
  const [hasExternalAuthReturn] = useState(
    () => hasOAuthReturnInUrl() || Boolean(pendingGoogleReturn),
  );
  const isInstalledAlunoRoute = window.location.pathname.startsWith('/aluno/');
  const alunoAppBasePath = isInstalledAlunoRoute ? '/aluno' : '';
  const initialMode = ['/cadastro', '/aluno/cadastro'].includes(window.location.pathname) || searchParams.get('mode') === 'cadastro'
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
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [racaCor, setRacaCor] = useState('');
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
    const hasMinLength = password.length >= 8;
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

  const finishAuth = async (profile?: PortalAuthProfile): Promise<boolean> => {
    if (!profile) return false;

    if (alunoPublicAuthService.needsInitialAccess(profile)) {
      queryClient.clear();
      const redirect = hasExplicitRedirect ? redirectPath : '/aluno/';
      const firstAccessParams = new URLSearchParams();
      firstAccessParams.set('next', redirect);
      if (profile.contextId) {
        firstAccessParams.set('context', profile.contextId);
      }
      openAlunoAppDocument(`/aluno/primeiro-acesso?${firstAccessParams.toString()}`);
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
        text: error instanceof Error ? error.message : 'Não foi possível concluir o acesso com o perfil selecionado.',
      });
    } finally {
      setIsSelectingProfile(false);
      setPendingProfileKey(null);
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
    if (!sexo) {
      setMessage({ tone: 'error', text: 'Selecione uma opção de sexo para continuar.' });
      return false;
    }
    if (!racaCor) {
      setMessage({ tone: 'error', text: 'Selecione uma opção de raça/cor para continuar.' });
      return false;
    }
    if (telefone.replace(/\D/g, '').length < 10) {
      setMessage({ tone: 'error', text: 'Informe um WhatsApp válido para continuar.' });
      return false;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setMessage({
        tone: 'error',
        text: 'A senha deve ter no mínimo 8 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.',
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

  const handleSignup = async (
    event: React.FormEvent,
    turnstileToken: string,
  ) => {
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
        sexo,
        racaCor,
        password,
        acceptedTerms,
        cep,
        endereco,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
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
      <main className="grid min-h-screen lg:grid-cols-[1.04fr_0.96fr]">
        <AlunoLoginHero {...heroProps} />
        <section className="aluno-auth-typography relative flex min-h-screen flex-col items-center justify-start bg-slate-50 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-slate-900 sm:px-8 sm:py-8 lg:justify-center">
          <AlunoLoginMobileHeader {...heroProps} />
          {publicProfiles.length > 1 ? (
            <PortalProfileSelector
              profiles={publicProfiles}
              isSelecting={isSelectingProfile}
              pendingProfileKey={pendingProfileKey}
              onSelect={handleProfileSelect}
              onBack={() => {
                setPublicProfiles([]);
                setMessage(null);
              }}
            />
          ) : (
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
            sexo={sexo}
            racaCor={racaCor}
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
            recoveryHref={`${alunoAppBasePath}/recuperar-senha`}
            onModeChange={switchMode}
            onExistingAccountLogin={() => {
              setLoginIdentifier(email);
              switchMode('login');
            }}
            onLoginIdentifierChange={setLoginIdentifier}
            onLoginPasswordChange={setLoginPassword}
            onToggleLoginPassword={() => setShowLoginPassword((prev) => !prev)}
            onNomeChange={(value) => setNome(value.toLocaleUpperCase('pt-BR'))}
            onCpfChange={setCpf}
            onDataNascimentoChange={setDataNascimento}
            onSexoChange={setSexo}
            onRacaCorChange={setRacaCor}
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
          )}

          <div className="mt-5 flex w-full max-w-[560px] justify-center pb-1 sm:justify-end sm:pr-2 lg:absolute lg:bottom-6 lg:right-6 lg:mt-0 lg:w-auto lg:max-w-none lg:pb-0 lg:pr-0">
            <ArkhenSignature tone="dark" />
          </div>
        </section>
      </main>
    </div>
  );
};

export default AlunoLoginPublicPage;
