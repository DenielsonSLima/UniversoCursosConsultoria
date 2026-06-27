
// File: App.tsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Páginas Públicas (sempre disponíveis)
import PublicPage from './modules/public/public.page';
import FaqPage from './modules/public/faq/FaqPage';
import ContactPage from './modules/public/contact/ContactPage';
import PrivacyPage from './modules/public/privacy/PrivacyPage';
import TermsPage from './modules/public/terms/TermsPage';
import CookiesPage from './modules/public/cookies/CookiesPage';
import EnsinoSuperiorPublicPage from './modules/public/ensino-superior/EnsinoSuperiorPublicPage';
import CursosTecnicosPublicPage from './modules/public/cursos-tecnicos/CursosTecnicosPublicPage';
import CursoTecnicoDetailPage from './modules/public/cursos-tecnicos/CursoTecnicoDetailPage';
import CursosLivresPublicPage from './modules/public/cursos-livres/CursosLivresPublicPage';
import CursoLivreDetailPage from './modules/public/cursos-livres/CursoLivreDetailPage';
import EspecializacaoPublicPage from './modules/public/especializacao/EspecializacaoPublicPage';
import EspecializacaoDetailPage from './modules/public/especializacao/EspecializacaoDetailPage';
import SeoManager from './modules/public/components/SeoManager';
import EadPublicPage from './modules/public/ead/EadPublicPage';
import EadDetailPage from './modules/public/ead/EadDetailPage';
import AlunoLoginPublicPage from './modules/public/login/AlunoLoginPublicPage';
import ValidatorPage from './modules/public/validator/ValidatorPage';
import PasswordRecoveryPage from './modules/login/PasswordRecoveryPage';
import AlunoFirstAccessPage from './modules/public/login/AlunoFirstAccessPage';

// Páginas do Sistema Interno
import LoginPage from './modules/login/LoginPage';
import GestorPage from './modules/gestor/gestor.page';
import ProfessorPage from './modules/professor/professor.page';
import AlunoPage from './modules/aluno/aluno.page';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <SeoManager />
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
        <Route path="/cursos-livres" element={<CursosLivresPublicPage />} />
        <Route path="/cursos-livres/detalhes/:id" element={<CursoLivreDetailPage />} />
        <Route path="/especializacao" element={<EspecializacaoPublicPage />} />
        <Route path="/especializacao/detalhes/:id" element={<EspecializacaoDetailPage />} />

        {/* ── Login público do aluno ── */}
        <Route path="/login" element={<AlunoLoginPublicPage />} />
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
        <Route path="/gestor/*" element={<GestorPage />} />
        <Route path="/professor/*" element={<ProfessorPage />} />
        <Route path="/cad-aed" element={<Navigate to="/sistema/login" replace />} />
        <Route path="/aluno/*" element={<AlunoPage />} />

        {/* Redireciona qualquer rota não encontrada para a home */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
};

export default App;
