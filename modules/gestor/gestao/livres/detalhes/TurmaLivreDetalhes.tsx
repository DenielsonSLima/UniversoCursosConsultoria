// File: modules/gestor/gestao/livres/detalhes/TurmaLivreDetalhes.tsx

import React, { useState, useEffect } from 'react';
import { ArrowLeft, PieChart, Users, BookOpen, Book, Settings, DollarSign, LockKeyhole } from 'lucide-react';
import { Turma } from '../../gestao.types';
import TurmaResumo from './components/TurmaResumo';
import TurmaAlunos from './components/TurmaAlunos';
import TurmaGrade from './components/TurmaGrade';
import TurmaDiarios from './components/diarios/TurmaDiarios';
import TurmaFinanceiro from './components/TurmaFinanceiro';
import TurmaConfiguracoes from './components/TurmaConfiguracoes';
import { useTurmaLivreRealtime } from './hooks/useTurmaLivreRealtime';
import {
  canAccessGestaoTurmaTab,
  type GestorPermissions,
} from '../../../access-control';

interface TurmaLivreDetalhesProps {
  turma: Turma;
  onBack: () => void;
  permissions: GestorPermissions;
  gestorContextId: string;
}

const TurmaLivreDetalhes: React.FC<TurmaLivreDetalhesProps> = ({ turma, onBack, permissions, gestorContextId }) => {
  const [activeTab, setActiveTab] = useState('resumo');
  const canViewFinanceiro = canAccessGestaoTurmaTab(permissions, 'financeiro');
  const canViewAulas = canAccessGestaoTurmaTab(permissions, 'grade')
    || canAccessGestaoTurmaTab(permissions, 'diarios');

  useTurmaLivreRealtime(turma.id);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [turma.id]);

  const tabs = [
    { id: 'resumo', label: 'Resumo', icon: <PieChart size={18} /> },
    { id: 'alunos', label: 'Alunos', icon: <Users size={18} /> },
    { id: 'grade', label: 'Grade & Profs', icon: <BookOpen size={18} /> },
    { id: 'diarios', label: 'Diários', icon: <Book size={18} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={18} /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings size={18} /> },
  ].filter((tab) => canAccessGestaoTurmaTab(permissions, tab.id));

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id || '');
    }
  }, [activeTab, permissions]);

  const renderContent = () => {
    if (!tabs.some((tab) => tab.id === activeTab)) return null;
    switch (activeTab) {
      case 'resumo': return <TurmaResumo turma={turma} canViewFinanceiro={canViewFinanceiro} canViewAulas={canViewAulas} />;
      case 'alunos': return <TurmaAlunos turma={turma} canManageFinanceiro={canViewFinanceiro} />;
      case 'grade': return <TurmaGrade turma={turma} singleProfessor={true} colorTheme="amber" />;
      case 'diarios': return <TurmaDiarios turma={turma} gestorContextId={gestorContextId} />;
      case 'financeiro': return <TurmaFinanceiro turma={turma} />;
      case 'configuracoes': return <TurmaConfiguracoes turma={turma} />;
      default: return null;
    }
  };

  return (
    <div className=" min-h-screen pb-20">
      
      {/* Header Normal */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm -mx-8 -mt-8 mb-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={onBack}
                className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-200 transition-colors bg-slate-50"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-amber-200">
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
        {tabs.length === 0 ? (
          <div className="rounded-3xl border border-amber-100 bg-amber-50 p-8 text-center">
            <LockKeyhole className="mx-auto text-amber-600" size={28} />
            <h3 className="mt-3 text-sm font-black uppercase tracking-wider text-amber-900">Nenhuma área da turma liberada</h3>
            <p className="mt-1 text-sm font-medium text-amber-700">Solicite ao administrador uma permissão de aba para o módulo Gestão.</p>
          </div>
        ) : renderContent()}
      </div>
    </div>
  );
};

export default TurmaLivreDetalhes;
