import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginService } from './login.service';
import { consumePasswordRecoveryMarker, supabase } from '../../lib/supabase';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import ArkhenSignature from '../shared/components/ArkhenSignature';
import TurnstileWidget from '../shared/auth/TurnstileWidget';

type RecoveryMode = 'request' | 'reset';
interface RecoveryAuthorization {
  userId: string;
  accessToken: string;
}

const RECOVERY_STEPS = [
  {
    number: '01',
    title: 'Solicite o link',
    description: 'Informe sua matrícula de acesso ou e-mail.',
  },
  {
    number: '02',
    title: 'Abra o link seguro',
    description: 'Use o link recebido por e-mail ou pela secretaria.',
  },
  {
    number: '03',
    title: 'Crie uma nova senha',
    description: 'Defina a senha e volte ao Portal do Aluno.',
  },
] as const;

const getAuthReturnParam = (name: string) => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get(name) || searchParams.get(name);
};

const hasRecoveryTypeInUrl = () => getAuthReturnParam('type') === 'recovery';

const clearRecoveryAuthParams = () => {
  const authKeys = [
    'code',
    'access_token',
    'refresh_token',
    'token_type',
    'expires_in',
    'expires_at',
    'type',
    'error',
    'error_code',
    'error_description',
  ];
  const url = new URL(window.location.href);
  authKeys.forEach((key) => url.searchParams.delete(key));

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  authKeys.forEach((key) => hashParams.delete(key));
  const nextHash = hashParams.toString();

  window.history.replaceState(
    {},
    document.title,
    `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ''}`,
  );
};

