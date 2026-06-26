import React, { useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, CheckCircle2, ArrowRight, Clock, GraduationCap, Quote, ShieldCheck, UsersRound } from 'lucide-react';
import LoginForm from './components/LoginForm';
import { loginService } from './login.service';
import { LoginCredentials } from './login.types';
import { getPortalProfile, PortalAuthProfile, savePortalSession } from './portal-session';
import { supabase } from '../../lib/supabase';
import DailabsSignature from '../shared/components/DailabsSignature';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import {
  INSTITUTIONAL_LOGIN_MOTIVATIONAL_PHRASES,
  getRandomMotivationalPhrase,
} from './motivationalPhrases';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [checkingExternalLogin, setCheckingExternalLogin] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [loginStep, setLoginStep] = useState<'credentials' | 'polo_select'>('credentials');
  const [professorPolos, setProfessorPolos] = useState<{ id: string; nome: string }[]>([]);
  const [professorName, setProfessorName] = useState('');
  const [selectedPoloId, setSelectedPoloId] = useState('');
  const [pendingProfessor, setPendingProfessor] = useState<PortalAuthProfile | null>(null);

  const decodeRedirectPath = () => {
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    if (!redirect) return null;
    try {
      const decoded = decodeURIComponent(redirect);
      return decoded.startsWith('/') ? decoded : null;
    } catch {
      return null;
    }
  };

  const getPostLoginRoute = (profile: PortalAuthProfile) => {
    const redirectPath = decodeRedirectPath();
    if (redirectPath) return redirectPath;
    if (profile.tipo === 'Aluno') return '/aluno';
    if (profile.tipo === 'Professor') return '/professor';
    return '/gestor';
  };

  const handleAuthenticatedProfile = async (profile: PortalAuthProfile) => {
    if (profile.tipo === 'Professor' && (profile.poloIds || []).length > 1) {
      const { data: polosData, error: polosError } = await supabase
        .from('polos')
        .select('id, nome')
        .in('id', profile.poloIds || []);

      if (polosError) {
        throw new Error(polosError.message);
      }

      if (polosData && polosData.length > 1) {
        setProfessorPolos(polosData);
        setProfessorName(profile.nome);
        setSelectedPoloId(profile.activePoloId || polosData[0].id);
        setPendingProfessor(profile);
        setLoginStep('polo_select');
        return;
      }
    }

    savePortalSession(profile);
    navigate(getPostLoginRoute(profile));
  };

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    const finishGoogleReturn = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const hasOAuthReturn =
          window.location.hash.includes('access_token') ||
          window.location.search.includes('code=');

        if (!data.session || !hasOAuthReturn) return;

        const profile = await getPortalProfile();
        if (!mounted) return;

        if (!profile) {
          await loginService.logout();
          setErrorMessage('Conta Google autenticada, mas sem perfil válido no portal.');
          return;
        }

        await handleAuthenticatedProfile(profile);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : 'Não foi possível concluir o login com Google.');
      } finally {
        if (mounted) setCheckingExternalLogin(false);
      }
    };

    finishGoogleReturn();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogin = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const { error } = await loginService.login(credentials);
      if (error) {
        setErrorMessage(error);
        alert(error);
        return;
      }

      const profile = await getPortalProfile();
      if (!profile) {
        await loginService.logout();
        const message = 'Usuário autenticado, mas sem perfil válido para acesso. Verifique o cadastro do e-mail em parceiros/usuários do sistema.';
        setErrorMessage(message);
        alert(message);
        return;
      }

      await handleAuthenticatedProfile(profile);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Não foi possível autenticar.';
      setErrorMessage(message);
      alert(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      await loginService.loginWithGoogle('/sistema/login');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível iniciar o login com Google.';
      setErrorMessage(message);
      alert(message);
      setIsLoading(false);
    }
  };

  const handlePoloConfirm = () => {
    if (!pendingProfessor) return;
    const finalProfile = {
      ...pendingProfessor,
      activePoloId: selectedPoloId,
    };
    savePortalSession(finalProfile);
    navigate(getPostLoginRoute(finalProfile));
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
    () => getRandomMotivationalPhrase(INSTITUTIONAL_LOGIN_MOTIVATIONAL_PHRASES),
    []
  );

  if (checkingExternalLogin) {
    return <AccessCheckingScreen portal="Gestor" />;
  }

  return (
    <div className="relative min-h-screen w-full bg-slate-50 font-sans">
      <DailabsSignature tone="dark" className="absolute bottom-6 right-6 z-30" />
      <main className="grid min-h-screen lg:grid-cols-[1.04fr_0.96fr]">
        <section className="relative hidden overflow-hidden bg-[#001a33] text-white lg:block">
          <img src="/banner2.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
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
          <button
            type="button"
            onClick={() => navigate('/')}
            className="absolute left-16 top-10 z-20 rounded-2xl bg-white px-5 py-3 shadow-2xl shadow-black/20 transition hover:scale-[1.02]"
          >
            <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-12 w-auto object-contain" />
          </button>
          <div className="relative z-10 flex h-full flex-col justify-center px-16">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-600/20 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-100 backdrop-blur-md">
                <ShieldCheck size={14} /> Portal institucional
              </span>
              <h1 className="mt-6 text-5xl font-black uppercase leading-[0.98] tracking-tight xl:text-6xl">
                Gestão, professores e secretaria em um só acesso.
              </h1>
              <p className="mt-5 max-w-xl text-base font-semibold leading-relaxed text-slate-200/90">
                Entre para administrar turmas, acompanhar alunos, lançar atividades e manter a operação acadêmica no ritmo da Universo.
              </p>
              <div className="mt-7 max-w-xl rounded-3xl border border-blue-100/15 bg-white/10 p-4 shadow-2xl shadow-blue-950/20 backdrop-blur-xl">
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
              <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
                {[
                  { icon: Building2, label: 'Gestão' },
                  { icon: GraduationCap, label: 'Professor' },
                  { icon: UsersRound, label: 'Secretaria' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
                    <Icon size={20} className="text-blue-200" />
                    <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-white">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-center items-center p-6 sm:p-8 relative">
          <button
            onClick={() => navigate('/')}
            className="absolute top-6 left-6 flex items-center gap-2 text-slate-500 hover:text-[#4169E1] transition-colors text-sm font-bold uppercase tracking-widest group"
          >
            <div className="p-2 rounded-full bg-white border border-slate-200 shadow-sm group-hover:border-[#4169E1] transition-colors">
              <ArrowLeft size={16} />
            </div>
            <span className="hidden sm:inline">Voltar ao site</span>
          </button>

        {loginStep === 'credentials' ? (
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/70 sm:p-8">
            <div className="mb-10 text-center lg:text-left">
              <div className="mb-8 inline-block lg:hidden">
                <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="mx-auto h-12 w-auto object-contain" />
              </div>

              <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-700">
                <ShieldCheck size={13} /> Acesso institucional
              </span>
              <h2 className="text-3xl font-black text-[#001a33] mb-3">Bem-vindo de volta</h2>
              <p className="text-sm font-semibold leading-relaxed text-slate-500">Entre como gestor, professor ou secretaria para acessar o portal.</p>
              {errorMessage ? <p className="mt-3 text-xs text-red-600 font-bold">{errorMessage}</p> : null}
            </div>

            <LoginForm
              onSubmit={handleLogin}
              onGoogleLogin={handleGoogleLogin}
              isLoading={isLoading}
              onBack={() => navigate('/')}
              forgotPasswordHref="/recuperar-senha"
            />
          </div>
        ) : (
          <div className="w-full max-w-md animate-fadeIn rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/70 sm:p-8">
            <div className="mb-8 text-center lg:text-left">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 mx-auto lg:mx-0">
                <Building2 size={24} />
              </div>
              <h2 className="text-2xl font-black text-[#001a33] mb-2 uppercase tracking-tight">Escolha a Unidade</h2>
              <p className="text-slate-500 text-sm">
                Olá, <strong className="text-blue-700">{professorName}</strong>! Selecione em qual polo deseja realizar seus lançamentos no momento:
              </p>
            </div>

            <div className="space-y-3 mb-8">
              {professorPolos.map((polo) => {
                const isSelected = selectedPoloId === polo.id;
                return (
                  <button
                    key={polo.id}
                    onClick={() => setSelectedPoloId(polo.id)}
                    className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all text-left group ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 shadow-md ring-2 ring-blue-100'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl transition-colors ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                        <Building2 size={18} />
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${isSelected ? 'text-[#001a33]' : 'text-slate-700'}`}>
                          {polo.nome}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                          {polo.nome.toLowerCase().includes('matriz') ? 'Sede Central' : 'Filial'}
                        </p>
                      </div>
                    </div>
                    {isSelected ? (
                      <CheckCircle2 className="text-blue-600" size={18} />
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-slate-200" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              <button
                onClick={handlePoloConfirm}
                className="w-full bg-[#001a33] hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-900/20 text-white font-black py-4 rounded-xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2 group transform active:scale-[0.98]"
              >
                <span>Confirmar e Acessar</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => setLoginStep('credentials')}
                className="w-full bg-white border border-slate-200 text-slate-500 hover:text-slate-800 py-3.5 rounded-xl transition-all uppercase tracking-widest text-[10px] font-black text-center"
              >
                Voltar para Login
              </button>
            </div>
          </div>
        )}
        </section>
      </main>
    </div>
  );
};

export default LoginPage;
