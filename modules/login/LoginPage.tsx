import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, GraduationCap, Quote, ShieldCheck, UsersRound } from 'lucide-react';
import LoginForm from './components/LoginForm';
import { loginService } from './login.service';
import { LoginCredentials } from './login.types';
import { clearPortalSession, getInstitutionalProfiles, PortalAuthProfile, savePortalSession } from './portal-session';
import { getProfileSelectionErrorMessage, requiresProfessorPoloSelection, resolveProfilePostLoginRoute } from './profile-selection';
import { supabase } from '../../lib/supabase';
import ArkhenSignature from '../shared/components/ArkhenSignature';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';
import {
  clearOAuthReturnParams,
  clearPendingOAuthReturn,
  getOAuthReturnError,
  readPendingOAuthReturn,
  hasOAuthReturnInUrl,
} from '../shared/auth/oauth-return-state';
import {
  INSTITUTIONAL_LOGIN_MOTIVATIONAL_PHRASES,
  getRandomMotivationalPhrase,
} from './motivationalPhrases';
import type { User } from '@supabase/supabase-js';
import PortalProfileSelector, { portalProfileKey } from './components/PortalProfileSelector';
import { getPortalAccessErrorLog, getPortalAccessErrorMessage } from './institutional-login-error';
import { PortalContextServiceError } from './portal-context.service';
import { getInstitutionalOAuthErrorMessage, InstitutionalLoginClock } from './components/InstitutionalLoginPresentation';
import { resetProfileSelectionSession } from './profile-selection-session';
import ProfessorPoloSelector from './components/ProfessorPoloSelector';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingGoogleReturn] = useState(
    () => readPendingOAuthReturn('institucional'),
  );
  const [hasExternalAuthReturn] = useState(
    () => hasOAuthReturnInUrl() || Boolean(pendingGoogleReturn),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [checkingExternalLogin, setCheckingExternalLogin] = useState(hasExternalAuthReturn);

  const [loginStep, setLoginStep] = useState<'credentials' | 'role_select' | 'polo_select'>('credentials');
  const [institutionalProfiles, setInstitutionalProfiles] = useState<PortalAuthProfile[]>([]);
  const [professorPolos, setProfessorPolos] = useState<{ id: string; nome: string }[]>([]);
  const [professorName, setProfessorName] = useState('');
  const [selectedPoloId, setSelectedPoloId] = useState('');
  const [pendingProfessor, setPendingProfessor] = useState<PortalAuthProfile | null>(null);
  const [isSelectingProfile, setIsSelectingProfile] = useState(false);
  const [pendingProfileKey, setPendingProfileKey] = useState<string | null>(null);
  const [profileSelectionError, setProfileSelectionError] = useState('');
  const profileSelectionInFlightRef = useRef(false);

  const decodeRedirectPath = () => {
    const redirect =
      new URLSearchParams(window.location.search).get('redirect') ||
      pendingGoogleReturn?.redirectPath;
    if (!redirect) return null;
    try {
      const decoded = decodeURIComponent(redirect);
      return decoded.startsWith('/') && !decoded.startsWith('//') ? decoded : null;
    } catch {
      return null;
    }
  };

  const getPostLoginRoute = (profile: PortalAuthProfile) => {
    return resolveProfilePostLoginRoute(profile.tipo, decodeRedirectPath());
  };

  const handleAuthenticatedProfile = async (profile: PortalAuthProfile): Promise<boolean> => {
    let profileToAuthenticate = profile;

    if (requiresProfessorPoloSelection(profile)) {
      const { data: polosData, error: polosError } = await supabase
        .from('polos')
        .select('id, nome')
        .in('id', profile.poloIds || []);

      if (polosError) {
        throw new PortalContextServiceError(polosError.message, polosError.code);
      }

      if (!polosData?.length) {
        throw new Error('Nenhum polo vinculado está disponível para acesso.');
      }

      if (polosData.length > 1) {
        setProfessorPolos(polosData);
        setProfessorName(profile.nome);
        setSelectedPoloId(
          polosData.some((polo) => polo.id === profile.activePoloId)
            ? profile.activePoloId || polosData[0].id
            : polosData[0].id,
        );
        setPendingProfessor(profile);
        setLoginStep('polo_select');
        return false;
      }

      profileToAuthenticate = {
        ...profile,
        activePoloId: polosData[0].id,
      };
    }

    queryClient.clear();
    savePortalSession(profileToAuthenticate);
    navigate(getPostLoginRoute(profileToAuthenticate), { replace: true });
    return true;
  };

  const resolveInstitutionalAccess = async (
    authenticatedUser?: User | null,
  ) => {
    const profiles = await getInstitutionalProfiles(authenticatedUser);
    if (profiles.length === 0) return null;
    if (profiles.length === 1) return profiles[0];
    setInstitutionalProfiles(profiles);
    setLoginStep('role_select');
    return undefined;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('oauth_error');
    const message = getInstitutionalOAuthErrorMessage(oauthError);
    if (message) {
      setErrorMessage(message);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const finishGoogleReturn = async () => {
      let isLeavingLoginPage = false;

      try {
        if (!hasExternalAuthReturn) return;

        const authReturnError = getOAuthReturnError();
        if (authReturnError) {
          setErrorMessage(
            decodeURIComponent(String(authReturnError).replace(/\+/g, ' ')),
          );
          return;
        }

        // O cliente Supabase já processa o callback durante a inicialização.
        // getSession aguarda esse processamento e evita uma segunda troca PKCE.
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw new Error(sessionError.message);
        }
        const session = data?.session;

        if (!session) {
          setErrorMessage('Não foi possível recuperar a sessão do Google. Tente novamente.');
          return;
        }

        const profile = await resolveInstitutionalAccess(session.user);
        if (!mounted) return;

        if (profile === undefined) return;
        if (!profile) {
          await loginService.logout();
          setErrorMessage('Conta Google autenticada, mas sem vínculo com perfil no portal institucional. Entre com outro e-mail/senha ou solicite o vínculo no suporte.');
          return;
        }

        isLeavingLoginPage = await handleAuthenticatedProfile(profile);
      } catch (error) {
        if (!mounted) return;
        console.error(
          'Falha ao resolver acesso institucional após login com Google:',
          getPortalAccessErrorLog(error),
        );
        setErrorMessage(getPortalAccessErrorMessage(
          error,
          'Não foi possível concluir o login com Google.',
        ));
      } finally {
        if (mounted) {
          clearPendingOAuthReturn('institucional');
          clearOAuthReturnParams();
          // Se o perfil já disparou a navegação, a validação deve permanecer
          // montada até a próxima rota assumir, evitando o flash do formulário.
          if (!isLeavingLoginPage) setCheckingExternalLogin(false);
        }
      }
    };

    finishGoogleReturn();
    return () => {
      mounted = false;
    };
  }, [hasExternalAuthReturn]);

  const handleLogin = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const { error, user } = await loginService.login(credentials);
      if (error) {
        setErrorMessage(error);
        return;
      }

      const profile = await resolveInstitutionalAccess(user);
      if (profile === undefined) return;
      if (!profile) {
        await loginService.logout();
        const message = 'Usuário autenticado, mas sem perfil válido para acesso. Verifique o cadastro do e-mail em parceiros/usuários do sistema.';
        setErrorMessage(message);
        return;
      }

      await handleAuthenticatedProfile(profile);
    } catch (error) {
      console.error(
        'Falha ao resolver acesso institucional:',
        getPortalAccessErrorLog(error),
      );
      setErrorMessage(getPortalAccessErrorMessage(
        error,
        'Não foi possível autenticar.',
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      await loginService.loginWithGoogle('/sistema/login', decodeRedirectPath());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível iniciar o login com Google.';
      setErrorMessage(message);
      setIsLoading(false);
    }
  };

  const handlePoloConfirm = () => {
    if (!pendingProfessor) return;
    const finalProfile = {
      ...pendingProfessor,
      activePoloId: selectedPoloId,
    };
    queryClient.clear();
    savePortalSession(finalProfile);
    navigate(getPostLoginRoute(finalProfile));
  };

  const handleRoleSelect = async (profile: PortalAuthProfile) => {
    if (profileSelectionInFlightRef.current) return;

    const profileKey = portalProfileKey(profile);
    profileSelectionInFlightRef.current = true;
    setIsSelectingProfile(true);
    setPendingProfileKey(profileKey);
    setProfileSelectionError('');

    try {
      await handleAuthenticatedProfile(profile);
    } catch (error) {
      console.error(
        'Falha ao selecionar perfil institucional:',
        getPortalAccessErrorLog(error),
      );
      setProfileSelectionError(getProfileSelectionErrorMessage(profile));
    } finally {
      profileSelectionInFlightRef.current = false;
      setIsSelectingProfile(false);
      setPendingProfileKey(null);
    }
  };

  const handleProfileSelectionBack = async () => {
    setIsSelectingProfile(true);
    setProfileSelectionError('');
    try {
      await resetProfileSelectionSession({
        signOutLocal: () => supabase.auth.signOut({ scope: 'local' }),
        clearPortalSession,
        clearQueryCache: () => queryClient.clear(),
      });
      setInstitutionalProfiles([]);
      setProfessorPolos([]);
      setProfessorName('');
      setSelectedPoloId('');
      setPendingProfessor(null);
      setLoginStep('credentials');
    } catch {
      setProfileSelectionError('Não foi possível encerrar esta sessão neste dispositivo. Tente novamente.');
    } finally {
      setIsSelectingProfile(false);
    }
  };

  const dailyPhrase = useMemo(
    () => getRandomMotivationalPhrase(INSTITUTIONAL_LOGIN_MOTIVATIONAL_PHRASES),
    []
  );

  if (checkingExternalLogin) {
    return <AccessCheckingScreen portal="Gestor" />;
  }

  return (
    <div className="relative min-h-screen w-full bg-slate-50 font-sans">
      <main className="grid min-h-screen xl:grid-cols-[1.04fr_0.96fr]">
        <section className="relative hidden min-h-[640px] overflow-hidden bg-[#001a33] text-white lg:flex xl:min-h-screen">
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
            className="absolute left-10 top-8 z-20 rounded-2xl bg-white px-5 py-3 shadow-2xl shadow-black/20 transition hover:scale-[1.02] xl:left-12 xl:top-10 2xl:left-16"
          >
            <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-12 w-auto object-contain" />
          </button>
          <div className="relative z-10 flex h-full w-full flex-col justify-center px-10 pb-10 pt-32 xl:px-12 xl:py-0 2xl:px-16">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-600/20 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-100 backdrop-blur-md">
                <ShieldCheck size={14} /> Portal institucional
              </span>
              <h1 className="mt-6 text-[2.55rem] font-black uppercase leading-[0.98] tracking-tight xl:text-[2.8rem] 2xl:text-[3.2rem]">
                Gestão, professores e secretaria em um só acesso.
              </h1>
              <p className="mt-5 max-w-xl text-base font-semibold leading-relaxed text-slate-200/90">
                Entre para administrar turmas, acompanhar alunos, lançar atividades e manter a operação acadêmica no ritmo da Universo.
              </p>
                <div className="mt-7 max-w-xl rounded-3xl border border-blue-100/15 bg-white/10 p-4 shadow-2xl shadow-blue-950/20 backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
                    <InstitutionalLoginClock />
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

        <section className="relative flex min-h-screen flex-col items-center px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pb-10 sm:pt-8 lg:min-h-0 lg:py-16 xl:min-h-screen xl:justify-center">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Voltar ao site"
            className="group mb-4 flex w-full max-w-md items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-[#4169E1] xl:absolute xl:left-6 xl:top-6 xl:mb-0 xl:w-auto xl:max-w-none"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition-all group-hover:border-[#4169E1] group-hover:shadow-md">
              <ArrowLeft size={16} />
            </span>
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
              <p className="text-sm font-semibold leading-relaxed text-slate-500">Entre como gestor ou professor para acessar o portal. As atribuições de coordenação ficam disponíveis no acesso do professor.</p>
              {errorMessage ? <p className="mt-3 text-xs text-red-600 font-bold">{errorMessage}</p> : null}
            </div>

            <LoginForm
              onSubmit={handleLogin}
              onGoogleLogin={handleGoogleLogin}
              isLoading={isLoading}
              onBack={() => navigate('/')}
              forgotPasswordHref="/recuperar-senha?source=institucional"
            />
          </div>
        ) : loginStep === 'role_select' ? (
          <div className="w-full max-w-[560px] animate-fadeIn">
            {profileSelectionError ? (
              <p role="alert" className="mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold leading-relaxed text-red-600">
                {profileSelectionError}
              </p>
            ) : null}
            <PortalProfileSelector
              profiles={institutionalProfiles}
              isSelecting={isSelectingProfile}
              pendingProfileKey={pendingProfileKey}
              onSelect={handleRoleSelect}
              onBack={handleProfileSelectionBack}
            />
          </div>
        ) : (
          <ProfessorPoloSelector
            polos={professorPolos}
            professorName={professorName}
            selectedPoloId={selectedPoloId}
            errorMessage={profileSelectionError}
            isLeaving={isSelectingProfile}
            onSelect={setSelectedPoloId}
            onConfirm={handlePoloConfirm}
            onBack={handleProfileSelectionBack}
          />
        )}

          <div className="mt-5 flex w-full max-w-md justify-center pb-1 sm:justify-end sm:pr-2 xl:absolute xl:bottom-6 xl:right-6 xl:mt-0 xl:w-auto xl:max-w-none xl:pb-0 xl:pr-0">
            <ArkhenSignature tone="dark" />
          </div>
        </section>
      </main>
    </div>
  );
};

export default LoginPage;
