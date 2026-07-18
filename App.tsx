
// File: App.tsx

import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import SeoManager from './modules/public/components/SeoManager';
import VersionedPortal from './modules/shared/components/VersionedPortal';
import AccessCheckingScreen from './modules/shared/components/AccessCheckingScreen';
import { TECHNICAL_LANDING_ROUTE_PATTERN } from './modules/public/landing-pages/cursos-tecnicos/technicalLanding.routes';

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
const AlunoEmailConfirmationPage = lazy(() => import('./modules/public/login/AlunoEmailConfirmationPage'));
const AlunoFirstAccessPage = lazy(() => import('./modules/public/login/AlunoFirstAccessPage'));
const ValidatorPage = lazy(() => import('./modules/public/validator/ValidatorPage'));
const PasswordRecoveryPage = lazy(() => import('./modules/login/PasswordRecoveryPage'));
const LoginPage = lazy(() => import('./modules/login/LoginPage'));
const GestorPage = lazy(() => import('./modules/gestor/gestor.page'));
const ProfessorPage = lazy(() => import('./modules/professor/professor.page'));
const AlunoPage = lazy(() => import('./modules/aluno/aluno.page'));
const TechnicalLandingRoute = lazy(() => import('./modules/public/landing-pages/cursos-tecnicos/TechnicalLandingRoute'));

const RouteLoadingScreen = () => {
  const pathname = window.location.pathname;
  if (pathname.startsWith('/gestor')) return <AccessCheckingScreen portal="Gestor" />;
  if (pathname.startsWith('/professor')) return <AccessCheckingScreen portal="Professor" />;
  if (pathname.startsWith('/aluno')) return <AccessCheckingScreen portal="Aluno" />;

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
  return (
    <BrowserRouter>
      <SeoManager />
      <Suspense fallback={<RouteLoadingScreen />}>
        <Routes>

        {/* ── Rotas Públicas (sempre disponíveis) ── */}
        <Route path="/" element={<PublicPage />} />
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
        <Route path="/confirmacao-email" element={<AlunoEmailConfirmationPage />} />
        <Route path="/primeiro-acesso" element={<AlunoFirstAccessPage />} />
        <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />

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
        <Route path="/gestor/*" element={<VersionedPortal><GestorPage /></VersionedPortal>} />
        <Route path="/professor/*" element={<VersionedPortal><ProfessorPage /></VersionedPortal>} />
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
