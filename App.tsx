
// File: App.tsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Páginas Públicas (sempre disponíveis)
import PublicPage from './modules/public/public.page';
import FaqPage from './modules/public/faq/FaqPage';
import ContactPage from './modules/public/contact/ContactPage';
import PrivacyPage from './modules/public/privacy/PrivacyPage';
import TermsPage from './modules/public/terms/TermsPage';
import EnsinoSuperiorPublicPage from './modules/public/ensino-superior/EnsinoSuperiorPublicPage';
import CursosTecnicosPublicPage from './modules/public/cursos-tecnicos/CursosTecnicosPublicPage';
import CursoTecnicoDetailPage from './modules/public/cursos-tecnicos/CursoTecnicoDetailPage';
import CursosLivresPublicPage from './modules/public/cursos-livres/CursosLivresPublicPage';
import CursoLivreDetailPage from './modules/public/cursos-livres/CursoLivreDetailPage';
import EspecializacaoPublicPage from './modules/public/especializacao/EspecializacaoPublicPage';
import EspecializacaoDetailPage from './modules/public/especializacao/EspecializacaoDetailPage';
import SeoManager from './modules/public/components/SeoManager';
import EadPublicPage from './modules/public/ead/EadPublicPage';
import AlunoLoginPublicPage from './modules/public/login/AlunoLoginPublicPage';

// Páginas do Sistema Interno (somente em desenvolvimento)
import LoginPage from './modules/login/LoginPage';
import GestorPage from './modules/gestor/gestor.page';
import ProfessorPage from './modules/professor/professor.page';
import AlunoPage from './modules/aluno/aluno.page';
import CadAedPage from './modules/cad-aed/cad-aed.page';

// ─────────────────────────────────────────────────────────────────────────────
// Modo da aplicação controlado por variável de ambiente
// .env.local → VITE_APP_MODE=development  (sistema completo)
// Vercel     → VITE_APP_MODE=production   (apenas site público)
// ─────────────────────────────────────────────────────────────────────────────
const isDevelopmentMode = import.meta.env.VITE_APP_MODE === 'development';

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
        <Route path="/ensino-superior" element={<EnsinoSuperiorPublicPage />} />
        <Route path="/cursos-tecnicos" element={<CursosTecnicosPublicPage />} />
        <Route path="/cursos-tecnicos/detalhes/:id" element={<CursoTecnicoDetailPage />} />
        <Route path="/cursos-livres" element={<CursosLivresPublicPage />} />
        <Route path="/cursos-livres/detalhes/:id" element={<CursoLivreDetailPage />} />
        <Route path="/especializacao" element={<EspecializacaoPublicPage />} />
        <Route path="/especializacao/detalhes/:id" element={<EspecializacaoDetailPage />} />

        {/* ── Login ── */}
        {/* Em produção: redireciona para o Proesc (sistema externo do aluno) */}
        {/* Em desenvolvimento: abre o sistema interno de login */}
        <Route
          path="/login"
          element={
            isDevelopmentMode
              ? <LoginPage />
              : <AlunoLoginPublicPage />
          }
        />

        {/* ── Cursos EAD ── */}
        {/* Em produção: redireciona para a plataforma EAD externa */}
        {/* Em desenvolvimento: idem (não há um painel EAD local ainda) */}
        <Route
          path="/ead"
          element={<EadPublicPage />}
        />

        {/* ── Rotas do Sistema Interno ── */}
        {/* Completamente ocultas em produção — qualquer acesso vai para a home */}
        {isDevelopmentMode ? (
          <>
            <Route path="/gestor/*" element={<GestorPage />} />
            <Route path="/professor/*" element={<ProfessorPage />} />
            <Route path="/aluno/*" element={<AlunoPage />} />
            <Route path="/cad-aed" element={<CadAedPage />} />
            {/* Validador — será implementado na Fase 3 */}
            <Route path="/validador" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            {/* Em produção: redireciona qualquer rota interna para a home */}
            <Route path="/gestor/*" element={<Navigate to="/" replace />} />
            <Route path="/professor/*" element={<Navigate to="/" replace />} />
            <Route path="/aluno/*" element={<Navigate to="/" replace />} />
            <Route path="/cad-aed" element={<Navigate to="/" replace />} />
            <Route path="/validador" element={<Navigate to="/" replace />} />
          </>
        )}

        {/* Redireciona qualquer rota não encontrada para a home */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
};

export default App;
