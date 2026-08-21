import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  MessageCircle,
  UserRound,
  UserRoundPlus,
} from 'lucide-react';
import { alunoPublicAuthService, getSafePublicAlunoRedirectPath } from '../../public/login/aluno-public-auth.service';
import { savePortalSession, type PortalAuthProfile } from '../../login/portal-session';
import { resolveProfilePostLoginRoute } from '../../login/profile-selection';
import PortalProfileSelector, { portalProfileKey } from '../../login/components/PortalProfileSelector';
import GoogleLogo from '../../shared/auth/GoogleLogo';
import { type TurnstileStatus } from '../../shared/auth/TurnstileWidget';
import AdaptiveTurnstileWidget from '../../shared/auth/AdaptiveTurnstileWidget';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../../../lib/supabase';
import { NATIVE_OAUTH_BROWSER_FINISHED_EVENT } from '../../shared/auth/native-oauth';
import AlunoAppSplash from '../pwa/AlunoAppSplash';
import { useAlunoContainedScroll, useAlunoFullscreenViewport } from './useAlunoFullscreenViewport';

type LoginMessage = {
  tone: 'success' | 'error';
  text: string;
};

const AlunoAppLoginPage: React.FC = () => {
  useAlunoFullscreenViewport();

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publicProfiles, setPublicProfiles] = useState<PortalAuthProfile[]>([]);
  const [isSelectingProfile, setIsSelectingProfile] = useState(false);
  const [pendingProfileKey, setPendingProfileKey] = useState<string | null>(null);
  const [checkingExistingSession, setCheckingExistingSession] = useState(() => Capacitor.isNativePlatform());
  const [message, setMessage] = useState<LoginMessage | null>(() => (
    searchParams.get('reason') === 'session_expired'
      ? { tone: 'error', text: 'Sua sessão expirou. Entre novamente para continuar.' }
      : null
  ));
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>('loading');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const submitInFlightRef = useRef(false);
  const wasLoadingRef = useRef(false);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  useAlunoContainedScroll(contentScrollRef);

  const redirectPath = getSafePublicAlunoRedirectPath(searchParams.get('redirect'));

  const finishLogin = useCallback((profile?: PortalAuthProfile | null) => {
    if (!profile) return;

    if (alunoPublicAuthService.needsInitialAccess(profile)) {
      queryClient.clear();
      const params = new URLSearchParams({ next: redirectPath });
      if (profile.contextId) {
        params.set('context', profile.contextId);
      }
      navigate(`/aluno/primeiro-acesso?${params.toString()}`, { replace: true });
      return;
    }

    queryClient.clear();
    savePortalSession(profile);
    navigate(resolveProfilePostLoginRoute(profile.tipo, redirectPath), { replace: true });
  }, [navigate, queryClient, redirectPath]);

  const continueWithProfiles = useCallback((profiles: readonly PortalAuthProfile[]) => {
    if (profiles.length === 0) {
      throw new Error('Não há perfil ativo disponível para este acesso.');
    }
    if (profiles.length === 1) {
      finishLogin(profiles[0]);
      return;
    }
    setLoading(false);
    setPublicProfiles([...profiles]);
  }, [finishLogin]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const handleBrowserFinished = () => setLoading(false);
    window.addEventListener(NATIVE_OAUTH_BROWSER_FINISHED_EVENT, handleBrowserFinished);
    return () => window.removeEventListener(
      NATIVE_OAUTH_BROWSER_FINISHED_EVENT,
      handleBrowserFinished,
    );
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    if (searchParams.get('oauth_return') || searchParams.get('oauth_error') || searchParams.get('reason') === 'session_expired') {
      setCheckingExistingSession(false);
      return undefined;
    }

    let mounted = true;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error || !data.session) {
          setCheckingExistingSession(false);
          return;
        }

        const profiles = await alunoPublicAuthService.finishExternalLoginAndListProfiles();
        if (!mounted) return;
        // Uma sessão restaurada também pode mudar de contexto. Nunca deixa
        // dados TanStack de uma escolha anterior seguirem para o seletor.
        queryClient.clear();
        if (profiles.length > 1) {
          setLoading(false);
          setPublicProfiles([...profiles]);
          setCheckingExistingSession(false);
          return;
        }
        if (profiles.length === 1) {
          finishLogin(profiles[0]);
          return;
        }
        throw new Error('Não há perfil ativo disponível para esta sessão.');
      } catch (error) {
        if (!mounted) return;
        setMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'Não foi possível validar a sessão existente.',
        });
        setCheckingExistingSession(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [finishLogin, queryClient, searchParams]);

  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      submitInFlightRef.current = false;
      setTurnstileResetSignal((value) => value + 1);
    }
    wasLoadingRef.current = loading;
  }, [loading]);

  const handleProfileSelect = useCallback(async (profile: PortalAuthProfile) => {
    setIsSelectingProfile(true);
    setPendingProfileKey(portalProfileKey(profile));
    setMessage(null);
    try {
      finishLogin(profile);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível concluir o acesso com o perfil selecionado.',
      });
    } finally {
      setIsSelectingProfile(false);
      setPendingProfileKey(null);
    }
  }, [finishLogin]);

  useEffect(() => {
    const oauthReturn = searchParams.get('oauth_return');
    const oauthError = searchParams.get('oauth_error');
    if (!oauthReturn && !oauthError) return undefined;

    let mounted = true;

    if (oauthError) {
      const errorMessages: Record<string, string> = {
        cancelled: 'O acesso com Google foi cancelado.',
        expired: 'O acesso com Google expirou. Tente novamente.',
        invalid_callback: 'O retorno do Google não pôde ser validado.',
        missing_session: 'Não foi possível recuperar a sessão do Google. Tente novamente.',
        oauth_failed: 'Não foi possível concluir o acesso com Google. Tente novamente.',
      };
      setMessage({
        tone: 'error',
        text: errorMessages[oauthError] || errorMessages.oauth_failed,
      });
      setLoading(false);
      navigate('/aluno/login-app', { replace: true });
      return undefined;
    }

    setLoading(true);
    setMessage(null);
    void alunoPublicAuthService.finishExternalLoginAndListProfiles()
      .then((profiles) => {
        if (mounted) continueWithProfiles(profiles);
      })
      .catch((error) => {
        if (!mounted) return;
        setMessage({
          tone: 'error',
          text: error instanceof Error
            ? error.message
            : 'Não foi possível concluir o acesso com Google.',
        });
        setLoading(false);
        navigate('/aluno/login-app', { replace: true });
      });

    return () => {
      mounted = false;
    };
  }, [continueWithProfiles, navigate, searchParams]);

  const handleSubmit: React.FormEventHandler = async (event) => {
    event.preventDefault();
    if (
      submitInFlightRef.current
      || !turnstileToken
      || turnstileStatus !== 'verified'
    ) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    submitInFlightRef.current = true;
    setLoading(true);
    setMessage(null);
    const verifiedToken = turnstileToken;
    setTurnstileToken('');

    try {
      const profiles = await alunoPublicAuthService.loginAndListProfiles(identifier, password, verifiedToken);
      continueWithProfiles(profiles);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.',
      });
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setLoading(true);
    setMessage(null);
    try {
      await alunoPublicAuthService.loginWithGoogle(redirectPath);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível iniciar o acesso com Google.',
      });
      setLoading(false);
    }
  };

  const openSignup = () => navigate('/aluno/cadastro-app');
  const openSupport = () => navigate('/aluno/atendimento-publico');

  if (checkingExistingSession) return <AlunoAppSplash />;

  return (
    <main className="aluno-app-login aluno-fullscreen-shell fixed inset-0 h-[100dvh] max-h-[100dvh] min-h-0 w-full overflow-hidden overscroll-none bg-[#001a33] text-white">
      <img
        src="/banner1.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[68%_center] opacity-45"
      />
      <div className="absolute inset-0 bg-[linear-gradient(155deg,rgba(0,15,38,0.98)_0%,rgba(0,39,92,0.92)_48%,rgba(0,23,56,0.96)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_16%,rgba(37,99,235,0.30),transparent_34%),radial-gradient(circle_at_90%_65%,rgba(30,64,175,0.22),transparent_32%)]" />
      <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full border-[34px] border-blue-400/[0.06]" />
      <div className="absolute -bottom-24 -right-20 h-64 w-64 rotate-12 rounded-[4rem] border border-blue-300/10" />

      <div ref={contentScrollRef} className="aluno-login-scroll aluno-contained-scroll relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[31rem] flex-col overflow-x-hidden overscroll-none px-5 pb-[max(1.15rem,env(safe-area-inset-bottom))] pt-[max(1.15rem,env(safe-area-inset-top))] sm:px-8">
        <section className="app-login-content my-auto flex w-full flex-col">
          <div className="app-login-logo mx-auto flex h-[4.4rem] w-[13.5rem] items-center justify-center rounded-[1.45rem] bg-white px-5 shadow-[0_22px_60px_rgba(0,0,0,0.32)] ring-1 ring-white/80">
            <img
              src="/LogoUniverso.png"
              alt="Universo Cursos e Consultoria"
              className="h-12 w-full object-contain"
            />
          </div>

          <header className="app-login-heading mt-5 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-200">Portal do aluno</p>
            <h1 className="mt-2 text-[1.8rem] font-black leading-tight tracking-tight">
              <span className="text-blue-400">Bem-vindo(a)</span> de volta!
            </h1>
            <p className="mt-1.5 text-sm font-medium text-blue-100/75">Entre para continuar sua jornada.</p>
          </header>

          <nav className="app-login-tabs mt-5 grid grid-cols-3 border-b border-white/15" aria-label="Acesso do aluno">
            <button
              type="button"
              className="relative flex h-11 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-blue-300 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-blue-400"
            >
              <ArrowRight size={16} /> Entrar
            </button>
            <button
              type="button"
              onClick={openSignup}
              className="flex h-11 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-blue-100/65 transition hover:text-white"
            >
              <UserRoundPlus size={16} /> Cadastrar
            </button>
            <button
              type="button"
              onClick={openSupport}
              className="flex h-11 items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-blue-100/65 transition hover:text-white"
            >
              <MessageCircle size={15} /> Chat
            </button>
          </nav>

          {message ? (
            <div
              role={message.tone === 'error' ? 'alert' : 'status'}
              className={`mt-3 rounded-xl border px-3.5 py-2.5 text-xs font-bold leading-relaxed ${
                message.tone === 'success'
                  ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                  : 'border-red-300/20 bg-red-400/10 text-red-100'
              }`}
            >
              {message.text}
            </div>
          ) : null}

          {publicProfiles.length > 1 ? (
            <PortalProfileSelector
              profiles={publicProfiles}
              variant="dark"
              isSelecting={isSelectingProfile}
              pendingProfileKey={pendingProfileKey}
              onSelect={handleProfileSelect}
              onBack={() => {
                setPublicProfiles([]);
                setMessage(null);
              }}
            />
          ) : (
          <>
          <form onSubmit={handleSubmit} className="app-login-form mt-4 space-y-3.5">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-blue-100/70">Matrícula ou e-mail</span>
              <span className="relative block">
                <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
                <input
                  id="aluno-app-username"
                  type="text"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="Digite sua matrícula ou e-mail"
                  className="h-14 w-full rounded-2xl border border-white bg-white pl-12 pr-4 text-[15px] font-semibold text-slate-800 shadow-[0_14px_35px_rgba(0,0,0,0.16)] outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-blue-100/70">Senha</span>
              <span className="relative block">
                <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
                <input
                  id="aluno-app-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  className="h-14 w-full rounded-2xl border border-white bg-white pl-12 pr-12 text-[15px] font-semibold text-slate-800 shadow-[0_14px_35px_rgba(0,0,0,0.16)] outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </span>
            </label>

            <div className="flex justify-end">
              <Link
                to="/aluno/recuperar-senha-app"
                className="text-xs font-bold text-blue-300 transition hover:text-white"
              >
                Esqueceu a senha?
              </Link>
            </div>

            <div className="app-login-turnstile rounded-xl bg-white px-2.5 py-2 text-slate-700">
              <AdaptiveTurnstileWidget
                action="login"
                resetSignal={turnstileResetSignal}
                onTokenChange={setTurnstileToken}
                onStatusChange={setTurnstileStatus}
                onError={() => setTurnstileToken('')}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !turnstileToken || turnstileStatus !== 'verified'}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-sm font-black text-white shadow-[0_18px_45px_rgba(37,99,235,0.32)] transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Entrando…' : 'Entrar'}
              <ArrowRight size={20} className={loading ? 'animate-pulse' : ''} />
            </button>
          </form>

          <div className="app-login-google mt-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/15" />
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-100/55">ou continue com</span>
              <span className="h-px flex-1 bg-white/15" />
            </div>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex h-[3.25rem] w-full items-center justify-center gap-3 rounded-2xl border border-white/25 bg-white/[0.06] text-sm font-bold text-white backdrop-blur-md transition hover:border-white/40 hover:bg-white/10 disabled:opacity-60"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
                <GoogleLogo className="h-5 w-5" />
              </span>
              Entrar com Google
            </button>
          </div>

          <p className="app-login-create mt-4 text-center text-xs font-medium text-blue-100/70">
            Ainda não tem uma conta?{' '}
            <button type="button" onClick={openSignup} className="font-black text-blue-300 hover:text-white">
              Criar conta
            </button>
          </p>
          </>
          )}
        </section>
      </div>
    </main>
  );
};

export default AlunoAppLoginPage;
