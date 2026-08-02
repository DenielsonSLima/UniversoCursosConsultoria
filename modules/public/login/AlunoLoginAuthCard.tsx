import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  UserRound,
  Loader2,
  Lock,
  MapPin,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import GoogleLogo from '../../shared/auth/GoogleLogo';
import { formatCpf, formatPhone, type AuthMessage, type AuthMode, type PasswordChecks } from './aluno-login.utils';
import { getPublicAlunoBirthDateMax } from './aluno-birth-date';
import TurnstileWidget, {
  type TurnstileStatus,
} from '../../shared/auth/TurnstileWidget';

type Props = {
  mode: AuthMode;
  loading: boolean;
  message: AuthMessage | null;
  loginIdentifier: string;
  loginPassword: string;
  showLoginPassword: boolean;
  nome: string;
  cpf: string;
  dataNascimento: string;
  telefone: string;
  email: string;
  password: string;
  showSignupPassword: boolean;
  confirmPassword: string;
  showSignupConfirmPassword: boolean;
  acceptedTerms: boolean;
  signupStep: 'dados' | 'endereco';
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cepStatus: 'idle' | 'loading' | 'resolved' | 'not-found' | 'error';
  passwordChecks: PasswordChecks;
  recoveryHref?: string;
  onModeChange: (mode: AuthMode) => void;
  onLoginIdentifierChange: (value: string) => void;
  onLoginPasswordChange: (value: string) => void;
  onToggleLoginPassword: () => void;
  onNomeChange: (value: string) => void;
  onCpfChange: (value: string) => void;
  onDataNascimentoChange: (value: string) => void;
  onTelefoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleSignupPassword: () => void;
  onConfirmPasswordChange: (value: string) => void;
  onToggleSignupConfirmPassword: () => void;
  onAcceptedTermsChange: (value: boolean) => void;
  onCepChange: (value: string) => void;
  onEnderecoChange: (value: string) => void;
  onNumeroChange: (value: string) => void;
  onComplementoChange: (value: string) => void;
  onBairroChange: (value: string) => void;
  onCidadeChange: (value: string) => void;
  onUfChange: (value: string) => void;
  onSignupBack: () => void;
  onLogin: (event: React.FormEvent, turnstileToken: string) => void;
  onSignupNext: React.FormEventHandler;
  onSignup: (event: React.FormEvent, turnstileToken: string) => void;
  onGoogleLogin: () => void;
};

const inputClassName = 'aluno-auth-input h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100';

