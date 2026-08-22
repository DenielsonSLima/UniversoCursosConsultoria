import React from 'react';
import { Link } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import AdaptiveTurnstileWidget from '../../shared/auth/AdaptiveTurnstileWidget';
import type { PasswordRecoveryModel } from './usePasswordRecovery';

interface PasswordRecoveryAppViewProps {
  model: PasswordRecoveryModel;
}

const PasswordRecoveryAppView: React.FC<PasswordRecoveryAppViewProps> = ({ model }) => (
  <main className="fixed inset-0 overflow-hidden bg-[#001a33] text-white">
    <img
      src="/banner1.png"
      alt=""
      className="absolute inset-0 h-full w-full object-cover object-[68%_center] opacity-35"
    />
    <div className="absolute inset-0 bg-[linear-gradient(155deg,rgba(0,15,38,0.98)_0%,rgba(0,49,108,0.93)_52%,rgba(0,23,56,0.98)_100%)]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_7%,rgba(59,130,246,0.30),transparent_31%),radial-gradient(circle_at_95%_74%,rgba(37,99,235,0.20),transparent_28%)]" />
    <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full border-[34px] border-blue-400/[0.06]" />
    <div className="absolute -bottom-24 -right-20 h-64 w-64 rotate-12 rounded-[4rem] border border-blue-300/10" />

    <div className="relative z-10 h-full overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex min-h-full w-full max-w-[31rem] flex-col justify-center py-2">
        <header className="flex items-center justify-between gap-3">
          <Link
            to="/aluno/login-app"
            aria-label="Voltar ao login"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur-md transition hover:bg-white/15"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex h-14 w-[10.5rem] items-center justify-center rounded-2xl bg-white px-4 shadow-xl ring-1 ring-white/80">
            <img
              src="/LogoUniverso.png"
              alt="Universo Cursos e Consultoria"
              className="h-10 w-full object-contain"
            />
          </div>
          <span className="flex h-11 min-w-11 items-center justify-center rounded-2xl bg-blue-600/80 px-3 text-[10px] font-black tracking-wider ring-1 ring-blue-300/20">
            {model.mode === 'reset' ? '2/2' : '1/2'}
          </span>
        </header>

        <section className="mt-5">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-blue-300">
            {model.isFirstAccess ? 'Primeiro acesso' : 'Recuperação de acesso'}
          </p>
          <h1 className="mt-1.5 text-[1.65rem] font-black leading-tight tracking-tight">
            {model.mode === 'reset'
              ? model.isFirstAccess ? 'Crie sua senha de acesso' : 'Crie sua nova senha'
              : 'Esqueceu sua senha?'}
          </h1>
          <p className="mt-1 text-xs font-medium leading-relaxed text-blue-100/70">
            {model.mode === 'reset'
              ? 'Defina uma nova senha para voltar aos seus cursos.'
              : 'Informe sua matrícula ou e-mail e enviaremos um link seguro.'}
          </p>
        </section>

        <div
          className="mt-4 grid grid-cols-2 gap-2"
          aria-label={`Etapa ${model.mode === 'reset' ? 2 : 1} de 2`}
        >
          <span className="h-1.5 rounded-full bg-blue-400" />
          <span className={`h-1.5 rounded-full transition-colors ${
            model.mode === 'reset' ? 'bg-blue-400' : 'bg-white/15'
          }`} />
        </div>

        {model.message ? (
          <div
            role={model.message.tone === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={`mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-xs font-bold leading-relaxed ${
              model.message.tone === 'success'
                ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                : 'border-red-300/20 bg-red-400/10 text-red-100'
            }`}
          >
            {model.message.tone === 'success'
              ? <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
              : <ShieldCheck className="mt-0.5 shrink-0" size={17} />}
            <span>{model.message.text}</span>
          </div>
        ) : null}

        <div className="mt-4 rounded-[1.75rem] border border-white/15 bg-white/[0.08] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-5">
          {model.mode === 'request' ? (
            <form onSubmit={model.requestReset} className="space-y-4">
              <label className="block" htmlFor="app-recovery-identifier">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">
                  Matrícula ou e-mail
                </span>
                <span className="relative block">
                  <Mail
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={19}
                  />
                  <input
                    id="app-recovery-identifier"
                    type="text"
                    name="identifier"
                    autoComplete="username"
                    required
                    autoFocus
                    value={model.identifier}
                    onChange={(event) => model.setIdentifier(event.target.value)}
                    placeholder="Digite sua matrícula ou e-mail"
                    disabled={model.isLoading}
                    className="h-14 w-full rounded-2xl border border-white bg-white pl-12 pr-4 text-[15px] font-semibold text-slate-800 shadow-[0_14px_35px_rgba(0,0,0,0.16)] outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20 disabled:opacity-65"
                  />
                </span>
              </label>

              <div className="rounded-xl bg-white/95 px-2.5 py-2 text-slate-700">
                <AdaptiveTurnstileWidget
                  action="recover"
                  resetSignal={model.turnstileResetSignal}
                  onTokenChange={model.setTurnstileToken}
                  onStatusChange={model.setTurnstileStatus}
                  onError={() => model.setTurnstileToken('')}
                />
              </div>

              <button
                type="submit"
                disabled={
                  model.isLoading
                  || !model.turnstileToken
                  || model.turnstileStatus !== 'verified'
                }
                className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(37,99,235,0.32)] transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {model.isLoading
                  ? <LoaderCircle className="animate-spin" size={19} />
                  : <Mail size={19} />}
                {model.isLoading ? 'Enviando link…' : 'Enviar link de recuperação'}
                {!model.isLoading ? <ArrowRight size={19} /> : null}
              </button>
            </form>
          ) : (
            <form onSubmit={model.confirmReset} className="space-y-4">
              <label className="block" htmlFor="app-new-password">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">
                  Nova senha
                </span>
                <span className="relative block">
                  <Lock
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={19}
                  />
                  <input
                    id="app-new-password"
                    type={model.showPassword ? 'text' : 'password'}
                    name="new-password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    autoFocus
                    value={model.password}
                    onChange={(event) => model.setPassword(event.target.value)}
                    placeholder="Digite sua nova senha"
                    disabled={model.isLoading}
                    className="h-14 w-full rounded-2xl border border-white bg-white pl-12 pr-12 text-[15px] font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20 disabled:opacity-65"
                  />
                  <button
                    type="button"
                    onClick={() => model.setShowPassword((value) => !value)}
                    aria-label={model.showPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400"
                  >
                    {model.showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2" aria-label="Requisitos da senha">
                {model.requirements.map((requirement) => (
                  <span
                    key={requirement.label}
                    className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[10px] font-bold ${
                      requirement.valid
                        ? 'bg-emerald-400/15 text-emerald-200'
                        : 'bg-white/[0.06] text-blue-100/55'
                    }`}
                  >
                    <Check size={12} /> {requirement.label}
                  </span>
                ))}
              </div>

              <label className="block" htmlFor="app-confirm-password">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-blue-100/70">
                  Confirmar nova senha
                </span>
                <span className="relative block">
                  <Lock
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={19}
                  />
                  <input
                    id="app-confirm-password"
                    type={model.showConfirmation ? 'text' : 'password'}
                    name="confirm-password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={model.confirmPassword}
                    onChange={(event) => model.setConfirmPassword(event.target.value)}
                    placeholder="Repita a nova senha"
                    disabled={model.isLoading}
                    className="h-14 w-full rounded-2xl border border-white bg-white pl-12 pr-12 text-[15px] font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20 disabled:opacity-65"
                  />
                  <button
                    type="button"
                    onClick={() => model.setShowConfirmation((value) => !value)}
                    aria-label={model.showConfirmation
                      ? 'Ocultar confirmação da senha'
                      : 'Mostrar confirmação da senha'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400"
                  >
                    {model.showConfirmation ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </span>
              </label>

              <button
                type="submit"
                disabled={model.isLoading}
                className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(37,99,235,0.32)] transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {model.isLoading
                  ? <LoaderCircle className="animate-spin" size={19} />
                  : <ShieldCheck size={19} />}
                {model.isLoading ? 'Salvando senha…' : 'Salvar nova senha'}
                {!model.isLoading ? <ArrowRight size={19} /> : null}
              </button>
            </form>
          )}
        </div>

        {!model.isFirstAccess && (
          <p className="mt-4 text-center text-xs font-medium text-blue-100/65">
            Lembrou sua senha?{' '}
            <Link
              to="/aluno/login-app"
              className="font-black text-blue-300 hover:text-white"
            >
              Voltar para entrar
            </Link>
          </p>
        )}
      </div>
    </div>
  </main>
);

export default PasswordRecoveryAppView;
