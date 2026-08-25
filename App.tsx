
// File: App.tsx

import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';

import SeoManager from './modules/public/components/SeoManager';
import VersionedPortal from './modules/shared/components/VersionedPortal';
import AccessCheckingScreen from './modules/shared/components/AccessCheckingScreen';
import RouteScrollManager from './modules/shared/components/RouteScrollManager';
import AlunoAppSplash from './modules/aluno/pwa/AlunoAppSplash';
import AlunoPwaRuntime from './modules/aluno/pwa/AlunoPwaRuntime';
import AlunoConnectivityStatus from './modules/aluno/pwa/AlunoConnectivityStatus';
import NativeAuthBridge from './modules/shared/auth/NativeAuthBridge';
import NativeTurnstileChallengePage from './modules/shared/auth/NativeTurnstileChallengePage';
import NativePushBridge from './modules/aluno/native-app/NativePushBridge';
import NativePushPermissionBootstrap from './modules/aluno/native-app/NativePushPermissionBootstrap';
import { TECHNICAL_LANDING_ROUTE_PATTERN } from './modules/public/landing-pages/cursos-tecnicos/technicalLanding.routes';
import { getLegacyCoordinatorRedirect } from './modules/login/coordinator-portal-redirect';

const PublicPage = lazy(() => import('./modules/public/public.page'));
const FaqPage = lazy(() => import('./modules/public/faq/FaqPage'));
const ContactPage = lazy(() => import('./modules/public/contact/ContactPage'));
const PrivacyPage = lazy(() => import('./modules/public/privacy/PrivacyPage'));
const TermsPage = lazy(() => import('./modules/public/terms/TermsPage'));
const CookiesPage = lazy(() => import('./modules/public/cookies/CookiesPage'));
const EnsinoSuperiorPublicPage = lazy(() => import('./modules/public/ensino-superior/EnsinoSuperiorPublicPage'));
const CursosTecnicosPublicPage = lazy(() => import('./modules/public/cursos-tecnicos/CursosTecnicosPublicPage'));
const CursoTecnicoDetailPage = lazy(() => import('./modules/public/cursos-tecnicos/CursoTecnicoDetailPage'));
const CursosLivresPublicPage = lazy(() => import('./modules/public/cursos-livres/CursosLivresPublicPage'));
const CursoLivreDetailPage = lazy(() => import('./modules/public/cursos-livres/CursoLivreDetailPage'));
const EspecializacaoPublicPage = lazy(() => import('./modules/public/especializacao/EspecializacaoPublicPage'));
const EspecializacaoDetailPage = lazy(() => import('./modules/public/especializacao/EspecializacaoDetailPage'));
const EadPublicPage = lazy(() => import('./modules/public/ead/EadPublicPage'));
const EadDetailPage = lazy(() => import('./modules/public/ead/EadDetailPage'));
const AlunoLoginPublicPage = lazy(() => import('./modules/public/login/AlunoLoginPublicPage'));
const AlunoAppLoginPage = lazy(() => import('./modules/aluno/login-app/AlunoAppLoginPage'));
const AlunoAppSignupPage = lazy(() => import('./modules/aluno/login-app/AlunoAppSignupPage'));
const AlunoAppRecoveryPage = lazy(() => import('./modules/aluno/login-app/AlunoAppRecoveryPage'));
const AlunoPublicSupportPage = lazy(() => import('./modules/aluno/login-app/AlunoPublicSupportPage'));
const AlunoEmailConfirmationPage = lazy(() => import('./modules/public/login/AlunoEmailConfirmationPage'));
const AlunoFirstAccessPage = lazy(() => import('./modules/public/login/AlunoFirstAccessPage'));
const ResponsavelFirstAccessPage = lazy(() => import('./modules/responsavel/ResponsavelFirstAccessPage'));
const ValidatorPage = lazy(() => import('./modules/public/validator/ValidatorPage'));
const PasswordRecoveryPage = lazy(() => import('./modules/login/PasswordRecoveryPage'));
const LoginPage = lazy(() => import('./modules/login/LoginPage'));
const GestorPage = lazy(() => import('./modules/gestor/gestor.page'));
const ProfessorPage = lazy(() => import('./modules/professor/professor.page'));
const ResponsavelPage = lazy(() => import('./modules/responsavel/responsavel.page'));
const AlunoPage = lazy(() => import('./modules/aluno/aluno.page'));
const TechnicalLandingRoute = lazy(() => import('./modules/public/landing-pages/cursos-tecnicos/TechnicalLandingRoute'));
const BioPage = lazy(() => import('./modules/public/bio/BioPage'));
const LegacyCoordinatorRedirect = () => {
  const location = useLocation();
  return <Navigate to={getLegacyCoordinatorRedirect(location)} replace />;
};

const RouteLoadingScreen = () => {
  const pathname = window.location.pathname;
  if (pathname.startsWith('/gestor')) return <AccessCheckingScreen portal="Gestor" />;
  if (pathname.startsWith('/professor')) return <AccessCheckingScreen portal="Professor" />;
  if (pathname.startsWith('/responsavel')) return <AccessCheckingScreen portal="Responsavel" />;
  if (pathname.startsWith('/coordenador')) return <AccessCheckingScreen portal="Professor" />;
  if (pathname === '/aluno' || pathname.startsWith('/aluno/')) return <AlunoAppSplash />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-slate-200 bg-white px-10 py-8 shadow-xl">
        <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-14 w-48 object-contain" />
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" aria-label="Carregando página" />
      </div>
    </main>
  );
};

