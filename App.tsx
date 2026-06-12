
// File: App.tsx

import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import PublicPage from './modules/public/public.page';
import FaqPage from './modules/public/faq/FaqPage';
import ContactPage from './modules/public/contact/ContactPage';
import PrivacyPage from './modules/public/privacy/PrivacyPage';
import TermsPage from './modules/public/terms/TermsPage';
import LoginPage from './modules/login/LoginPage';
import GestorPage from './modules/gestor/gestor.page';
import ProfessorPage from './modules/professor/professor.page';
import AlunoPage from './modules/aluno/aluno.page';
import CadAedPage from './modules/cad-aed/cad-aed.page';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<PublicPage />} />
        <Route path="/contato" element={<ContactPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/privacidade" element={<PrivacyPage />} />
        <Route path="/termos" element={<TermsPage />} />
        <Route path="/validador" element={<Navigate to="/" replace />} />
        
        <Route path="/login" element={<LoginPage />} />
        
        {/* Rotas dos Painéis (Futuramente proteger com Guard) */}
        <Route path="/gestor" element={<GestorPage />} />
        <Route path="/professor" element={<ProfessorPage />} />
        <Route path="/aluno" element={<AlunoPage />} />
        <Route path="/cad-aed" element={<CadAedPage />} />

        {/* Redireciona qualquer rota não encontrada para a home para evitar tela preta */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