const AlunoLoginAuthCard: React.FC<Props> = ({
  mode,
  loading,
  message,
  loginIdentifier,
  loginPassword,
  showLoginPassword,
  nome,
  cpf,
  dataNascimento,
  telefone,
  email,
  password,
  showSignupPassword,
  confirmPassword,
  showSignupConfirmPassword,
  acceptedTerms,
  signupStep,
  cep,
  endereco,
  numero,
  complemento,
  bairro,
  cidade,
  uf,
  cepStatus,
  passwordChecks,
  recoveryHref = '/recuperar-senha',
  onModeChange,
  onLoginIdentifierChange,
  onLoginPasswordChange,
  onToggleLoginPassword,
  onNomeChange,
  onCpfChange,
  onDataNascimentoChange,
  onTelefoneChange,
  onEmailChange,
  onPasswordChange,
  onToggleSignupPassword,
  onConfirmPasswordChange,
  onToggleSignupConfirmPassword,
  onAcceptedTermsChange,
  onCepChange,
  onEnderecoChange,
  onNumeroChange,
  onComplementoChange,
  onBairroChange,
  onCidadeChange,
  onUfChange,
  onSignupBack,
  onLogin,
  onSignupNext,
  onSignup,
  onGoogleLogin,
}) => {
  const [birthDateInputActive, setBirthDateInputActive] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>('loading');
  const wasLoadingRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const maximumBirthDate = getPublicAlunoBirthDateMax();

  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      submitInFlightRef.current = false;
      setTurnstileResetSignal((value) => value + 1);
    }
    wasLoadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    setTurnstileToken('');
    setTurnstileStatus('loading');
    submitInFlightRef.current = false;
  }, [mode]);

  return (
  <div className="w-full max-w-[560px] rounded-[2rem] border border-slate-200 bg-white px-5 pb-7 pt-6 shadow-2xl shadow-slate-200/80 sm:px-8 lg:mx-auto lg:p-9">
    <div className="mb-6 flex items-center justify-between gap-4">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-[#001a33]">Login</h2>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
          {mode === 'login'
            ? 'Entre para continuar sua matrícula online.'
            : signupStep === 'dados'
              ? 'Informe seus dados de acesso para continuar.'
              : 'Complete o endereço exigido para emissão do Banese.'}
        </p>
      </div>
      <div className="hidden rounded-2xl bg-blue-50 p-3 text-blue-600 sm:block">
        <ShieldCheck size={24} />
      </div>
    </div>

    <div className="mb-6 grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-100 p-1">
      <button
        type="button"
        onClick={() => onModeChange('login')}
        className={`rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest transition ${
          mode === 'login' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        Entrar
      </button>
      <button
        type="button"
        onClick={() => onModeChange('cadastro')}
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
      <form
        onSubmit={(event) => {
          if (
            submitInFlightRef.current
            || !turnstileToken
            || turnstileStatus !== 'verified'
          ) {
            event.preventDefault();
            return;
          }
          submitInFlightRef.current = true;
          const verifiedToken = turnstileToken;
          setTurnstileToken('');
          onLogin(event, verifiedToken);
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Matrícula de acesso ou e-mail</span>
          <div className="relative">
            <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              name="username"
              autoComplete="username"
              required
              value={loginIdentifier}
              onChange={(event) => onLoginIdentifierChange(event.target.value)}
              placeholder="UNIV-A-00000001 ou seu@email.com"
              className="aluno-auth-input aluno-login-input h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </label>

        <label className="block">
          <div className="mb-2 flex items-center justify-between">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Senha</span>
            <a href={recoveryHref} className="text-[10px] font-bold text-blue-600 hover:text-[#001a33] transition-colors">
              Esqueceu a senha?
            </a>
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type={showLoginPassword ? 'text' : 'password'}
              name="current-password"
              autoComplete="current-password"
              required
              value={loginPassword}
              onChange={(event) => onLoginPasswordChange(event.target.value)}
              placeholder="Sua senha"
              className="aluno-auth-input aluno-login-input h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
            <button type="button" onClick={onToggleLoginPassword} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-600" aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}>
              {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <TurnstileWidget
          action="login"
          resetSignal={turnstileResetSignal}
          onTokenChange={setTurnstileToken}
          onStatusChange={setTurnstileStatus}
          onError={() => setTurnstileToken('')}
        />

        <button
          type="submit"
          disabled={
            loading
            || !turnstileToken
            || turnstileStatus !== 'verified'
          }
          className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
          {loading
            ? 'Autenticando…'
            : turnstileStatus === 'verified'
              ? 'Entrar e continuar'
              : 'Aguardando verificação'}
        </button>

        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">ou</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <button type="button" onClick={onGoogleLogin} disabled={loading} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-xs font-black uppercase tracking-widest text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-md disabled:opacity-60">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
            <GoogleLogo className="h-5 w-5" />
          </span>
          Entrar com Google
        </button>
      </form>
    ) : signupStep === 'dados' ? (
      <form onSubmit={onSignupNext} className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 sm:col-span-2" aria-label="Etapa 1 de 2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">1</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/2 rounded-full bg-blue-600" />
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-400">2</span>
        </div>
        <label className="block sm:col-span-2">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Nome completo</span>
          <input type="text" name="name" autoComplete="name" required value={nome} onChange={(event) => onNomeChange(event.target.value)} placeholder="Seu nome completo" className={inputClassName} />
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">CPF</span>
          <input type="text" name="cpf" inputMode="numeric" autoComplete="off" required value={cpf} onChange={(event) => onCpfChange(formatCpf(event.target.value))} placeholder="000.000.000-00" className={inputClassName} />
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Data de nascimento</span>
          <input
            type={birthDateInputActive || dataNascimento ? 'date' : 'text'}
            name="bday"
            autoComplete="bday"
            required
            value={dataNascimento}
            max={maximumBirthDate}
            onPointerDown={() => setBirthDateInputActive(true)}
            onFocus={() => setBirthDateInputActive(true)}
            onBlur={() => {
              if (!dataNascimento) setBirthDateInputActive(false);
            }}
            onChange={(event) => onDataNascimentoChange(event.target.value)}
            aria-describedby="public-aluno-birth-date-help"
            className={inputClassName}
          />
          <span id="public-aluno-birth-date-help" className="mt-1.5 block text-[10px] font-semibold text-slate-400">
            Cadastro permitido somente para maiores de 10 anos.
          </span>
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">WhatsApp</span>
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="tel" name="tel" inputMode="tel" autoComplete="tel" required value={telefone} onChange={(event) => onTelefoneChange(formatPhone(event.target.value))} placeholder="(79) 99999-9999" className="aluno-auth-input h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
          </div>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail de acesso</span>
          <input type="email" name="email" autoComplete="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="seu@email.com" className={inputClassName} />
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Senha</span>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type={showSignupPassword ? 'text' : 'password'} name="new-password" autoComplete="new-password" required value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Mínimo 6 caracteres e 1 maiúscula" className="aluno-auth-input h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-base font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
            <button type="button" onClick={onToggleSignupPassword} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-600" aria-label={showSignupPassword ? 'Ocultar senha' : 'Mostrar senha'}>
              {showSignupPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 ${passwordChecks.score >= 3 ? 'bg-emerald-100 text-emerald-700' : passwordChecks.score === 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
              Nível: {passwordChecks.strength}
            </span>
            <span className={passwordChecks.hasMinLength ? 'text-emerald-700' : 'text-slate-500'}>6+ caracteres</span>
            <span className={passwordChecks.hasUppercase ? 'text-emerald-700' : 'text-slate-500'}>1 letra maiúscula</span>
            <span className={passwordChecks.hasLowercase ? 'text-emerald-700' : 'text-slate-500'}>1 letra minúscula</span>
            <span className={passwordChecks.hasNumber ? 'text-emerald-700' : 'text-slate-500'}>1 número</span>
          </div>
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Confirmar senha</span>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type={showSignupConfirmPassword ? 'text' : 'password'} name="confirm-password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={(event) => onConfirmPasswordChange(event.target.value)} placeholder="Repita sua senha" className="aluno-auth-input h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-base font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
            <button type="button" onClick={onToggleSignupConfirmPassword} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-600" aria-label={showSignupConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}>
              {showSignupConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        <label className="col-span-2 flex items-start gap-3">
          <input type="checkbox" checked={acceptedTerms} onChange={(event) => onAcceptedTermsChange(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-700" />
          <span className="text-xs font-semibold text-slate-600 leading-relaxed">
            Declaro que li e aceito os <a href="/termos" className="text-[#001a33] underline">Termos de Uso</a>{' '}
            e autorizo o uso dos meus dados para operação do acesso ao ambiente acadêmico.
          </span>
        </label>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-800 sm:col-span-2">
          <CheckCircle2 className="mb-2 inline-block" size={16} /> Na próxima etapa, informe o endereço necessário para emissão do boleto.
        </div>
        <button type="submit" className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 sm:col-span-2">
          Próximo: endereço
          <ArrowRight size={16} />
        </button>
      </form>
    ) : (
      <form
        onSubmit={(event) => {
          if (
            submitInFlightRef.current
            || !turnstileToken
            || turnstileStatus !== 'verified'
          ) {
            event.preventDefault();
            return;
          }
          submitInFlightRef.current = true;
          const verifiedToken = turnstileToken;
          setTurnstileToken('');
          onSignup(event, verifiedToken);
        }}
        className="grid gap-4 sm:grid-cols-6"
      >
        <div className="flex items-center gap-3 sm:col-span-6" aria-label="Etapa 2 de 2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={14} />
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-full rounded-full bg-blue-600" />
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">2</span>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-900 sm:col-span-6">
          <MapPin className="mr-1.5 inline-block text-blue-600" size={16} />
          Comece pelo CEP. Logradouro, bairro, cidade e UF serão preenchidos automaticamente. Informe o número e, se houver, o complemento.
        </div>

        <label className="block sm:col-span-2">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">CEP</span>
          <div className="relative">
            <input
              type="text"
              name="postal-code"
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={9}
              required
              value={cep}
              onChange={(event) => onCepChange(event.target.value)}
              placeholder="00000-000"
              className={`${inputClassName} pr-11`}
              autoFocus
            />
            {cepStatus === 'loading' && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-500" size={18} />}
          </div>
        </label>

        <label className="block sm:col-span-4">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Endereço</span>
          <input type="text" name="street-address" autoComplete="street-address" required value={endereco} onChange={(event) => onEnderecoChange(event.target.value)} placeholder="Rua, avenida..." className={inputClassName} />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Número</span>
          <input type="text" name="address-number" autoComplete="address-line2" required value={numero} onChange={(event) => onNumeroChange(event.target.value)} placeholder="123 ou S/N" className={inputClassName} />
        </label>

        <label className="block sm:col-span-4">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Complemento <span className="normal-case tracking-normal text-slate-300">(opcional)</span></span>
          <input type="text" name="address-complement" value={complemento} onChange={(event) => onComplementoChange(event.target.value)} placeholder="Apto, bloco, referência..." className={inputClassName} />
        </label>

        <label className="block sm:col-span-3">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Bairro</span>
          <input type="text" name="address-level3" autoComplete="address-level3" required value={bairro} onChange={(event) => onBairroChange(event.target.value)} placeholder="Bairro" className={inputClassName} />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Cidade</span>
          <input type="text" name="address-level2" autoComplete="address-level2" required value={cidade} onChange={(event) => onCidadeChange(event.target.value)} placeholder="Cidade" className={inputClassName} />
        </label>

        <label className="block sm:col-span-1">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">UF</span>
          <input type="text" name="address-level1" autoComplete="address-level1" maxLength={2} required value={uf} onChange={(event) => onUfChange(event.target.value)} placeholder="SE" className={`${inputClassName} text-center`} />
        </label>

        {cepStatus !== 'idle' && (
          <p className={`text-[10px] font-bold sm:col-span-6 ${
            cepStatus === 'resolved'
              ? 'text-emerald-600'
              : cepStatus === 'loading'
                ? 'text-blue-600'
                : 'text-amber-600'
          }`}>
            {cepStatus === 'resolved' && 'CEP localizado. Confira o endereço e informe o número.'}
            {cepStatus === 'loading' && 'Consultando CEP...'}
            {cepStatus === 'not-found' && 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.'}
            {cepStatus === 'error' && 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.'}
          </p>
        )}

        <div className="sm:col-span-6">
          <TurnstileWidget
            action="signup"
            resetSignal={turnstileResetSignal}
            onTokenChange={setTurnstileToken}
            onStatusChange={setTurnstileStatus}
            onError={() => setTurnstileToken('')}
          />
        </div>

        <button type="button" onClick={onSignupBack} disabled={loading} className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-black uppercase tracking-widest text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 disabled:opacity-60 sm:col-span-2">
          <ChevronLeft size={16} />
          Voltar
        </button>
        <button
          type="submit"
          disabled={
            loading
            || !turnstileToken
            || turnstileStatus !== 'verified'
          }
          className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-4"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
          {loading
            ? 'Criando cadastro…'
            : turnstileStatus === 'verified'
              ? 'Criar cadastro e continuar'
              : 'Aguardando verificação'}
        </button>
      </form>
    )}
  </div>
  );
};

export default AlunoLoginAuthCard;
