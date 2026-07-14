import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  IdCard,
  Loader2,
  Lock,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import GoogleLogo from '../../shared/auth/GoogleLogo';
import { formatCpf, formatPhone, type AuthMessage, type AuthMode, type PasswordChecks } from './aluno-login.utils';

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
  passwordChecks: PasswordChecks;
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
  onLogin: React.FormEventHandler;
  onSignup: React.FormEventHandler;
  onGoogleLogin: () => void;
};

const inputClassName = 'h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100';

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
  passwordChecks,
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
  onLogin,
  onSignup,
  onGoogleLogin,
}) => (
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
      <form onSubmit={onLogin} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">CPF ou E-mail</span>
          <div className="relative">
            <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              name="username"
              inputMode="email"
              autoComplete="username"
              required
              value={loginIdentifier}
              onChange={(event) => onLoginIdentifierChange(event.target.value)}
              placeholder="CPF ou seu@email.com"
              className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </label>

        <label className="block">
          <div className="mb-2 flex items-center justify-between">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Senha</span>
            <a href="/recuperar-senha" className="text-[10px] font-bold text-blue-600 hover:text-[#001a33] transition-colors">
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
              className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
            <button type="button" onClick={onToggleLoginPassword} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-600" aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}>
              {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <button type="submit" disabled={loading} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">
          {loading ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
          Entrar e continuar
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
    ) : (
      <form onSubmit={onSignup} className="grid gap-4 sm:grid-cols-2">
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
          <input type="date" name="bday" autoComplete="bday" required value={dataNascimento} onChange={(event) => onDataNascimentoChange(event.target.value)} className={inputClassName} />
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">WhatsApp</span>
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="tel" name="tel" inputMode="tel" autoComplete="tel" required value={telefone} onChange={(event) => onTelefoneChange(formatPhone(event.target.value))} placeholder="(79) 99999-9999" className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
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
            <input type={showSignupPassword ? 'text' : 'password'} name="new-password" autoComplete="new-password" required value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Mínimo 6 caracteres e 1 maiúscula" className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
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
            <input type={showSignupConfirmPassword ? 'text' : 'password'} name="confirm-password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={(event) => onConfirmPasswordChange(event.target.value)} placeholder="Repita sua senha" className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-base font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
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
          <CheckCircle2 className="mb-2 inline-block" size={16} /> Este cadastro libera compras online. Dados técnicos podem ser completados depois no seu perfil.
        </div>
        <button type="submit" disabled={loading} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60 sm:col-span-2">
          {loading ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
          Criar cadastro e continuar
        </button>
      </form>
    )}
  </div>
);

export default AlunoLoginAuthCard;
