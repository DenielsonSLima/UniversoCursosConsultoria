import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckSquare, Eye, EyeOff, Lock, FileText, LoaderCircle } from 'lucide-react';
import { alunoPublicAuthService } from './aluno-public-auth.service';
import { getPortalProfile, savePortalSession, PortalAuthProfile } from '../../login/portal-session';
import { loginService } from '../../login/login.service';
import { TERMS_VERSION } from '../../shared/constants/terms';

const getDefaultNext = (searchParams: URLSearchParams) => {
  const next = searchParams.get('next');
  if (!next) return '/aluno';
  try {
    const decoded = decodeURIComponent(next);
    return decoded.startsWith('/') ? decoded : '/aluno';
  } catch {
    return '/aluno';
  }
};

const hasStrongPassword = (value: string) => value.length >= 6 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);

const buildTermsAcceptedText = () => (
  <p className="text-xs font-semibold leading-relaxed text-slate-600">
    Ao continuar, eu confirmo que li e aceito os <Link to="/termos" className="text-[#001a33] underline">Termos de Uso</Link> e estou ciente das regras de matrícula e da política de privacidade.
  </p>
);

type NavigateState = 'idle' | 'loading' | 'success' | 'error';

const AlunoFirstAccessPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = getDefaultNext(searchParams);
  const [isChecking, setIsChecking] = useState(true);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<NavigateState>('idle');

  useEffect(() => {
    const loadProfile = async () => {
      setIsChecking(true);
      const currentProfile = await getPortalProfile();

      if (!currentProfile) {
        await loginService.logout();
        navigate('/login', { replace: true });
        return;
      }

      if (currentProfile.tipo !== 'Aluno') {
        await loginService.logout();
        navigate('/sistema/login', { replace: true });
        return;
      }

      if (!alunoPublicAuthService.needsInitialAccess(currentProfile)) {
        navigate(next, { replace: true });
        return;
      }

      setProfile(currentProfile);
      setAcceptedTerms(Boolean(currentProfile.acceptedTermsAt));
      setIsChecking(false);
    };

    loadProfile();
  }, [next, navigate]);

  const termsAccepted = useMemo(() => Boolean(acceptedTerms), [acceptedTerms]);
  const requiresPasswordChange = Boolean(profile?.requiresPasswordReset);
  const needsTermsAcceptance = !profile?.acceptedTermsAt;
  const canSubmit =
    (needsTermsAcceptance ? termsAccepted : true) &&
    (!requiresPasswordChange || (hasStrongPassword(newPassword) && newPassword === confirmPassword));

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
          text: 'A nova senha precisa ter no mínimo 6 caracteres, 1 maiúscula, 1 minúscula e 1 número.',
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
      const updatedProfile = await alunoPublicAuthService.finalizeFirstAccess({
        partnerId: profile.id,
        acceptedTerms: Boolean(termsAccepted || profile?.acceptedTermsAt),
        acceptTermsVersion: TERMS_VERSION,
        setPassword: requiresPasswordChange,
        newPassword,
      });

      if (updatedProfile) {
        savePortalSession(updatedProfile);
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
          <Link to="/aluno" className="text-xs font-black uppercase tracking-widest text-slate-500">
            Interromper
          </Link>
        </div>

        <div className="space-y-6">
          {needsTermsAcceptance && (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-3 flex items-center gap-2">
                <FileText size={16} className="text-[#001a33]" />
                <h2 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Termos de Uso</h2>
              </div>
              {buildTermsAcceptedText()}
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
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Mínimo 6 caracteres, 1 maiúscula, 1 minúscula e 1 número"
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
                  A senha deve ter ao menos 6 caracteres, uma letra maiúscula, uma minúscula e um número.
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
