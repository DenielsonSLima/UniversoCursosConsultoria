import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Home, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  alunoPublicAuthService,
  getSafePublicAlunoRedirectPath,
} from './aluno-public-auth.service';
import { formatCpf } from '../../shared/utils/identityValidation';

interface ConfirmedAlunoData {
  nome: string;
  email: string;
  cpf: string;
}

type ConfirmationState =
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string; nextPath: string; aluno: ConfirmedAlunoData }
  | { status: 'error'; message: string };

const getHashOrSearchParam = (name: string) => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get(name) || searchParams.get(name);
};

const clearAuthParams = () => {
  const url = new URL(window.location.href);
  ['code', 'error', 'error_code', 'error_description'].forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
};

const getConfirmedAlunoData = async (profile: any): Promise<ConfirmedAlunoData> => {
  const fallback = {
    nome: String(profile?.nome || 'Aluno'),
    email: String(profile?.email || ''),
    cpf: '',
  };

  if (!profile?.id) return fallback;

  const { data, error } = await supabase
    .from('parceiros')
    .select('nome, email, cpf_cnpj')
    .eq('id', profile.id)
    .maybeSingle();

  if (error || !data) return fallback;

  return {
    nome: String(data.nome || fallback.nome),
    email: String(data.email || fallback.email),
    cpf: formatCpf(String(data.cpf_cnpj || '')),
  };
};

const AlunoEmailConfirmationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const alunoLoginPath = window.location.pathname.startsWith('/aluno/') ? '/aluno/entrar' : '/login';
  const [state, setState] = useState<ConfirmationState>({
    status: 'loading',
    message: 'Confirmando seu e-mail...',
  });

  const nextPath = useMemo(() => {
    const redirect = searchParams.get('redirect');
    return getSafePublicAlunoRedirectPath(redirect, alunoLoginPath);
  }, [alunoLoginPath, searchParams]);

  useEffect(() => {
    let mounted = true;

    const confirmEmail = async () => {
      try {
        const errorDescription = getHashOrSearchParam('error_description') || getHashOrSearchParam('error');
        if (errorDescription) {
          throw new Error(alunoPublicAuthService.getFriendlyAuthRedirectError(errorDescription));
        }

        const code = getHashOrSearchParam('code');
        const accessToken = getHashOrSearchParam('access_token');
        const hasAuthReturn = Boolean(
          code ||
          accessToken,
        );
        if (!hasAuthReturn) {
          throw new Error('Abra o link de confirmação enviado ao seu e-mail. Se ele já foi usado, entre normalmente com sua senha.');
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw new Error(alunoPublicAuthService.getFriendlyAuthRedirectError(exchangeError.message));
          }
          clearAuthParams();
        }

        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          throw new Error('Não foi possível abrir a sessão de confirmação. Tente entrar com seu e-mail e senha.');
        }
        if (accessToken && data.session.access_token !== accessToken) {
          throw new Error('O link de confirmação não corresponde à sessão aberta. Abra novamente o link recebido por e-mail.');
        }

        const profile = await alunoPublicAuthService.finishExternalLogin();
        const aluno = await getConfirmedAlunoData(profile);
        try {
          const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
          if (signOutError) console.warn('Não foi possível encerrar a sessão local após a confirmação.', signOutError);
        } catch (signOutError) {
          console.warn('Não foi possível encerrar a sessão local após a confirmação.', signOutError);
        }
        if (!mounted) return;

        setState({
          status: 'success',
          message: 'E-mail confirmado e cadastro ativado com sucesso.',
          nextPath,
          aluno,
        });
      } catch (error) {
        if (!mounted) return;
        setState({
          status: 'error',
          message: error instanceof Error
            ? error.message
            : 'Não foi possível confirmar seu e-mail. Tente entrar novamente.',
        });
      }
    };

    confirmEmail();

    return () => {
      mounted = false;
    };
  }, [nextPath]);

  const isLoading = state.status === 'loading';
  const isSuccess = state.status === 'success';

  return (
    <main className="min-h-screen bg-[#f5f8fc] text-[#001a33]">
      <div className="grid min-h-screen lg:grid-cols-[0.92fr_1.08fr]">
        <section className="relative hidden overflow-hidden bg-[#002b5c] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[url('/about-alunos.jpeg')] bg-cover bg-center opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-br from-[#001a33] via-[#003c7c]/90 to-[#4169e1]/70" />
          <div className="relative z-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-white/90 backdrop-blur transition hover:bg-white/20"
            >
              <Home size={15} />
              Site
            </Link>
          </div>
          <div className="relative z-10 max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-white/80">
              <ShieldCheck size={16} />
              Portal do Aluno
            </div>
            <h1 className="text-5xl font-black uppercase leading-[0.95] tracking-tight xl:text-6xl">
              Cadastro confirmado.
            </h1>
            <p className="mt-6 max-w-lg text-lg font-semibold leading-relaxed text-white/78">
              Agora seu acesso fica vinculado ao portal da Universo Cursos e Consultoria.
            </p>
          </div>
          <div className="relative z-10 rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/65">Próximo passo</p>
            <p className="mt-3 text-base font-bold text-white">Entrar no portal e continuar sua matrícula online.</p>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-200/80 sm:p-10">
            <div className={`mb-8 inline-flex h-16 w-16 items-center justify-center rounded-2xl ${
              isSuccess ? 'bg-emerald-50 text-emerald-600' : state.status === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
            }`}>
              {isLoading ? <Loader2 className="animate-spin" size={30} /> : isSuccess ? <MailCheck size={32} /> : <ShieldCheck size={32} />}
            </div>

            <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-slate-400">
              Universo Cursos e Consultoria
            </p>
            <h2 className="text-3xl font-black tracking-tight text-[#001a33] sm:text-4xl">
              {isLoading ? 'Confirmando seu e-mail' : isSuccess ? 'E-mail confirmado' : 'Confirmação pendente'}
            </h2>
            <p className="mt-4 text-base font-semibold leading-relaxed text-slate-600">
              {state.message}
            </p>

            {isSuccess ? (
              <>
                <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                    Cadastro confirmado
                  </p>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="font-black uppercase tracking-[0.16em] text-slate-400">Aluno</dt>
                      <dd className="mt-1 font-bold text-slate-800">{state.aluno.nome}</dd>
                    </div>
                    <div>
                      <dt className="font-black uppercase tracking-[0.16em] text-slate-400">E-mail</dt>
                      <dd className="mt-1 break-words font-bold text-slate-800">{state.aluno.email}</dd>
                    </div>
                    {state.aluno.cpf ? (
                      <div>
                        <dt className="font-black uppercase tracking-[0.16em] text-slate-400">CPF</dt>
                        <dd className="mt-1 font-bold text-slate-800">{state.aluno.cpf}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>

                <button
                  onClick={() => navigate(state.nextPath)}
                  className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#2563eb] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-blue-500/25 transition hover:-translate-y-0.5 hover:bg-[#1d4ed8]"
                >
                  Ir para o login
                  <ArrowRight size={18} />
                </button>
              </>
            ) : (
              <Link
                to={alunoLoginPath}
                className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#001a33] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-[#06284a]"
              >
                Ir para login
                <ArrowRight size={18} />
              </Link>
            )}

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 text-emerald-600" size={18} />
                <p className="text-sm font-semibold leading-relaxed text-slate-600">
                  Se você abriu mais de um e-mail de confirmação, use sempre o link mais recente.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default AlunoEmailConfirmationPage;
