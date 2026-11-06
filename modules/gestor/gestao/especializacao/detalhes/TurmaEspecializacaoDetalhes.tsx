// File: modules/gestor/gestao/especializacao/detalhes/TurmaEspecializacaoDetalhes.tsx

import TurmaDetailsHeader from '../../components/TurmaDetailsHeader';
import React, { useState, useEffect } from 'react';
import { PieChart, Users, BookOpen, Book, Settings, DollarSign, LockKeyhole } from 'lucide-react';
import { Turma } from '../../gestao.types';
import TurmaResumo from './components/TurmaResumo';
import TurmaAlunos from './components/TurmaAlunos';
import TurmaGrade from './components/TurmaGrade';
import TurmaDiarios from './components/diarios/TurmaDiarios';
import TurmaFinanceiro from './components/TurmaFinanceiro';
import TurmaConfiguracoes from './components/TurmaConfiguracoes';
import { useTurmaEspecializacaoRealtime } from './hooks/useTurmaEspecializacaoRealtime';
import {
  canAccessGestaoTurmaTab,
  type GestorPermissions,
} from '../../../access-control';

interface TurmaEspecializacaoDetalhesProps {
  turma: Turma;
  onBack: () => void;
  permissions: GestorPermissions;
  gestorContextId: string;
}

const TurmaEspecializacaoDetalhes: React.FC<TurmaEspecializacaoDetalhesProps> = ({ turma, onBack, permissions, gestorContextId }) => {
  const [activeTab, setActiveTab] = useState('resumo');
  const canViewFinanceiro = canAccessGestaoTurmaTab(permissions, 'financeiro');
  const canViewAulas = canAccessGestaoTurmaTab(permissions, 'grade')
    || canAccessGestaoTurmaTab(permissions, 'diarios');

  useTurmaEspecializacaoRealtime(turma.id);

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
      case 'grade': return <TurmaGrade turma={turma} singleProfessor={true} colorTheme="rose" />;
      case 'diarios': return <TurmaDiarios turma={turma} gestorContextId={gestorContextId} />;
      case 'financeiro': return <TurmaFinanceiro turma={turma} />;
      case 'configuracoes': return <TurmaConfiguracoes turma={turma} />;
      default: return null;
    }
  };

  return (
    <div className="gestao-turma-details pb-6">
      <TurmaDetailsHeader
        code={turma.codigo}
        status={turma.status.replace('_', ' ')}
        active={turma.status === 'EM_ANDAMENTO'}
        title={turma.nome}
        description={<>{turma.cursoNome} • {turma.poloNome} • {turma.turno}</>}
        onBack={onBack}
      >
        <nav aria-label="Seções da turma" className="gestao-turma-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
              className={`gestao-turma-tab ${
                activeTab === tab.id 
                  ? 'is-active' 
                  : ''
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </TurmaDetailsHeader>

      <div className="gestao-turma-content">
        {tabs.length === 0 ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-5 text-center">
            <LockKeyhole className="mx-auto text-amber-600" size={28} />
            <h3 className="mt-3 text-sm font-medium text-amber-900">Nenhuma área da turma liberada</h3>
            <p className="mt-1 text-sm font-medium text-amber-700">Solicite ao administrador uma permissão de aba para o módulo Gestão.</p>
          </div>
        ) : renderContent()}
      </div>
    </div>
  );
};

export default TurmaEspecializacaoDetalhes;
