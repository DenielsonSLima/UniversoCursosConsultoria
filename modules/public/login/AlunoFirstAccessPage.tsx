import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { CheckSquare, Eye, EyeOff, Lock, FileText, LoaderCircle } from 'lucide-react';
import { alunoPublicAuthService } from './aluno-public-auth.service';
import {
  clearPortalSession,
  getPortalProfile,
  savePortalSession,
  PortalAuthProfile,
} from '../../login/portal-session';
import { loginService } from '../../login/login.service';
import { resolveProfilePostLoginRoute } from '../../login/profile-selection';
import { TERMS_VERSION } from '../../shared/constants/terms';
import type { PortalRole } from '../../login/portal-context.contract';

type PublicFirstAccessRole = Extract<PortalRole, 'Aluno' | 'Responsavel'>;

const getDefaultNext = (searchParams: URLSearchParams, role: PublicFirstAccessRole) => {
  return resolveProfilePostLoginRoute(role, searchParams.get('next'));
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const firstAccessRequestStorageKey = (role: PublicFirstAccessRole, contextId: string) => (
  `portal_first_access_request_id:${role}:${contextId}`
);

const getStableFirstAccessRequestId = (role: PublicFirstAccessRole, contextId: string) => {
  const storageKey = firstAccessRequestStorageKey(role, contextId);
  const stored = sessionStorage.getItem(storageKey)?.trim() || '';
  if (UUID_PATTERN.test(stored)) return stored;
  const requestId = crypto.randomUUID();
  sessionStorage.setItem(storageKey, requestId);
  return requestId;
};

const hasStrongPassword = (value: string) => value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);

const buildTermsAcceptedText = (role: PublicFirstAccessRole) => (
  <p className="text-xs font-semibold leading-relaxed text-slate-600">
    Ao continuar, eu confirmo que li e aceito os <Link to="/termos" className="text-[#001a33] underline">Termos de Uso</Link>.
    {role === 'Aluno' ? ' Estou ciente de que felicitações de aniversário e relacionamento não comercial ficam ativas por padrão, sob legítimo interesse, e podem ser desativadas a qualquer momento em Notificações.' : ''}
  </p>
);

type NavigateState = 'idle' | 'loading' | 'success' | 'error';

interface AlunoFirstAccessPageProps {
  role?: PublicFirstAccessRole;
}