const PasswordRecoveryPage: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<RecoveryMode>('request');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [recoveryAuthorization, setRecoveryAuthorization] =
    useState<RecoveryAuthorization | null>(null);

  const [showConfirmation, setShowConfirmation] = useState(false);

  const passwordChecks = useMemo(() => {
    const hasMinLength = password.length >= 6;
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
    const recoveryType = hasRecoveryTypeInUrl();
    const returnError = getAuthReturnParam('error_description') || getAuthReturnParam('error');
    const code = getAuthReturnParam('code');
    const recoveryAccessToken = getAuthReturnParam('access_token');

    const authorizeRecovery = (
      session: { access_token: string; user: { id: string; email?: string } },
    ) => {
      if (!mounted) return;
      setRecoveryAuthorization({
        userId: session.user.id,
        accessToken: session.access_token,
      });
      setMode('reset');
      if (session.user.email) setIdentifier(session.user.email);
      clearRecoveryAuthParams();
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        authorizeRecovery(session);
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

    const detectRecoverySession = async () => {
      if (returnError) {
        if (mounted) {
          setMessage({
            tone: 'error',
            text: 'O link de recuperação é inválido ou expirou. Solicite um novo link abaixo.',
          });
        }
        return;
      }

      // getSession aguarda a inicializacao do cliente, inclusive a troca PKCE
      // automatica. Somente PASSWORD_RECOVERY (marker/evento) ou os tokens
      // explicitos de recovery autorizam a alteracao.
      const { data: currentSessionData } = await supabase.auth.getSession();
      const currentSession = currentSessionData.session;

      if (
        recoveryType
        && recoveryAccessToken
        && currentSession?.access_token === recoveryAccessToken
      ) {
        authorizeRecovery(currentSession);
        return;
      }

      if (
        currentSession
        && consumePasswordRecoveryMarker(
          currentSession.user.id,
          currentSession.access_token,
        )
      ) {
        authorizeRecovery(currentSession);
        return;
      }

      if (code || recoveryType || recoveryAccessToken) {
        setMessage({
          tone: 'error',
          text: 'O link de recuperação não criou uma sessão válida. Solicite um novo link abaixo.',
        });
      }
    };

    void detectRecoverySession();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!turnstileToken) {
      setMessage({
        tone: 'error',
        text: 'Conclua a verificação de segurança para continuar.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const genericMessage = await loginService.requestPasswordRecovery(
        identifier,
        turnstileToken,
      );
      setMessage({
        tone: 'success',
        text: genericMessage,
      });
    } catch {
      setMessage({
        tone: 'success',
        text: 'Se existir uma conta vinculada aos dados informados, enviaremos as instruções de recuperação.',
      });
    } finally {
      setIsLoading(false);
      setTurnstileResetSignal((value) => value + 1);
    }
  };

  const confirmReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!recoveryAuthorization) {
      setMessage({
        tone: 'error',
        text: 'Abra o link de recuperação mais recente enviado ao seu e-mail antes de definir uma nova senha.',
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
        text: 'A nova senha precisa ter no mínimo 6 caracteres, 1 maiúscula, 1 minúscula e 1 número.',
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

      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) console.warn('A senha foi alterada, mas a sessão local não pôde ser encerrada.', signOutError);

      setMessage({
        tone: 'success',
        text: 'Senha alterada com sucesso. Você já pode entrar com a nova senha.',
      });

      setTimeout(() => {
        navigate('/login');
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
    { label: '6+ caracteres', valid: passwordChecks.hasMinLength },
    { label: 'Letra maiúscula', valid: passwordChecks.hasUppercase },
    { label: 'Letra minúscula', valid: passwordChecks.hasLowercase },
    { label: 'Um número', valid: passwordChecks.hasNumber },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f7fc] text-slate-900">
      <main className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden min-h-screen overflow-hidden bg-[#001a33] text-white lg:flex lg:flex-col">
          <img
            src="/banner1.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(145deg, rgba(0,26,51,0.99) 4%, rgba(0,56,125,0.93) 58%, rgba(37,99,235,0.78) 100%)',
            }}
          />
          <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full border-[52px] border-white/5" />
          <div className="absolute right-20 top-32 h-28 w-28 rounded-full border border-blue-200/20" />

          <div className="relative z-10 flex flex-1 flex-col px-10 py-9 xl:px-16 xl:py-12">
            <Link
              to="/"
              className="w-fit rounded-2xl bg-white px-5 py-3 shadow-2xl shadow-black/20 transition-transform hover:scale-[1.02]"
              aria-label="Ir para o site da Universo Cursos e Consultoria"
            >
              <img
                src="/LogoUniverso.png"
                alt="Universo Cursos e Consultoria"
                className="h-11 w-auto object-contain xl:h-12"
              />
            </Link>

            <div className="my-auto max-w-xl py-12">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-blue-200/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-blue-100 backdrop-blur">
                <ShieldCheck size={14} />
                Segurança do Portal do Aluno
              </span>
              <h2 className="mt-6 max-w-lg text-4xl font-black uppercase leading-[0.98] tracking-tight xl:text-5xl">
                Recupere seu acesso com segurança.
              </h2>
              <p className="mt-5 max-w-lg text-base font-semibold leading-relaxed text-blue-50/80">
                Este é o ambiente oficial da Universo para redefinição de senha dos alunos.
                O processo leva poucos minutos.
              </p>

              <ol className="mt-10 space-y-1">
                {RECOVERY_STEPS.map((step, index) => (
                  <li key={step.number} className="group flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-full border text-[10px] font-black ${
                        (mode === 'request' && index === 0) || (mode === 'reset' && index === 2)
                          ? 'border-white bg-white text-blue-700'
                          : 'border-white/20 bg-white/10 text-blue-100'
                      }`}>
                        {step.number}
                      </span>
                      {index < RECOVERY_STEPS.length - 1 ? (
                        <span className="h-10 w-px bg-white/15" />
                      ) : null}
                    </div>
                    <div className="pt-1">
                      <p className="text-sm font-black text-white">{step.title}</p>
                      <p className="mt-1 text-xs font-semibold text-blue-100/65">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-6">
              <div className="flex items-center gap-3 text-blue-50/70">
                <div className="rounded-xl bg-white/10 p-2">
                  <Lock size={16} />
                </div>
                <p className="max-w-xs text-[10px] font-bold uppercase leading-relaxed tracking-wider">
                  Seu link é pessoal e temporário
                </p>
              </div>
              <ArkhenSignature tone="light" />
            </div>
          </div>
        </aside>

        <section className="relative flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-8 lg:py-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                'radial-gradient(circle at 82% 12%, rgba(37,99,235,0.12), transparent 29%), radial-gradient(circle at 16% 88%, rgba(0,26,51,0.07), transparent 24%)',
            }}
          />

          <div className="relative z-10 w-full max-w-[590px]">
            <div className="mb-5 flex items-center justify-between gap-4 lg:hidden">
              <Link
                to="/"
                className="rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-slate-200"
              >
                <img
                  src="/LogoUniverso.png"
                  alt="Universo Cursos e Consultoria"
                  className="h-10 w-auto object-contain"
                />
              </Link>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#001a33] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white">
                <ShieldCheck size={13} />
                Portal do aluno
              </span>
            </div>

            <button
              type="button"
              onClick={() => navigate(mode === 'reset' ? '/login' : '/login')}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            >
              <ArrowLeft size={15} />
              Voltar ao login do aluno
            </button>

            <div className="overflow-hidden rounded-[2rem] border border-white bg-white shadow-2xl shadow-blue-950/10 ring-1 ring-slate-200/80">
              <div className="h-1.5 bg-slate-100">
                <div
                  className={`h-full bg-blue-600 transition-all duration-500 ${
                    mode === 'reset' ? 'w-full' : 'w-1/2'
                  }`}
                />
              </div>

              <div className="p-6 sm:p-9">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">
                      <span className="h-2 w-2 rounded-full bg-blue-600" />
                      {mode === 'reset' ? 'Etapa 2 de 2' : 'Etapa 1 de 2'}
                    </span>
                    <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#001a33] sm:text-4xl">
                      {mode === 'reset'
                        ? 'Crie sua nova senha'
                        : 'Redefinição de senha do aluno'}
                    </h1>
                    <p className="mt-3 max-w-md text-sm font-semibold leading-relaxed text-slate-500">
                      {mode === 'reset'
                        ? 'Defina uma senha segura para voltar a acessar seus cursos e serviços acadêmicos.'
                        : 'Informe sua matrícula de acesso ou e-mail para solicitar a recuperação.'}
                    </p>
                  </div>
                  <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 sm:flex">
                    {mode === 'reset' ? <Lock size={25} /> : <KeyRound size={25} />}
                  </div>
                </div>

                {message ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`mt-6 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-xs font-bold leading-relaxed ${
                      message.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    {message.tone === 'success' ? (
                      <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
                    ) : (
                      <ShieldCheck className="mt-0.5 shrink-0" size={17} />
                    )}
                    <span>{message.text}</span>
                  </div>
                ) : null}

                {mode === 'request' ? (
                  <form onSubmit={requestReset} className="mt-7">
                    <label className="block" htmlFor="recovery-identifier">
                      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Matrícula de acesso ou e-mail
                      </span>
                      <div className="group relative">
                        <Mail
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600"
                          size={19}
                        />
                        <input
                          id="recovery-identifier"
                          type="text"
                          name="identifier"
                          autoComplete="username"
                          required
                          autoFocus
                          value={identifier}
                          onChange={(event) => setIdentifier(event.target.value)}
                          placeholder="UNIV-A-00000001 ou seuemail@exemplo.com"
                          aria-describedby="recovery-identifier-help"
                          className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-bold text-slate-800 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                          disabled={isLoading}
                        />
                      </div>
                      <span
                        id="recovery-identifier-help"
                        className="mt-2.5 block text-xs font-semibold leading-relaxed text-slate-500"
                      >
                        Alunos sem e-mail devem solicitar o link à secretaria, que fará a validação de identidade antes do envio.
                      </span>
                    </label>

                    <div className="mt-5">
                      <TurnstileWidget
                        action="recover"
                        resetSignal={turnstileResetSignal}
                        onTokenChange={setTurnstileToken}
                        onError={() => {
                          setTurnstileToken('');
                          setMessage({
                            tone: 'error',
                            text: 'Não foi possível carregar a verificação de segurança. Atualize a página e tente novamente.',
                          });
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading || !turnstileToken}
                      className="group mt-6 flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-700/30 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoading ? (
                        <LoaderCircle className="h-5 w-5 animate-spin" />
                      ) : (
                        <Mail size={18} />
                      )}
                      {isLoading ? 'Enviando link...' : 'Receber link seguro'}
                      {!isLoading ? (
                        <ArrowRight
                          className="transition-transform group-hover:translate-x-1"
                          size={17}
                        />
                      ) : null}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={confirmReset} className="mt-7 grid gap-5">
                    <label className="block" htmlFor="new-password">
                      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Nova senha
                      </span>
                      <div className="group relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" size={19} />
                        <input
                          id="new-password"
                          type={showPassword ? 'text' : 'password'}
                          name="new-password"
                          autoComplete="new-password"
                          minLength={6}
                          required
                          autoFocus
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="Digite sua nova senha"
                          className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-base font-bold text-slate-800 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"
                          aria-label={showPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                        >
                          {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                        </button>
                      </div>
                    </label>

                    <div className="grid grid-cols-2 gap-2" aria-label="Requisitos da senha">
                      {requirements.map((requirement) => (
                        <div
                          key={requirement.label}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold transition-colors ${
                            requirement.valid
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-50 text-slate-500'
                          }`}
                        >
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                            requirement.valid ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'
                          }`}>
                            <Check size={10} strokeWidth={3} />
                          </span>
                          {requirement.label}
                        </div>
                      ))}
                    </div>

                    <label className="block" htmlFor="confirm-password">
                      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Confirmar nova senha
                      </span>
                      <div className="group relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600" size={19} />
                        <input
                          id="confirm-password"
                          type={showConfirmation ? 'text' : 'password'}
                          name="confirm-password"
                          autoComplete="new-password"
                          minLength={6}
                          required
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder="Repita a nova senha"
                          className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-base font-bold text-slate-800 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmation((prev) => !prev)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"
                          aria-label={showConfirmation ? 'Ocultar confirmação da senha' : 'Mostrar confirmação da senha'}
                        >
                          {showConfirmation ? <EyeOff size={19} /> : <Eye size={19} />}
                        </button>
                      </div>
                      {confirmPassword ? (
                        <span className={`mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold ${
                          password === confirmPassword ? 'text-emerald-700' : 'text-red-600'
                        }`}>
                          {password === confirmPassword ? <CheckCircle2 size={13} /> : null}
                          {password === confirmPassword ? 'As senhas conferem' : 'As senhas ainda não conferem'}
                        </span>
                      ) : null}
                    </label>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="group mt-1 flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoading ? (
                        <LoaderCircle className="h-5 w-5 animate-spin" />
                      ) : (
                        <ShieldCheck size={18} />
                      )}
                      {isLoading ? 'Salvando senha...' : 'Salvar nova senha'}
                      {!isLoading ? <ArrowRight className="transition-transform group-hover:translate-x-1" size={17} /> : null}
                    </button>
                  </form>
                )}

                <div className="mt-7 flex items-start gap-3 rounded-2xl bg-[#001a33] px-4 py-3.5 text-blue-50">
                  <ShieldCheck className="mt-0.5 shrink-0 text-blue-300" size={17} />
                  <p className="text-[10px] font-semibold leading-relaxed">
                    A Universo nunca solicita sua senha por e-mail ou WhatsApp. O link enviado
                    serve apenas para você criar uma nova senha.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center justify-between gap-3 px-2 text-center sm:flex-row sm:text-left">
              <p className="text-xs font-semibold text-slate-500">
                Ainda precisa de ajuda?{' '}
                <Link to="/contato" className="font-black text-blue-700 hover:underline">
                  Fale com a secretaria
                </Link>
              </p>
              <ArkhenSignature tone="dark" className="lg:hidden" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default PasswordRecoveryPage;
