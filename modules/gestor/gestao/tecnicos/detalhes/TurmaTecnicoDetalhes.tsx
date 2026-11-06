
// File: modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx

import TurmaDetailsHeader from '../../components/TurmaDetailsHeader';
import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PieChart, Users, BookOpen, Book, Settings, Activity, GraduationCap, DollarSign, Syringe, ClipboardCheck, LockKeyhole, Loader2 } from 'lucide-react';
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
import { canUseManualEnrollmentSettlement } from './components/financeiro/ciclo-manual-settlement-account';
import { canReceivePlannedExternalTransfer } from './components/academic/external-transfer-access';
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
  const [receiveTransferTurmaId, setReceiveTransferTurmaId] = useState<string | null>(null);
  const [financialTarget, setFinancialTarget] = useState<{ turmaId: string; matriculaId: string } | null>(null);
  const queryClient = useQueryClient();
  const canViewAtividades = canAccessGestaoTurmaTab(permissions, 'atividades');
  const canViewFinanceiro = canAccessGestaoTurmaTab(permissions, 'financeiro');
  const canSettleEnrollment = canUseManualEnrollmentSettlement(permissions);
  const canReceiveExternalTransfer = canReceivePlannedExternalTransfer(permissions);
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
      case 'alunos': return <TurmaAlunos turma={turma} canManageFinanceiro={canViewFinanceiro}
        onReceiveTransfer={canReceiveExternalTransfer && canAccessGestaoTurmaTab(permissions, 'academico') && turma.status === 'EM_ANDAMENTO' ? () => {
          setReceiveTransferTurmaId(turma.id); setActiveTab('academico');
        } : undefined} />;
      case 'grade': return <TurmaGrade turma={turma} />;
      case 'atividades': return <AtividadesExtraClasse turmaId={turma.id} cursoId={turma.cursoId} modo="GESTOR" />;
      case 'diarios': return <TurmaDiarios turma={turma} gestorContextId={gestorContextId} />;
      case 'financeiro': return <TurmaFinanceiro key={turma.id} turma={turma} canSettleEnrollment={canSettleEnrollment}
        initialMatriculaId={financialTarget?.turmaId === turma.id ? financialTarget.matriculaId : undefined} />;
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
          canReceiveExternalTransfer={canReceiveExternalTransfer}
          receiveTransferRequested={receiveTransferTurmaId === turma.id}
          onReceiveTransferRequestHandled={() => setReceiveTransferTurmaId(null)}
          onTurmaUpdated={onTurmaUpdated}
          onTurmaFinalizada={onBack}
          onOpenFinanceiro={canViewFinanceiro ? (matriculaId) => {
            setFinancialTarget({ turmaId: turma.id, matriculaId });
            setActiveTab('financeiro');
          } : undefined}
        />
      );
      case 'configuracoes': return <TurmaConfiguracoes turma={turma} onTurmaUpdated={onTurmaUpdated} canManageFinanceiro={canViewFinanceiro} />;
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
        <nav
          aria-label="Seções da turma"
          className="gestao-turma-tabs"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setFinancialTarget(null);
                setActiveTab(tab.locked ? 'grade' : tab.id);
              }}
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
              className={`gestao-turma-tab ${
                activeTab === tab.id
                  ? 'is-active'
                  : tab.locked
                    ? 'is-locked'
                    : tab.pending
                      ? 'is-pending'
                    : ''
              }`}
            >
              <span className={activeTab === tab.id ? 'text-blue-600' : undefined}>
                {tab.icon}
              </span>
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

export default TurmaTecnicoDetalhes;
