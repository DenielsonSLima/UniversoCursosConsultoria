
// File: modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PieChart, Users, BookOpen, Book, Settings, Activity, GraduationCap, DollarSign, Syringe, ClipboardCheck, LockKeyhole, Loader2 } from 'lucide-react';
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
import { matriculaTecnicaFinanceiroWorkspaceQueryOptions } from './components/financeiro/hooks/useMatriculaTecnicaFinanceiro';
import { turmaVacinasQueryOptions } from './components/vacinas/useTurmaVacinas';
import {
  atividadesExtraClasseService,
} from './components/atividades-extra/atividadesExtraClasse.service';
import { academicLifecycleKeys } from './academic-lifecycle.keys';
import {
  canAccessGestaoTurmaTab,
  getEffectiveGestaoTurmaTabs,
  type GestorPermissions,
} from '../../../access-control';

interface TurmaTecnicoDetalhesProps {
  turma: Turma;
  onBack: () => void;
  onTurmaUpdated: (turma: Turma) => void;
  permissions: GestorPermissions;
  gestorContextId: string;
}

const TurmaTecnicoDetalhes: React.FC<TurmaTecnicoDetalhesProps> = ({
  turma,
  onBack,
  onTurmaUpdated,
  permissions,
  gestorContextId,
}) => {
  const [activeTab, setActiveTab] = useState('resumo');
  const queryClient = useQueryClient();
  const canViewAtividades = canAccessGestaoTurmaTab(permissions, 'atividades');
  const canViewFinanceiro = canAccessGestaoTurmaTab(permissions, 'financeiro');
  const canViewAulas = canAccessGestaoTurmaTab(permissions, 'grade')
    || canAccessGestaoTurmaTab(permissions, 'diarios');
  const activityAvailabilityQuery = useQuery({
    queryKey: academicLifecycleKeys.atividades(turma.id),
    queryFn: () => atividadesExtraClasseService.hasAtividades(turma.id),
    staleTime: 15_000,
    enabled: canViewAtividades,
  });
  const atividadesAusentes = activityAvailabilityQuery.isSuccess
    && activityAvailabilityQuery.data === false;
  const verificandoAtividades = activityAvailabilityQuery.isPending;

  useTurmaTecnicoRealtime(turma.id);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [turma.id]);

  useEffect(() => {
    if (activeTab === 'atividades' && atividadesAusentes) {
      setActiveTab(
        canAccessGestaoTurmaTab(permissions, 'grade')
          ? 'grade'
          : getEffectiveGestaoTurmaTabs(permissions)[0] || '',
      );
    }
  }, [activeTab, atividadesAusentes, permissions]);

  const tabs = [
    { id: 'resumo', label: 'Resumo', icon: <PieChart size={18} /> },
    { id: 'alunos', label: 'Alunos', icon: <Users size={18} /> },
    { id: 'grade', label: 'Grade & Profs', icon: <BookOpen size={18} /> },
    {
      id: 'atividades',
      label: 'Atividades',
      icon: verificandoAtividades
        ? <Loader2 size={17} className="animate-spin" />
        : atividadesAusentes
          ? <LockKeyhole size={17} />
          : <ClipboardCheck size={18} />,
      locked: atividadesAusentes,
      pending: verificandoAtividades,
    },
    { id: 'diarios', label: 'Diários', icon: <Book size={18} /> },
    { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={18} /> },
    { id: 'vacinas', label: 'Vacinas', icon: <Syringe size={18} /> },
    { id: 'estagio', label: 'Estágio', icon: <Activity size={18} /> },
    { id: 'academico', label: 'Ciclo Acadêmico', icon: <GraduationCap size={18} /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings size={18} /> },
  ].filter((tab) => canAccessGestaoTurmaTab(permissions, tab.id));

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id || '');
    }
  }, [activeTab, permissions]);

  const prefetchTab = (tabId: string) => {
    if (!canAccessGestaoTurmaTab(permissions, tabId)) return;
    if (tabId === 'financeiro') {
      void queryClient.prefetchQuery(matriculaTecnicaFinanceiroWorkspaceQueryOptions(turma.id));
    }
    if (tabId === 'vacinas') {
      void queryClient.prefetchQuery(turmaVacinasQueryOptions(turma));
    }
  };

  const renderContent = () => {
    if (!tabs.some((tab) => tab.id === activeTab)) return null;
    switch (activeTab) {
      case 'resumo': return <TurmaResumo turma={turma} canViewFinanceiro={canViewFinanceiro} canViewAulas={canViewAulas} />;
      case 'alunos': return <TurmaAlunos turma={turma} canManageFinanceiro={canViewFinanceiro} />;
      case 'grade': return <TurmaGrade turma={turma} />;
      case 'atividades': return <AtividadesExtraClasse turmaId={turma.id} cursoId={turma.cursoId} modo="GESTOR" />;
      case 'diarios': return <TurmaDiarios turma={turma} gestorContextId={gestorContextId} />;
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
      case 'academico': return (
        <TurmaAcademico
          turma={turma}
          onTurmaUpdated={onTurmaUpdated}
          onTurmaFinalizada={onBack}
        />
      );
      case 'configuracoes': return <TurmaConfiguracoes turma={turma} onTurmaUpdated={onTurmaUpdated} canManageFinanceiro={canViewFinanceiro} />;
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
                onClick={() => setActiveTab(tab.locked ? 'grade' : tab.id)}
                disabled={tab.pending}
                onMouseEnter={() => prefetchTab(tab.id)}
                onFocus={() => prefetchTab(tab.id)}
                onTouchStart={() => prefetchTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                aria-label={tab.pending
                  ? 'Verificando atividades da turma.'
                  : tab.locked
                    ? 'Configurar atividades em Grade e Professores.'
                  : tab.label}
                title={tab.pending
                  ? 'Verificando atividades da turma...'
                  : tab.locked
                    ? 'Marque uma aula como atividade em Grade & Profs para liberar esta área.'
                    : activityAvailabilityQuery.isError && tab.id === 'atividades'
                      ? 'A verificação rápida falhou. Abra para tentar carregar as atividades.'
                      : undefined}
                className={`relative flex h-11 shrink-0 items-center justify-center gap-2 px-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-blue-600 after:transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                  activeTab === tab.id
                    ? 'text-[#001a33] after:scale-x-100'
                    : tab.locked
                      ? 'cursor-help text-slate-300 after:scale-x-0'
                      : tab.pending
                        ? 'cursor-wait text-slate-300 after:scale-x-0'
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

export default TurmaTecnicoDetalhes;