const AlunoFirstAccessPage = ({ role = 'Aluno' }: AlunoFirstAccessPageProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loginPath = role === 'Responsavel'
    ? '/login'
    : Capacitor.isNativePlatform()
      ? '/aluno/login-app'
      : window.location.pathname.startsWith('/aluno/')
        ? '/aluno/entrar'
        : '/login';
  const [searchParams] = useSearchParams();
  const next = getDefaultNext(searchParams, role);
  const requestedContextId = searchParams.get('context')?.trim() || null;
  const requestIdRef = useRef<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<NavigateState>('idle');
  const [isInterrupting, setIsInterrupting] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      setIsChecking(true);
      setMessage(null);

      try {
        const currentProfile = await getPortalProfile({
          preferredRole: role,
          allowedRoles: [role],
          contextId: requestedContextId,
        });

        if (!currentProfile || !currentProfile.contextId) {
          await loginService.logout();
          navigate(loginPath, { replace: true });
          return;
        }

        if (!alunoPublicAuthService.needsInitialAccess(currentProfile)) {
          savePortalSession(currentProfile);
          navigate(next, { replace: true });
          return;
        }

        requestIdRef.current = getStableFirstAccessRequestId(role, currentProfile.contextId);
        setProfile(currentProfile);
        setAcceptedTerms(Boolean(currentProfile.acceptedTermsAt));
      } catch {
        setMessage({
          tone: 'error',
          text: 'Não foi possível validar seu primeiro acesso agora. Tente novamente em instantes.',
        });
      } finally {
        setIsChecking(false);
      }
    };

    void loadProfile();
  }, [loginPath, next, navigate, requestedContextId, role]);

  const termsAccepted = useMemo(() => Boolean(acceptedTerms), [acceptedTerms]);
  const requiresPasswordChange = Boolean(profile?.requiresPasswordReset);
  const needsTermsAcceptance = !profile?.acceptedTermsAt;
  const canSubmit =
    (needsTermsAcceptance ? termsAccepted : true) &&
    (!requiresPasswordChange || (hasStrongPassword(newPassword) && newPassword === confirmPassword));

  const handleInterrupt = async () => {
    if (isInterrupting || state === 'loading') return;
    setIsInterrupting(true);
    queryClient.clear();
    sessionStorage.removeItem('portal_query_cache_auth_uid');
    if (profile?.contextId) {
      sessionStorage.removeItem(firstAccessRequestStorageKey(role, profile.contextId));
    }
    clearPortalSession();

    try {
      await loginService.logout('global');
    } catch (error) {
      console.warn('Não foi possível confirmar o encerramento da sessão.', error);
    } finally {
      navigate(loginPath, { replace: true });
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (needsTermsAcceptance && !termsAccepted) {
      setMessage({ tone: 'error', text: 'É obrigatório aceitar os Termos de Uso para continuar.' });
      return;
    }

    if (requiresPasswordChange) {
      if (!hasStrongPassword(newPassword)) {
        setMessage({
          tone: 'error',
          text: 'A nova senha precisa ter no mínimo 8 caracteres, 1 maiúscula, 1 minúscula e 1 número.',
        });
        return;
      }

      if (newPassword !== confirmPassword) {
        setMessage({ tone: 'error', text: 'As senhas não conferem.' });
        return;
      }
    }

    setState('loading');

    try {
      const contextId = profile?.contextId;
      if (!contextId) {
        throw new Error('O contexto do primeiro acesso não está disponível. Entre novamente.');
      }
      const requestId = requestIdRef.current || getStableFirstAccessRequestId(role, contextId);
      requestIdRef.current = requestId;
      const updatedProfile = await alunoPublicAuthService.finalizeFirstAccess({
        role,
        contextId,
        requestId,
        acceptedTerms: termsAccepted,
        acceptTermsVersion: TERMS_VERSION,
        setPassword: requiresPasswordChange,
        newPassword,
      });

      if (updatedProfile) {
        savePortalSession(updatedProfile);
        sessionStorage.removeItem(firstAccessRequestStorageKey(role, contextId));
        setState('success');
        navigate(next, { replace: true });
      } else {
        setMessage({
          tone: 'error',
          text: 'Não foi possível concluir o primeiro acesso. Tente novamente.',
        });
        setState('error');
      }
    } catch (error) {
      // A senha pode ter sido persistida antes de uma falha transitória na
      // mutação dos termos. Relemos o mesmo contexto para que o retry não exija
      // repetir uma etapa que o servidor já concluiu.
      try {
        const contextId = profile?.contextId;
        const refreshed = contextId ? await getPortalProfile({
          preferredRole: role,
          allowedRoles: [role],
          contextId,
        }) : null;
        if (refreshed) {
          if (!alunoPublicAuthService.needsInitialAccess(refreshed)) {
            savePortalSession(refreshed);
            sessionStorage.removeItem(firstAccessRequestStorageKey(role, contextId!));
            setState('success');
            navigate(next, { replace: true });
            return;
          }
          setProfile(refreshed);
          setAcceptedTerms(Boolean(refreshed.acceptedTermsAt) || termsAccepted);
        }
      } catch {
        // Mantém o fluxo bloqueado e o mesmo requestId para nova tentativa.
      }
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível concluir o primeiro acesso.',
      });
      setState('error');
    }
  };

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoaderCircle className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
              Primeiro acesso
            </p>
            <h1 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">Finalize seu acesso</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Para proteger sua conta e concluir a entrada, valide os itens abaixo antes de seguir.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleInterrupt()}
            disabled={isInterrupting || state === 'loading'}
            className="text-xs font-black uppercase tracking-widest text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isInterrupting ? 'Saindo...' : 'Interromper'}
          </button>
        </div>

        <div className="space-y-6">
          {needsTermsAcceptance && (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-3 flex items-center gap-2">
                <FileText size={16} className="text-[#001a33]" />
                <h2 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Termos de Uso</h2>
              </div>
              {buildTermsAcceptedText(role)}
              <label className="mt-4 inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={termsAccepted}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                />
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-700">Li e aceito os termos</span>
              </label>
            </section>
          )}
          {!needsTermsAcceptance && (
            <section className="rounded-2xl border border-slate-200 bg-emerald-50 p-5">
              <div className="mb-1 flex items-center gap-2">
                <FileText size={16} className="text-emerald-700" />
                <h2 className="text-sm font-black uppercase tracking-tight text-emerald-900">Termos de Uso</h2>
              </div>
              <p className="text-xs font-semibold leading-relaxed text-emerald-900">
                Seu aceite dos termos já foi registrado.
              </p>
            </section>
          )}

          {requiresPasswordChange ? (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Lock size={16} className="text-[#001a33]" />
                <h2 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Criar nova senha</h2>
              </div>
                <form onSubmit={handleSubmit} className="grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Nova senha</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="new-password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Mínimo 8 caracteres, 1 maiúscula, 1 minúscula e 1 número"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Confirmar senha</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="confirm-password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Repita a nova senha"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                <p className="text-[10px] font-semibold text-slate-500">
                  A senha deve ter ao menos 8 caracteres, uma letra maiúscula, uma minúscula e um número.
                </p>

                  <button
                  type="submit"
                  disabled={state === 'loading' || !canSubmit}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#001a33] text-xs font-black uppercase tracking-widest text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {state === 'loading' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckSquare size={16} />}
                  {state === 'loading' ? 'Salvando...' : 'Concluir e acessar'}
                </button>
              </form>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-blue-50 p-5">
              <p className="text-xs font-semibold leading-relaxed text-blue-900">
                Seu perfil ainda está com pendência nos Termos de Uso.
              </p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={state === 'loading' || !canSubmit}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {state === 'loading' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckSquare size={16} />}
                {state === 'loading' ? 'Salvando...' : 'Concluir e acessar'}
              </button>
            </section>
          )}
        </div>

        {message && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-xs font-bold leading-relaxed ${
              message.tone === 'success'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-red-100 bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlunoFirstAccessPage;