const App: React.FC = () => {
  // Esta página vive dentro do iframe nativo de segurança. Ela não pode
  // passar pelo Suspense/fallback global (que exibe a marca da Universo), nem
  // iniciar bridges, consultas ou shells que não pertencem ao Cloudflare.
  if (window.location.pathname === '/native-auth/turnstile') {
    return <NativeTurnstileChallengePage />;
  }

  return (
    <BrowserRouter>
      <NativeAuthBridge />
      <NativePushBridge />
      <NativePushPermissionBootstrap />
      <RouteScrollManager />
      <SeoManager />
      <AlunoPwaRuntime />
      <AlunoConnectivityStatus />
      <Suspense fallback={<RouteLoadingScreen />}>
        <Routes>

        {/* ── Rotas Públicas (sempre disponíveis) ── */}
        <Route path="/" element={<PublicPage />} />
        <Route path="/links" element={<BioPage />} />
        <Route path="/bio" element={<BioPage />} />
        <Route path="/linktree" element={<BioPage />} />
        <Route path="/contato" element={<ContactPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/privacidade" element={<PrivacyPage />} />
        <Route path="/termos" element={<TermsPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="/ensino-superior" element={<EnsinoSuperiorPublicPage />} />
        <Route path="/cursos-tecnicos" element={<CursosTecnicosPublicPage />} />
        <Route path="/cursos-tecnicos/detalhes/:id" element={<CursoTecnicoDetailPage />} />
        <Route path={TECHNICAL_LANDING_ROUTE_PATTERN} element={<TechnicalLandingRoute />} />
        <Route path="/cursos-livres" element={<CursosLivresPublicPage />} />
        <Route path="/cursos-livres/detalhes/:id" element={<CursoLivreDetailPage />} />
        <Route path="/especializacao" element={<EspecializacaoPublicPage />} />
        <Route path="/especializacao/detalhes/:id" element={<EspecializacaoDetailPage />} />

        {/* ── Login público do aluno ── */}
        <Route path="/login" element={<AlunoLoginPublicPage />} />
        <Route path="/cadastro" element={<AlunoLoginPublicPage />} />
        <Route path="/confirmacao-email" element={<AlunoEmailConfirmationPage />} />
        <Route path="/primeiro-acesso" element={<AlunoFirstAccessPage />} />
        <Route path="/responsavel/primeiro-acesso" element={<ResponsavelFirstAccessPage />} />
        <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />

        {/* ── Rotas instaláveis do aluno: mantidas dentro do escopo /aluno/ ── */}
        <Route path="/aluno/login-app" element={<AlunoAppLoginPage />} />
        <Route path="/aluno/cadastro-app" element={<AlunoAppSignupPage />} />
        <Route path="/aluno/recuperar-senha-app" element={<AlunoAppRecoveryPage />} />
        <Route path="/aluno/atendimento-publico" element={<AlunoPublicSupportPage />} />
        <Route path="/aluno/entrar" element={<AlunoLoginPublicPage />} />
        <Route path="/aluno/cadastro" element={<Navigate to="/aluno/cadastro-app" replace />} />
        <Route path="/aluno/confirmacao-email" element={<AlunoEmailConfirmationPage />} />
        <Route path="/aluno/primeiro-acesso" element={<AlunoFirstAccessPage />} />
        <Route path="/aluno/recuperar-senha" element={<Navigate to="/aluno/recuperar-senha-app" replace />} />

        {/* ── Atalhos compartilháveis para unidades e localização ── */}
        <Route path="/localizacao" element={<ContactPage />} />
        <Route path="/polos" element={<ContactPage />} />

        {/* ── Cursos EAD ── */}
        {/* Em produção: redireciona para a plataforma EAD externa */}
        {/* Em desenvolvimento: idem (não há um painel EAD local ainda) */}
        <Route
          path="/ead"
          element={<EadPublicPage />}
        />
        <Route
          path="/ead/detalhes/:id"
          element={<EadDetailPage />}
        />
        <Route
          path="/ead/:slug/:id"
          element={<EadDetailPage />}
        />
        <Route path="/validador" element={<ValidatorPage />} />
        <Route path="/validator" element={<Navigate to={`/validador${window.location.search}`} replace />} />

        {/* ── Rotas do Sistema Interno ── */}
        <Route path="/sistema/login" element={<LoginPage />} />
        <Route
          path="/sistema/primeiro-acesso"
          element={<PasswordRecoveryPage audience="institutional" intent="invite" />}
        />
        <Route path="/gestor/*" element={<VersionedPortal><GestorPage /></VersionedPortal>} />
        <Route path="/professor/*" element={<VersionedPortal><ProfessorPage /></VersionedPortal>} />
        <Route path="/responsavel/*" element={<VersionedPortal><ResponsavelPage /></VersionedPortal>} />
        <Route path="/coordenador/*" element={<LegacyCoordinatorRedirect />} />
        <Route path="/cad-aed" element={<Navigate to="/sistema/login" replace />} />
        <Route path="/aluno/*" element={<VersionedPortal><AlunoPage /></VersionedPortal>} />

        {/* Redireciona qualquer rota não encontrada para a home */}
        <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
