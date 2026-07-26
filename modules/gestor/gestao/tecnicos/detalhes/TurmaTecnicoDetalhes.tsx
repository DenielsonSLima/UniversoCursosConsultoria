
// File: modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx

import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PieChart, Users, BookOpen, Book, Settings, Activity, GraduationCap, DollarSign, Syringe, ClipboardCheck } from 'lucide-react';
import { Turma } from '../../gestao.types';
import TurmaResumo from './components/TurmaResumo';
import TurmaAlunos from './components/TurmaAlunos';
import TurmaGrade from './components/TurmaGrade';
import TurmaDiarios from './components/diarios/TurmaDiarios';
import TurmaConfiguracoes from './components/TurmaConfiguracoes';
import TurmaEstagio from './components/TurmaEstagio';
import TurmaAcademico from './components/TurmaAcademico';
import TurmaFinanceiro from './components/TurmaFinanceiro';
import TurmaVacinas from './components/TurmaVacinas';
import AtividadesExtraClasse from './components/AtividadesExtraClasse';
import { useTurmaTecnicoRealtime } from './hooks/useTurmaTecnicoRealtime';
import { turmaFinanceiroDashboardQueryOptions } from './components/financeiro/hooks/useFinanceiroAlunos';
import { financeiroConfigQueryOptions } from './components/financeiro/hooks/useFinanceiroConfig';
import { turmaVacinasQueryOptions } from './components/vacinas/useTurmaVacinas';

interface TurmaTecnicoDetalhesProps {
  turma: Turma;
  onBack: () => void;
}

const TurmaTecnicoDetalhes: React.FC<TurmaTecnicoDetalhesProps> = ({ turma, onBack }) => {
  const [activeTab, setActiveTab] = useState('resumo');
  const queryClient = useQueryClient();

  useTurmaTecnicoRealtime(turma.id);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [turma.id]);

  const tabs = [
    { id: 'resumo', label: 'Resumo', icon: <PieChart size={18} /> },
    { id: 'alunos', label: 'Alunos', icon: <Users size={18} /> },
    { id: 'grade', label: 'Grade & Profs', icon: <BookOpen size={18} /> },
    { id: 'atividades', label: 'Atividades', icon: <ClipboardCheck size={18} /> },
    { id: 'diarios', label: 'Diários', icon: <Book size={18} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={18} /> },
    { id: 'vacinas', label: 'Vacinas', icon: <Syringe size={18} /> },
    { id: 'estagio', label: 'Estágio', icon: <Activity size={18} /> },
    { id: 'academico', label: 'Ciclo Acadêmico', icon: <GraduationCap size={18} /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings size={18} /> },
  ];

  const prefetchTab = (tabId: string) => {
    if (tabId === 'financeiro') {
      void queryClient.prefetchQuery(turmaFinanceiroDashboardQueryOptions(turma.id));
      void queryClient.prefetchQuery(financeiroConfigQueryOptions(turma.id));
    }
    if (tabId === 'vacinas') {
      void queryClient.prefetchQuery(turmaVacinasQueryOptions(turma));
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'resumo': return <TurmaResumo turma={turma} />;
      case 'alunos': return <TurmaAlunos turma={turma} />;
      case 'grade': return <TurmaGrade turma={turma} />;
      case 'atividades': return <AtividadesExtraClasse turmaId={turma.id} cursoId={turma.cursoId} modo="GESTOR" />;
      case 'diarios': return <TurmaDiarios turma={turma} />;
      case 'financeiro': return <TurmaFinanceiro turma={turma} />;
      case 'vacinas': return <TurmaVacinas turma={turma} />;
      case 'estagio': return (
        <TurmaEstagio
          turma={turma}
          readOnly={turma.status === 'FINALIZADA'}
          readOnlyMessage={turma.status === 'FINALIZADA'
            ? 'Turma finalizada. As fichas de estágio estão disponíveis apenas para consulta.'
            : undefined}
        />
      );
      case 'academico': return <TurmaAcademico turma={turma} onTurmaFinalizada={onBack} />;
      case 'configuracoes': return <TurmaConfiguracoes turma={turma} />;
      default: return null;
    }
  };

  return (
    <div className=" min-h-screen pb-20">
      
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
          <nav
            aria-label="Seções da turma"
            className="-mx-1 flex max-w-full flex-nowrap items-center gap-5 overflow-x-auto px-1 pb-2 [scrollbar-color:#94a3b8_#e2e8f0] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-200"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                onMouseEnter={() => prefetchTab(tab.id)}
                onFocus={() => prefetchTab(tab.id)}
                onTouchStart={() => prefetchTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`relative flex h-11 shrink-0 items-center justify-center gap-2 px-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-blue-600 after:transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                  activeTab === tab.id
                    ? 'text-[#001a33] after:scale-x-100'
                    : 'text-slate-400 after:scale-x-0 hover:text-blue-700 hover:after:scale-x-50'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-blue-600' : undefined}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-0">
        {renderContent()}
      </div>
    </div>
  );
};

export default TurmaTecnicoDetalhes;
