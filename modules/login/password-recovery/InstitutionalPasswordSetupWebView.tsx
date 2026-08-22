import React from 'react';
import { Link } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import AdaptiveTurnstileWidget from '../../shared/auth/AdaptiveTurnstileWidget';
import ArkhenSignature from '../../shared/components/ArkhenSignature';
import type { PasswordRecoveryModel } from './usePasswordRecovery';

const INSTITUTIONAL_ACCESS_STEPS = [
  {
    icon: Mail,
    label: 'Convite',
    description: 'Abra o link mais recente enviado ao seu e-mail.',
  },
  {
    icon: KeyRound,
    label: 'Senha',
    description: 'Crie uma senha pessoal seguindo os requisitos.',
  },
  {
    icon: UserRoundCheck,
    label: 'Acesso',
    description: 'Entre no portal com seu e-mail institucional.',
  },
] as const;

const fieldClassName =
  'h-14 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#4169E1] focus:bg-white focus:ring-4 focus:ring-[#4169E1]/10 disabled:cursor-not-allowed disabled:opacity-65';

interface InstitutionalPasswordSetupWebViewProps {
  model: PasswordRecoveryModel;
}

const InstitutionalPasswordSetupWebView: React.FC<
  InstitutionalPasswordSetupWebViewProps
> = ({ model }) => {
  const isFirstAccess = model.isInviteFlow || model.isFirstAccess;
  const isResetMode = model.mode === 'reset';
  const showInviteAssistance = model.mode === 'request' && model.isInviteFlow;

  return (
    <div className="relative min-h-screen w-full bg-slate-50 font-sans text-slate-900">
      <main className="grid min-h-screen lg:grid-cols-[1.04fr_0.96fr]">
        <aside className="relative hidden min-h-screen overflow-hidden bg-[#001a33] text-white lg:flex lg:flex-col">
          <img
            src="/banner2.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgba(0,26,51,0.98) 0%, rgba(0,73,172,0.86) 54%, rgba(37,99,235,0.62) 100%)',
              mixBlendMode: 'multiply',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(0,26,51,0.96) 0%, rgba(0,58,133,0.78) 48%, rgba(0,26,51,0.22) 100%)',
            }}
          />

          <div className="relative z-10 flex flex-1 flex-col px-10 py-8 xl:px-12 xl:py-10 2xl:px-16">
            <Link
              to="/"
              className="w-fit rounded-2xl bg-white px-5 py-3 shadow-2xl shadow-black/20 transition hover:scale-[1.02]"
              aria-label="Ir para o site da Universo Cursos e Consultoria"
            >
              <img
                src="/LogoUniverso.png"
                alt="Universo Cursos e Consultoria"
                className="h-12 w-auto object-contain"
              />
            </Link>

            <div className="my-auto max-w-2xl py-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-600/20 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-100 backdrop-blur-md">
                <ShieldCheck size={14} /> Portal institucional
              </span>
              <h1 className="mt-6 max-w-2xl text-[2.55rem] font-black uppercase leading-[0.98] tracking-tight xl:text-[2.8rem] 2xl:text-[3.2rem]">
                Crie sua senha e conclua seu primeiro acesso.
              </h1>
              <p className="mt-5 max-w-xl text-base font-semibold leading-relaxed text-slate-200/90">
                Este é o ambiente oficial para acesso de gestores, professores,
                responsáveis, coordenadores e equipe administrativa da Universo.
              </p>

              <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
                {INSTITUTIONAL_ACCESS_STEPS.map(({ icon: Icon, label, description }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md"
                  >
                    <Icon size={20} className="text-blue-200" />
                    <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-white">
                      {label}
                    </p>
                    <p className="mt-2 text-[11px] font-semibold leading-relaxed text-blue-50/70">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-6">
              <div className="flex items-center gap-3 text-blue-50/75">
                <span className="rounded-xl bg-white/10 p-2">
                  <Lock size={16} />
                </span>
                <p className="max-w-xs text-[10px] font-bold uppercase leading-relaxed tracking-wider">
                  Seu link é pessoal, temporário e protegido
                </p>
              </div>
              <ArkhenSignature tone="light" />
            </div>
          </div>
        </aside>

        <section className="relative flex min-h-screen flex-col items-center justify-start px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:py-8 lg:justify-center lg:py-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                'radial-gradient(circle at 82% 12%, rgba(37,99,235,0.10), transparent 29%), radial-gradient(circle at 16% 88%, rgba(0,26,51,0.06), transparent 24%)',
            }}
          />

          <div className="relative z-10 w-full max-w-md">
            <button
              type="button"
              onClick={model.onBackToLogin}
              className="group mb-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:text-[#4169E1]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition group-hover:border-[#4169E1] group-hover:shadow-md">
                <ArrowLeft size={15} />
              </span>
              Voltar ao login institucional
            </button>

            <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/70 sm:p-8">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-5 inline-flex rounded-2xl bg-white lg:hidden">
                    <img
                      src="/LogoUniverso.png"
                      alt="Universo Cursos e Consultoria"
                      className="h-11 w-auto object-contain"
                    />
                  </div>
                  <span className="flex w-fit items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-700">
                    <ShieldCheck size={13} /> Acesso institucional
                  </span>
                  <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#001a33]">
                    {isResetMode
                      ? isFirstAccess ? 'Crie sua senha de acesso' : 'Crie sua nova senha'
                      : isFirstAccess ? 'Primeiro acesso' : 'Recupere seu acesso'}
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                    {isResetMode
                      ? 'Defina uma senha pessoal para concluir seu acesso ao portal institucional.'
                      : showInviteAssistance
                        ? 'Novos convites institucionais são enviados pelo administrador responsável pelo seu acesso.'
                        : 'Informe o e-mail vinculado ao acesso para receber um novo link seguro.'}
                  </p>
                </div>
                <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 sm:flex">
                  {isResetMode ? <Lock size={23} /> : <KeyRound size={23} />}
                </span>
              </div>

              <div
                className="mb-6 grid grid-cols-2 gap-2"
                aria-label={`Etapa ${isResetMode ? 2 : 1} de 2`}
              >
                <span className="h-1.5 rounded-full bg-blue-600" />
                <span
                  className={`h-1.5 rounded-full transition-colors ${
                    isResetMode ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                />
              </div>

              {model.message ? (
                <div
                  role={model.message.tone === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                  className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-xs font-bold leading-relaxed ${
                    model.message.tone === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {model.message.tone === 'success' ? (
                    <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
                  ) : (
                    <ShieldCheck className="mt-0.5 shrink-0" size={17} />
                  )}
                  <span>{model.message.text}</span>
                </div>
              ) : null}

              {showInviteAssistance ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-4 text-blue-950">
                    <CircleHelp className="mt-0.5 shrink-0 text-blue-600" size={18} />
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide">
                        Solicite um novo convite
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                        Peça ao administrador que cadastrou seu acesso para revisar os dados e enviar
                        um novo convite institucional. Esta tela não substitui o convite por uma
                        recuperação de senha comum.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={model.onBackToLogin}
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#001a33] px-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-700"
                  >
                    <ArrowLeft size={17} /> Voltar ao login institucional
                  </button>

                  <Link
                    to="/contato"
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <CircleHelp size={16} /> Falar com a secretaria
                  </Link>
                </div>
              ) : model.mode === 'request' ? (
                <form onSubmit={model.requestReset} className="space-y-5">
                  <label className="block" htmlFor="institutional-recovery-email">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#001a33]">
                      E-mail de acesso institucional
                    </span>
                    <span className="group relative block">
                      <Mail
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#4169E1]"
                        size={19}
                      />
                      <input
                        id="institutional-recovery-email"
                        type="email"
                        name="email"
                        autoComplete="email"
                        required
                        autoFocus
                        value={model.identifier}
                        onChange={(event) => model.setIdentifier(event.target.value)}
                        placeholder="seu@email.com"
                        disabled={model.isLoading}
                        className={`${fieldClassName} pr-4`}
                      />
                    </span>
                  </label>

                  <AdaptiveTurnstileWidget
                    action="recover"
                    resetSignal={model.turnstileResetSignal}
                    onTokenChange={model.setTurnstileToken}
                    onStatusChange={model.setTurnstileStatus}
                    onError={() => model.setTurnstileToken('')}
                  />

                  <button
                    type="submit"
                    disabled={
                      model.isLoading
                      || !model.turnstileToken
                      || model.turnstileStatus !== 'verified'
                    }
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#001a33] px-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-65"
                  >
                    {model.isLoading
                      ? <LoaderCircle className="animate-spin" size={18} />
                      : <Mail size={18} />}
                    {model.isLoading
                      ? 'Enviando link...'
                      : model.turnstileStatus === 'verified'
                        ? 'Receber novo link'
                        : 'Aguardando verificação'}
                    {!model.isLoading ? <ArrowRight size={17} /> : null}
                  </button>
                </form>
              ) : (
                <form onSubmit={model.confirmReset} className="space-y-5">
                  <label className="block" htmlFor="institutional-new-password">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#001a33]">
                      Nova senha
                    </span>
                    <span className="group relative block">
                      <Lock
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#4169E1]"
                        size={19}
                      />
                      <input
                        id="institutional-new-password"
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
                        className={fieldClassName}
                      />
                      <button
                        type="button"
                        onClick={() => model.setShowPassword((value) => !value)}
                        aria-label={model.showPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"
                      >
                        {model.showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                      </button>
                    </span>
                  </label>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Requisitos da senha">
                    {model.requirements.map((requirement) => (
                      <span
                        key={requirement.label}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold ${
                          requirement.valid
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                        }`}
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                          requirement.valid
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-400'
                        }`}>
                          <Check size={10} strokeWidth={3} />
                        </span>
                        {requirement.label}
                      </span>
                    ))}
                  </div>

                  <label className="block" htmlFor="institutional-confirm-password">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#001a33]">
                      Confirmar nova senha
                    </span>
                    <span className="group relative block">
                      <Lock
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#4169E1]"
                        size={19}
                      />
                      <input
                        id="institutional-confirm-password"
                        type={model.showConfirmation ? 'text' : 'password'}
                        name="confirm-password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        value={model.confirmPassword}
                        onChange={(event) => model.setConfirmPassword(event.target.value)}
                        placeholder="Repita a nova senha"
                        disabled={model.isLoading}
                        className={fieldClassName}
                      />
                      <button
                        type="button"
                        onClick={() => model.setShowConfirmation((value) => !value)}
                        aria-label={model.showConfirmation
                          ? 'Ocultar confirmação da senha'
                          : 'Mostrar confirmação da senha'}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"
                      >
                        {model.showConfirmation ? <EyeOff size={19} /> : <Eye size={19} />}
                      </button>
                    </span>
                    {model.confirmPassword ? (
                      <span className={`mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold ${
                        model.password === model.confirmPassword
                          ? 'text-emerald-700'
                          : 'text-red-600'
                      }`}>
                        {model.password === model.confirmPassword
                          ? <CheckCircle2 size={13} />
                          : null}
                        {model.password === model.confirmPassword
                          ? 'As senhas conferem'
                          : 'As senhas ainda não conferem'}
                      </span>
                    ) : null}
                  </label>

                  <button
                    type="submit"
                    disabled={model.isLoading}
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#001a33] px-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-65"
                  >
                    {model.isLoading
                      ? <LoaderCircle className="animate-spin" size={18} />
                      : <ShieldCheck size={18} />}
                    {model.isLoading ? 'Salvando senha...' : 'Criar senha e continuar'}
                    {!model.isLoading ? <ArrowRight size={17} /> : null}
                  </button>
                </form>
              )}

              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-[#001a33] px-4 py-3.5 text-blue-50">
                <ShieldCheck className="mt-0.5 shrink-0 text-blue-300" size={17} />
                <p className="text-[10px] font-semibold leading-relaxed">
                  A Universo nunca solicita sua senha por e-mail ou WhatsApp. O link serve
                  apenas para você definir sua própria senha de acesso.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center justify-between gap-3 px-2 text-center sm:flex-row sm:text-left">
              <p className="text-xs font-semibold text-slate-500">
                Precisa de ajuda?{' '}
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

export default InstitutionalPasswordSetupWebView;
