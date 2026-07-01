import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  GraduationCap,
  Home,
  Loader2,
  Eye,
  EyeOff,
  Lock,
  IdCard,
  Phone,
  Quote,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { alunoPublicAuthService } from './aluno-public-auth.service';
import { supabase } from '../../../lib/supabase';
import { savePortalSession } from '../../login/portal-session';
import { isValidCpf, isValidEmail } from '../../shared/utils/identityValidation';
import GoogleLogo from '../../shared/auth/GoogleLogo';
import DailabsSignature from '../../shared/components/DailabsSignature';
import AccessCheckingScreen from '../../shared/components/AccessCheckingScreen';
import {
  STUDENT_LOGIN_MOTIVATIONAL_PHRASES,
  getRandomMotivationalPhrase,
} from '../../login/motivationalPhrases';

const PROESC_LOGIN_URL = 'https://app.proesc.com/universo-cursos-e-consultoria/login';

type AuthMode = 'login' | 'cadastro';

const formatCpf = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return digits;
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length > 6) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length > 2) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length > 0) return `(${digits}`;
  return digits;
};

const hasOAuthReturnInUrl = () => (
  window.location.hash.includes('access_token') ||
  window.location.search.includes('code=')
);

const AlunoLoginPublicPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'cadastro' ? 'cadastro' : 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [checkingExternalLogin, setCheckingExternalLogin] = useState(hasOAuthReturnInUrl);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
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
    const strength =
      score >= 3 ? 'Forte'
      : score >= 2 ? 'Médio'
      : 'Fraco';
    return {
      hasMinLength,
      hasUppercase,
      hasLowercase,
      hasNumber,
      score,
      strength,
    };
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkGoogleReturn = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const hasOAuthReturn = hasOAuthReturnInUrl();

        if (!data.session) {
          if (hasOAuthReturn && mounted) {
            setMessage({
              tone: 'error',
              text: 'Não foi possível recuperar a sessão do Google. Tente novamente.',
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
          text: error instanceof Error ? error.message : 'Não foi possível concluir o login com Google.',
        });
      } finally {
        if (mounted) setCheckingExternalLogin(false);
      }
    };

    checkGoogleReturn();
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
      const result = await alunoPublicAuthService.signup(
        {
          nome,
          email,
          telefone,
          cpf,
          dataNascimento,
          password,
          acceptedTerms,
        },
      );

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

  return (
    <div className="relative min-h-screen bg-slate-50">
      <DailabsSignature tone="dark" className="absolute bottom-6 right-6 z-30" />
      <main className="grid min-h-screen lg:grid-cols-[1.04fr_0.96fr]">
        <section className="relative hidden min-h-screen overflow-hidden bg-[#001a33] text-white lg:flex lg:flex-col">
          <img src="/banner1.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, rgba(0,26,51,0.98) 0%, rgba(0,73,172,0.86) 54%, rgba(37,99,235,0.62) 100%)',
              mixBlendMode: 'multiply',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, rgba(0,26,51,0.96) 0%, rgba(0,58,133,0.78) 48%, rgba(0,26,51,0.22) 100%)',
            }}
          />
          <div className="relative z-20 flex items-start justify-between gap-3 px-10 pt-8 xl:px-16 xl:pt-10">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="shrink-0 rounded-2xl bg-white px-3 py-3 shadow-2xl shadow-black/20 transition hover:scale-[1.02] xl:px-5"
            >
              <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-9 w-auto object-contain xl:h-12" />
            </button>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md transition hover:bg-white/15 xl:px-4"
              >
                <Home size={14} /> Site
              </button>
              <button
                type="button"
                onClick={() => navigate('/sistema/login')}
                className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md transition hover:bg-white/15 xl:px-4"
              >
                Institucional
              </button>
            </div>
          </div>
          <div className="relative z-10 flex flex-1 flex-col justify-center px-10 pb-8 pt-8 xl:px-16 xl:pb-10">
            <div className="w-full max-w-[720px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-blue-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-blue-100">
                <GraduationCap size={14} /> Portal do aluno
              </span>
              <h1 className="mt-5 w-full max-w-[620px] text-[1.9rem] font-black uppercase leading-[0.98] tracking-tight sm:text-[2.55rem] lg:text-[2.85rem] xl:text-[3.15rem] 2xl:text-[3.2rem]">
                Comece seu curso sem esperar atendimento.
              </h1>
              <p className="mt-5 w-full max-w-[620px] text-sm font-semibold leading-relaxed text-blue-50/85 sm:text-base">
                Crie seu cadastro, pague online e acesse seus cursos EAD, livres e especializações. Cursos técnicos continuam com ficha completa quando necessário.
              </p>

              <div className="mt-7 w-full max-w-[620px] rounded-3xl border border-blue-100/15 bg-white/10 p-4 shadow-2xl shadow-blue-950/20 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-100/90">{formattedDate}</p>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black tabular-nums tracking-widest text-white">
                    <Clock size={13} className="text-blue-200" />
                    {formattedTime}
                  </span>
                </div>
                <div className="mt-3 flex gap-3 text-sm font-semibold leading-relaxed text-blue-50/90">
                  <Quote size={18} className="mt-0.5 shrink-0 text-blue-200" />
                  <p>{dailyPhrase}</p>
                </div>
              </div>

              <div className="mt-6 grid w-full max-w-[620px] grid-cols-3 gap-3">
                {[
                  { icon: UserRound, label: 'Cadastro' },
                  { icon: CreditCard, label: 'Checkout' },
                  { icon: BookOpen, label: 'Portal' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur-md">
                    <Icon size={18} className="text-blue-200" />
                    <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-white">{label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 w-full max-w-[620px] rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Alunos de cursos até 2026</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-200">
                  Use o Proesc se você fez curso técnico ou presencial até 2026.
                </p>
                <a
                  href={PROESC_LOGIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-black text-white transition hover:text-blue-200"
                >
                  Acessar portal Proesc <ArrowUpRight size={16} />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col items-center justify-center bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
          <div className="mx-auto w-full max-w-[560px] lg:hidden">
            <div className="mb-5 rounded-3xl bg-[#001a33] p-5 text-white shadow-xl">
              <div className="mb-5 inline-flex rounded-2xl bg-white px-4 py-3 shadow-lg">
                <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-11 w-auto object-contain" />
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-600/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-100">
                <GraduationCap size={13} /> Portal do aluno
              </span>
              <h1 className="mt-4 text-3xl font-black uppercase leading-tight tracking-tight">
                Acesse seus cursos online.
              </h1>
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest text-blue-100">
                  <span>{formattedDate}</span>
                  <span className="tabular-nums">{formattedTime}</span>
                </div>
                <p className="mt-3 text-sm font-semibold leading-relaxed text-blue-50/90">{dailyPhrase}</p>
              </div>
            </div>
          </div>
          <div className="mb-4 flex w-full max-w-[560px] items-center justify-between lg:hidden">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
            >
              <Home size={14} /> Site
            </button>
            <button
              type="button"
              onClick={() => navigate('/sistema/login')}
              className="rounded-full bg-blue-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-md transition hover:bg-blue-700"
            >
              Institucional
            </button>
          </div>
          <div className="w-full max-w-[560px] rounded-[2rem] border border-slate-200 bg-white px-5 pb-7 pt-6 shadow-2xl shadow-slate-200/80 sm:px-8 lg:mx-auto lg:p-9">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-[#001a33]">Login</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
                  {mode === 'login'
                    ? 'Entre para continuar sua matrícula online.'
                    : 'Cadastro rápido para compra de cursos online.'}
                </p>
              </div>
              <div className="hidden rounded-2xl bg-blue-50 p-3 text-blue-600 sm:block">
                <ShieldCheck size={24} />
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest transition ${
                  mode === 'login' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => switchMode('cadastro')}
                className={`rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest transition ${
                  mode === 'cadastro' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Cadastrar
              </button>
            </div>

            {message && (
              <div className={`mb-5 rounded-2xl border px-4 py-3 text-xs font-bold leading-relaxed ${
                message.tone === 'success'
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                  : 'border-red-100 bg-red-50 text-red-700'
              }`}>
                {message.text}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">CPF ou E-mail</span>
                  <div className="relative">
                    <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      inputMode="email"
                      required
                      value={loginIdentifier}
                      onChange={(event) => setLoginIdentifier(event.target.value)}
                      placeholder="CPF ou seu@email.com"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Senha</span>
                    <a
                      href="/recuperar-senha"
                      className="text-[10px] font-bold text-blue-600 hover:text-[#001a33] transition-colors"
                    >
                      Esqueceu a senha?
                    </a>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      placeholder="Sua senha"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-600"
                      aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                  Entrar e continuar
                </button>

                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">ou</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-xs font-black uppercase tracking-widest text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-md disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                    <GoogleLogo className="h-5 w-5" />
                  </span>
                  Entrar com Google
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignup} className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Nome completo</span>
                  <input type="text" required value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Seu nome completo" className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">CPF</span>
                  <input type="text" required value={cpf} onChange={(event) => setCpf(formatCpf(event.target.value))} placeholder="000.000.000-00" className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Data de nascimento</span>
                  <input
                    type="date"
                    required
                    value={dataNascimento}
                    onChange={(event) => setDataNascimento(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">WhatsApp</span>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" required value={telefone} onChange={(event) => setTelefone(formatPhone(event.target.value))} placeholder="(79) 99999-9999" className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                  </div>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail de acesso</span>
                  <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Senha</span>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type={showSignupPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Mínimo 6 caracteres e 1 maiúscula"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((prev) => !prev)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-600"
                      aria-label={showSignupPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showSignupPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 ${
                        passwordChecks.score >= 3
                          ? 'bg-emerald-100 text-emerald-700'
                          : passwordChecks.score === 2
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      Nível: {passwordChecks.strength}
                    </span>
                    <span
                      className={passwordChecks.hasMinLength ? 'text-emerald-700' : 'text-slate-500'}
                    >
                      6+ caracteres
                    </span>
                    <span
                      className={passwordChecks.hasUppercase ? 'text-emerald-700' : 'text-slate-500'}
                    >
                      1 letra maiúscula
                    </span>
                    <span
                      className={passwordChecks.hasLowercase ? 'text-emerald-700' : 'text-slate-500'}
                    >
                      1 letra minúscula
                    </span>
                    <span
                      className={passwordChecks.hasNumber ? 'text-emerald-700' : 'text-slate-500'}
                    >
                      1 número
                    </span>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Confirmar senha</span>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type={showSignupConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Repita sua senha"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupConfirmPassword((prev) => !prev)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-600"
                      aria-label={showSignupConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showSignupConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
                <label className="col-span-2 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-blue-700"
                  />
                  <span className="text-xs font-semibold text-slate-600 leading-relaxed">
                    Declaro que li e aceito os{' '}
                    <a href="/termos" className="text-[#001a33] underline">
                      Termos de Uso
                    </a>{' '}
                    e autorizo o uso dos meus dados para operação do acesso ao ambiente acadêmico.
                  </span>
                </label>
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-800 sm:col-span-2">
                  <CheckCircle2 className="mb-2 inline-block" size={16} /> Este cadastro libera compras online. Dados técnicos podem ser completados depois no seu perfil.
                </div>
                <button type="submit" disabled={loading} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60 sm:col-span-2">
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                  Criar cadastro e continuar
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default AlunoLoginPublicPage;
