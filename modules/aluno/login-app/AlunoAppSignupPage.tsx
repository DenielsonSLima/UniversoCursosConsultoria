import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { alunoPublicAuthService } from '../../public/login/aluno-public-auth.service';
import { getPublicAlunoBirthDateMax, isPublicAlunoOlderThanTen } from '../../public/login/aluno-birth-date';
import { formatCpf, formatPhone } from '../../public/login/aluno-login.utils';
import { savePortalSession, type PortalAuthProfile } from '../../login/portal-session';
import { formatCep, lookupBrazilianCep } from '../../shared/utils/brazilianCep';
import { isValidCpf, isValidEmail } from '../../shared/utils/identityValidation';
import { type TurnstileStatus } from '../../shared/auth/TurnstileWidget';
import AdaptiveTurnstileWidget from '../../shared/auth/AdaptiveTurnstileWidget';

type SignupStep = 'pessoal' | 'acesso' | 'endereco';
type CepStatus = 'idle' | 'loading' | 'resolved' | 'not-found' | 'error';

type SignupForm = {
  nome: string;
  cpf: string;
  dataNascimento: string;
  telefone: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

const INITIAL_FORM: SignupForm = {
  nome: '',
  cpf: '',
  dataNascimento: '',
  telefone: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptedTerms: false,
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
};

const STEP_ORDER: SignupStep[] = ['pessoal', 'acesso', 'endereco'];
const INPUT_CLASS = 'h-[3.35rem] w-full rounded-2xl border border-white/70 bg-white px-4 text-[15px] font-semibold text-slate-800 shadow-[0_12px_30px_rgba(0,0,0,0.14)] outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20';

const AlunoAppSignupPage: React.FC = () => {
  const [step, setStep] = useState<SignupStep>('pessoal');
  const [form, setForm] = useState<SignupForm>(INITIAL_FORM);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>('loading');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const submitInFlightRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const currentStepIndex = STEP_ORDER.indexOf(step);

  const updateField = <K extends keyof SignupForm>(field: K, value: SignupForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const passwordChecks = useMemo(() => ([
    { label: '6+ caracteres', valid: form.password.length >= 6 },
    { label: '1 maiúscula', valid: /[A-Z]/.test(form.password) },
    { label: '1 minúscula', valid: /[a-z]/.test(form.password) },
    { label: '1 número', valid: /\d/.test(form.password) },
  ]), [form.password]);

  const showError = (text: string) => {
    setMessage(text);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (step !== 'endereco') return undefined;
    const digits = form.cep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepStatus('idle');
      return undefined;
    }

    const controller = new globalThis.AbortController();
    const timer = window.setTimeout(async () => {
      setCepStatus('loading');
      try {
        const address = await lookupBrazilianCep(form.cep, controller.signal);
        if (!address) {
          setCepStatus('not-found');
          return;
        }
        setForm((current) => ({
          ...current,
          cep: address.cep,
          endereco: address.endereco.toLocaleUpperCase('pt-BR'),
          bairro: address.bairro.toLocaleUpperCase('pt-BR'),
          cidade: address.cidade.toLocaleUpperCase('pt-BR'),
          uf: address.uf.toLocaleUpperCase('pt-BR'),
        }));
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
  }, [form.cep, step]);

  const validatePersonal = () => {
    if (form.nome.trim().length < 3) return 'Informe seu nome completo.';
    if (!isValidCpf(form.cpf)) return 'Informe um CPF válido.';
    if (!form.dataNascimento) return 'Informe sua data de nascimento.';
    if (!isPublicAlunoOlderThanTen(form.dataNascimento)) return 'O cadastro é permitido somente para alunos com mais de 10 anos.';
    if (form.telefone.replace(/\D/g, '').length < 10) return 'Informe um WhatsApp válido.';
    return '';
  };

  const validateAccess = () => {
    if (!isValidEmail(form.email)) return 'Informe um e-mail válido. Ele será usado para entrar no aplicativo.';
    if (!passwordChecks.every((check) => check.valid)) return 'Crie uma senha com 6 caracteres, letra maiúscula, minúscula e número.';
    if (form.password !== form.confirmPassword) return 'As senhas não conferem.';
    if (!form.acceptedTerms) return 'Você precisa aceitar os Termos de Uso para continuar.';
    return '';
  };

  const goNext = (event: React.FormEvent) => {
    event.preventDefault();
    const validationMessage = step === 'pessoal' ? validatePersonal() : validateAccess();
    if (validationMessage) {
      showError(validationMessage);
      return;
    }
    setMessage('');
    setStep(step === 'pessoal' ? 'acesso' : 'endereco');
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setMessage('');
    setStep(step === 'endereco' ? 'acesso' : 'pessoal');
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finishSignup = (profile?: PortalAuthProfile | null) => {
    if (!profile) return;
    if (alunoPublicAuthService.needsInitialAccess(profile)) {
      window.location.replace('/aluno/primeiro-acesso?next=%2Faluno%2F');
      return;
    }
    savePortalSession(profile);
    window.location.replace('/aluno/');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitInFlightRef.current || !turnstileToken || turnstileStatus !== 'verified') return;
    if (form.cep.replace(/\D/g, '').length !== 8) {
      showError('Informe um CEP válido com 8 números.');
      return;
    }
    if (!form.endereco.trim() || !form.numero.trim() || !form.bairro.trim() || !form.cidade.trim() || form.uf.trim().length !== 2) {
      showError('Complete endereço, número, bairro, cidade e UF.');
      return;
    }

    submitInFlightRef.current = true;
    setLoading(true);
    setMessage('');
    const verifiedToken = turnstileToken;
    setTurnstileToken('');

    try {
      const result = await alunoPublicAuthService.signup({
        ...form,
        turnstileToken: verifiedToken,
        redirectPath: '/aluno/',
        appFlow: true,
      });
      if (result.emailConfirmationRequired) {
        setConfirmationEmail(form.email);
        return;
      }
      finishSignup(result.profile);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Não foi possível criar seu cadastro.');
    } finally {
      setLoading(false);
      submitInFlightRef.current = false;
      setTurnstileResetSignal((value) => value + 1);
    }
  };

  if (confirmationEmail) {
    return (
      <main className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#001a33] px-5 py-[max(1.5rem,env(safe-area-inset-top))] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(37,99,235,0.40),transparent_36%),linear-gradient(160deg,#001225_0%,#003b7a_55%,#001a33_100%)]" />
        <section className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/15 bg-white/[0.08] p-7 text-center shadow-2xl backdrop-blur-xl">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/20">
            <CheckCircle2 size={32} />
          </span>
          <h1 className="mt-6 text-2xl font-black">Cadastro recebido!</h1>
          <p className="mt-3 text-sm font-medium leading-relaxed text-blue-100/75">
            Enviamos a confirmação para <strong className="text-white">{confirmationEmail}</strong>. Abra o link recebido para ativar sua conta.
          </p>
          <Link to="/aluno/login-app" className="mt-7 flex h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 text-sm font-black shadow-xl shadow-blue-950/30">
            Voltar ao login <ArrowRight size={18} />
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="aluno-app-signup fixed inset-0 overflow-hidden bg-[#001a33] text-white">
      <img src="/banner1.png" alt="" className="absolute inset-0 h-full w-full object-cover object-[70%_center] opacity-35" />
      <div className="absolute inset-0 bg-[linear-gradient(155deg,rgba(0,15,38,0.98),rgba(0,49,108,0.93)_52%,rgba(0,23,56,0.98))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_5%,rgba(59,130,246,0.30),transparent_31%)]" />

      <div ref={contentRef} className="relative z-10 h-full overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.1rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-[31rem]">
          <header className="flex items-center justify-between gap-3">
            <Link to="/aluno/login-app" aria-label="Voltar ao login" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur-md">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex h-14 w-[10.5rem] items-center justify-center rounded-2xl bg-white px-4 shadow-xl">
              <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-10 w-full object-contain" />
            </div>
            <span className="flex h-11 min-w-11 items-center justify-center rounded-2xl bg-blue-600/80 px-3 text-[10px] font-black tracking-wider ring-1 ring-blue-300/20">
              {currentStepIndex + 1}/3
            </span>
          </header>

          <section className="mt-5">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-blue-300">Novo aluno</p>
            <h1 className="mt-1.5 text-[1.65rem] font-black leading-tight tracking-tight">Crie sua conta</h1>
            <p className="mt-1 text-xs font-medium text-blue-100/70">
              {step === 'pessoal' && 'Primeiro, precisamos conhecer você.'}
              {step === 'acesso' && 'Agora, defina seus dados de entrada.'}
              {step === 'endereco' && 'Por último, complete seu endereço.'}
            </p>
          </section>

          <div className="mt-4 grid grid-cols-3 gap-2" aria-label={`Etapa ${currentStepIndex + 1} de 3`}>
            {STEP_ORDER.map((item, index) => (
              <span key={item} className={`h-1.5 rounded-full transition-colors ${index <= currentStepIndex ? 'bg-blue-400' : 'bg-white/15'}`} />
            ))}
          </div>

          {message ? (
            <div role="alert" className="mt-4 rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-xs font-bold leading-relaxed text-red-100">
              {message}
            </div>
          ) : null}

          <div className="mt-4 rounded-[1.75rem] border border-white/15 bg-white/[0.08] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-5">
            {step === 'pessoal' ? (
              <form onSubmit={goNext} className="space-y-3.5">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">Nome completo</span>
                  <span className="relative block">
                    <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input autoFocus required autoComplete="name" value={form.nome} onChange={(event) => updateField('nome', event.target.value.toLocaleUpperCase('pt-BR'))} placeholder="Seu nome completo" className={`${INPUT_CLASS} pl-12`} />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">CPF</span>
                  <input required inputMode="numeric" value={form.cpf} onChange={(event) => updateField('cpf', formatCpf(event.target.value))} placeholder="000.000.000-00" className={INPUT_CLASS} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">Data de nascimento</span>
                  <input required type="date" max={getPublicAlunoBirthDateMax()} value={form.dataNascimento} onChange={(event) => updateField('dataNascimento', event.target.value)} className={INPUT_CLASS} />
                  <span className="mt-1.5 block text-[10px] font-semibold text-blue-100/55">Cadastro permitido para maiores de 10 anos.</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">WhatsApp</span>
                  <span className="relative block">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input required type="tel" inputMode="tel" autoComplete="tel" value={form.telefone} onChange={(event) => updateField('telefone', formatPhone(event.target.value))} placeholder="(79) 99999-9999" className={`${INPUT_CLASS} pl-12`} />
                  </span>
                </label>
                <button type="submit" className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-sm font-black shadow-xl shadow-blue-950/30 transition hover:bg-blue-500">
                  Continuar <ArrowRight size={18} />
                </button>
              </form>
            ) : null}

            {step === 'acesso' ? (
              <form onSubmit={goNext} className="space-y-3.5">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">E-mail de acesso</span>
                  <span className="relative block">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input autoFocus required type="email" autoComplete="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="seu@email.com" className={`${INPUT_CLASS} pl-12`} />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">Senha</span>
                  <span className="relative block">
                    <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(event) => updateField('password', event.target.value)} placeholder="Crie uma senha segura" className={`${INPUT_CLASS} pl-12 pr-12`} />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-400">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {passwordChecks.map((check) => (
                    <span key={check.label} className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[10px] font-bold ${check.valid ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/[0.06] text-blue-100/55'}`}>
                      <Check size={12} /> {check.label}
                    </span>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">Confirmar senha</span>
                  <span className="relative block">
                    <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input required type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} placeholder="Repita sua senha" className={`${INPUT_CLASS} pl-12 pr-12`} />
                    <button type="button" onClick={() => setShowConfirmation((value) => !value)} aria-label={showConfirmation ? 'Ocultar confirmação' : 'Mostrar confirmação'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-400">
                      {showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-2xl bg-white/[0.06] p-3">
                  <input type="checkbox" checked={form.acceptedTerms} onChange={(event) => updateField('acceptedTerms', event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500" />
                  <span className="text-[11px] font-medium leading-relaxed text-blue-100/75">
                    Li e aceito os <a href="/termos" target="_blank" rel="noreferrer" className="font-black text-blue-300 underline">Termos de Uso</a> e o tratamento dos dados necessários ao acesso acadêmico.
                  </span>
                </label>
                <div className="grid grid-cols-[0.8fr_1.2fr] gap-2.5">
                  <button type="button" onClick={goBack} className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.06] text-xs font-black"><ArrowLeft size={17} /> Voltar</button>
                  <button type="submit" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 text-xs font-black shadow-xl shadow-blue-950/30">Continuar <ArrowRight size={17} /></button>
                </div>
              </form>
            ) : null}

            {step === 'endereco' ? (
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="rounded-2xl bg-blue-400/10 p-3 text-[11px] font-semibold leading-relaxed text-blue-100/75">
                  <MapPin className="mr-1.5 inline text-blue-300" size={15} /> Comece pelo CEP; o endereço será preenchido automaticamente.
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">CEP</span>
                  <span className="relative block">
                    <input autoFocus required inputMode="numeric" maxLength={9} value={form.cep} onChange={(event) => { setCepStatus('idle'); updateField('cep', formatCep(event.target.value)); }} placeholder="00000-000" className={`${INPUT_CLASS} pr-12`} />
                    {cepStatus === 'loading' ? <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-600" size={18} /> : null}
                  </span>
                  {cepStatus !== 'idle' && cepStatus !== 'loading' ? <span className={`mt-1.5 block text-[10px] font-bold ${cepStatus === 'resolved' ? 'text-emerald-300' : 'text-amber-300'}`}>{cepStatus === 'resolved' ? 'CEP localizado. Confira os dados.' : 'Preencha o endereço manualmente.'}</span> : null}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">Endereço</span>
                  <input required autoComplete="street-address" value={form.endereco} onChange={(event) => updateField('endereco', event.target.value.toLocaleUpperCase('pt-BR'))} placeholder="Rua, avenida..." className={INPUT_CLASS} />
                </label>
                <div className="grid grid-cols-[0.72fr_1.28fr] gap-2.5">
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">Número</span>
                    <input required value={form.numero} onChange={(event) => updateField('numero', event.target.value.toLocaleUpperCase('pt-BR'))} placeholder="123" className={INPUT_CLASS} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">Complemento</span>
                    <input value={form.complemento} onChange={(event) => updateField('complemento', event.target.value.toLocaleUpperCase('pt-BR'))} placeholder="Opcional" className={INPUT_CLASS} />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">Bairro</span>
                  <input required value={form.bairro} onChange={(event) => updateField('bairro', event.target.value.toLocaleUpperCase('pt-BR'))} placeholder="Bairro" className={INPUT_CLASS} />
                </label>
                <div className="grid grid-cols-[1fr_5rem] gap-2.5">
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">Cidade</span>
                    <input required value={form.cidade} onChange={(event) => updateField('cidade', event.target.value.toLocaleUpperCase('pt-BR'))} placeholder="Cidade" className={INPUT_CLASS} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">UF</span>
                    <input required maxLength={2} value={form.uf} onChange={(event) => updateField('uf', event.target.value.toLocaleUpperCase('pt-BR').slice(0, 2))} placeholder="SE" className={`${INPUT_CLASS} text-center`} />
                  </label>
                </div>
                <div className="rounded-xl bg-white/95 px-2.5 py-2 text-slate-700">
                  <AdaptiveTurnstileWidget action="signup" resetSignal={turnstileResetSignal} onTokenChange={setTurnstileToken} onStatusChange={setTurnstileStatus} onError={() => setTurnstileToken('')} />
                </div>
                <div className="grid grid-cols-[0.72fr_1.28fr] gap-2.5">
                  <button type="button" onClick={goBack} disabled={loading} className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.06] text-xs font-black disabled:opacity-60"><ArrowLeft size={17} /> Voltar</button>
                  <button type="submit" disabled={loading || !turnstileToken || turnstileStatus !== 'verified'} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-2 text-xs font-black shadow-xl shadow-blue-950/30 disabled:cursor-not-allowed disabled:opacity-60">
                    {loading ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />}
                    {loading ? 'Criando…' : 'Criar conta'}
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          <p className="mt-4 text-center text-xs font-medium text-blue-100/65">
            Já possui uma conta? <Link to="/aluno/login-app" className="font-black text-blue-300">Entrar</Link>
          </p>
        </div>
      </div>
    </main>
  );
};

export default AlunoAppSignupPage;
