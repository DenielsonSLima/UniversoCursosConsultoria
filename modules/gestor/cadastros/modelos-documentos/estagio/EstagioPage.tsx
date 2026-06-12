import React from 'react';
import { Briefcase, Save } from 'lucide-react';

const EstagioPage: React.FC = () => {
  return (
    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 animate-fadeIn">
      <div className="flex items-center gap-4 mb-8 border-b border-slate-100 pb-6">
        <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl">
          <Briefcase size={32} />
        </div>
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Termo de Estágio</h3>
          <p className="text-slate-500 text-sm">Contratos e planos de atividades para estagiários.</p>
        </div>
      </div>

      <div className="p-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
        <p className="text-slate-500 font-bold mb-4">Cláusulas e campos do contrato de estágio...</p>
        <button className="px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 mx-auto">
          <Save size={16} /> Salvar Modelo
        </button>
      </div>
    </div>
  );
};

export default EstagioPage;
