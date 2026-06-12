
// File: modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx

import React, { useState } from 'react';
import { ArrowLeft, PieChart, Users, BookOpen, Book, Settings, DollarSign, Activity } from 'lucide-react';
import { Turma } from '../../gestao.types';
import TurmaResumo from './components/TurmaResumo';
import TurmaAlunos from './components/TurmaAlunos';
import TurmaGrade from './components/TurmaGrade';
import TurmaDiarios from './components/diarios/TurmaDiarios';
import TurmaFinanceiro from './components/TurmaFinanceiro';
import TurmaConfiguracoes from './components/TurmaConfiguracoes';

interface TurmaTecnicoDetalhesProps {
  turma: Turma;
  onBack: () => void;
}

const TurmaTecnicoDetalhes: React.FC<TurmaTecnicoDetalhesProps> = ({ turma, onBack }) => {
  const [activeTab, setActiveTab] = useState('resumo');

  const tabs = [
    { id: 'resumo', label: 'Resumo', icon: <PieChart size={18} /> },
    { id: 'alunos', label: 'Alunos', icon: <Users size={18} /> },
    { id: 'grade', label: 'Grade & Profs', icon: <BookOpen size={18} /> },
    { id: 'diarios', label: 'Diários', icon: <Book size={18} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={18} /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings size={18} /> },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'resumo': return <TurmaResumo turma={turma} />;
      case 'alunos': return <TurmaAlunos />;
      case 'grade': return <TurmaGrade turma={turma} />;
      case 'diarios': return <TurmaDiarios />;
      case 'financeiro': return <TurmaFinanceiro />;
      case 'configuracoes': return <TurmaConfiguracoes turma={turma} />;
      default: return null;
    }
  };

  return (
    <div className="animate-fadeIn min-h-screen pb-20">
      
      {/* Header Normal (Rolagem com a página) */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm -mx-8 -mt-8 mb-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={onBack}
                className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors bg-slate-50"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-emerald-200">
                    {turma.codigo}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${
                    turma.status === 'EM_ANDAMENTO' 
                      ? 'bg-blue-50 text-blue-600 border-blue-100' 
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {turma.status.replace('_', ' ')}
                  </span>
                </div>
                <h2 className="text-xl font-black text-[#001a33] uppercase tracking-tight leading-none">
                  {turma.nome}
                </h2>
                <p className="text-xs text-slate-500 font-bold mt-1">
                  {turma.cursoNome} • {turma.poloNome} • {turma.turno}
                </p>
              </div>
            </div>
          </div>

          {/* Navegação de Abas */}
          <div className="flex overflow-x-auto gap-1 pb-1 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'bg-[#001a33] text-white shadow-lg shadow-blue-900/20' 
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-0">
        {renderContent()}
      </div>
    </div>
  );
};

export default TurmaTecnicoDetalhes;
