
import React from 'react';

const EadPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-slate-200 pb-4">
          <h1 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">Ambiente Virtual de Aprendizagem</h1>
          <p className="text-slate-600 mt-2">Bem-vindo à sua sala de aula digital.</p>
        </header>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Placeholder para conteúdo futuro */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-lg text-blue-900 mb-2">Meus Cursos</h3>
            <p className="text-slate-500 text-sm">Acesse o conteúdo das suas disciplinas.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EadPage;
