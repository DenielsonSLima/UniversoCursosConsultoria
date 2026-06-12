
// File: modules/gestor/secretaria/SecretariaPage.tsx

import React, { useState } from 'react';
import { FileText, ArrowLeft } from 'lucide-react';
import SecretariaDashboard from './components/SecretariaDashboard';
import SecretariaAlunosPage from './alunos/SecretariaAlunosPage';
import SecretariaDocumentosPage from './documentos/SecretariaDocumentosPage';
import SecretariaBoletinsPage from './boletins/SecretariaBoletinsPage';
import SecretariaCarteirinhasPage from './carteirinhas/SecretariaCarteirinhasPage';

const SecretariaPage: React.FC = () => {
  const [activeModule, setActiveModule] = useState<string>('dashboard');

  const renderContent = () => {
    switch (activeModule) {
      case 'alunos':
        return <SecretariaAlunosPage />;
      case 'declaracao':
      case 'transferencia':
        // Passamos o tipo inicial para a página de documentos saber o que abrir
        return <SecretariaDocumentosPage initialType={activeModule} />;
      case 'boletim':
        return <SecretariaBoletinsPage />;
      case 'carteirinha':
        return <SecretariaCarteirinhasPage />;
      default:
        return <SecretariaDashboard onNavigate={setActiveModule} />;
    }
  };

  return (
    <div className="animate-fadeIn min-h-screen pb-10">
      {/* Header Geral da Secretaria (Aparece em todos, com botão voltar se não estiver no dashboard) */}
      <div className="mb-8 flex items-center gap-4">
        {activeModule !== 'dashboard' && (
          <button 
            onClick={() => setActiveModule('dashboard')}
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors bg-white shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        
        <div>
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <FileText size={20} />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Módulo Administrativo</span>
          </div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Secretaria Digital
          </h2>
          {activeModule === 'dashboard' ? (
            <p className="text-slate-500 font-medium">Selecione uma operação abaixo.</p>
          ) : (
            <p className="text-slate-500 font-medium capitalize">
                Gerenciamento de {activeModule.replace('declaracao', 'Documentos').replace('transferencia', 'Transferências')}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {renderContent()}
      </div>
    </div>
  );
};

export default SecretariaPage;
