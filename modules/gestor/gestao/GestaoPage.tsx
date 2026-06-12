
// File: modules/gestor/gestao/GestaoPage.tsx

import React, { useState } from 'react';
import { Briefcase, Zap, Award, MonitorPlay, Activity, Users, BookOpen } from 'lucide-react';
import GestaoTecnicos from './tecnicos/GestaoTecnicos';
import GestaoLivres from './livres/GestaoLivres';
import GestaoEspecializacao from './especializacao/GestaoEspecializacao';
import GestaoEad from './ead/GestaoEad';

const GestaoPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tecnicos' | 'livres' | 'especializacao' | 'ead'>('tecnicos');
  const [isDetailView, setIsDetailView] = useState(false);

  const tabs = [
    { id: 'tecnicos', label: 'Cursos Técnicos', icon: <Briefcase size={18} /> },
    { id: 'livres', label: 'Cursos Livres', icon: <Zap size={18} /> },
    { id: 'especializacao', label: 'Especialização', icon: <Award size={18} /> },
    { id: 'ead', label: 'EAD / Online', icon: <MonitorPlay size={18} /> },
  ];

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn">
      
      {/* Header Geral do Módulo - Oculto apenas se estiver em Detalhes */}
      {!isDetailView && (
        <div className="mb-8">
          
          <div className="bg-[#001a33] text-white rounded-[2.5rem] p-8 md:p-10 mb-8 relative overflow-hidden shadow-xl">
             {/* Abstract background shapes */}
             <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
             <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4"></div>

             <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                     <span className="bg-blue-500/20 text-blue-300 font-bold px-3 py-1 rounded-full text-[10px] tracking-widest uppercase border border-blue-500/30 flex items-center gap-2">
                       <Activity size={12} className="text-emerald-400" /> Operacional
                     </span>
                  </div>
                  <h2 className="text-4xl font-black text-white uppercase tracking-tight mb-2">Gestão de Turmas</h2>
                  <p className="text-blue-200 font-medium max-w-lg text-sm leading-relaxed">
                    Acompanhamento operacional das turmas, histórico acadêmico, controle de vagas, notas, presenças e relatórios financeiros por núcleo.
                  </p>
                </div>
                
                <div className="flex gap-4">
                  <div className="bg-white/10 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex flex-col gap-1 min-w-[120px]">
                     <span className="text-blue-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><Users size={12} /> Turmas Ativas</span>
                     <span className="text-3xl font-black text-white">42</span>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex flex-col gap-1 min-w-[120px]">
                     <span className="text-blue-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><BookOpen size={12} /> Matrículas</span>
                     <span className="text-3xl font-black text-emerald-400">1.2k</span>
                  </div>
                </div>
             </div>
          </div>

          {/* Navegação de Abas Principal */}
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm inline-flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  activeTab === tab.id 
                    ? 'bg-[#001a33] text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conteúdo Dinâmico */}
      <div className="min-h-[500px]">
        {activeTab === 'tecnicos' && (
          <GestaoTecnicos onToggleDetails={setIsDetailView} />
        )}
        {activeTab === 'livres' && <GestaoLivres />}
        {activeTab === 'especializacao' && <GestaoEspecializacao />}
        {activeTab === 'ead' && <GestaoEad />}
      </div>

    </div>
  );
};

export default GestaoPage;
