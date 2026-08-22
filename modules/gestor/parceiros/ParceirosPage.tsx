import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  Building,
  Download,
  GraduationCap,
  LayoutGrid,
  Plus,
  User,
  Users,
  UsersRound,
} from 'lucide-react';
import ParceirosKpis from './components/ParceirosKpis';
import ParceirosFilters from './components/ParceirosFilters';
import ParceirosList from './components/ParceirosList';
import ParceiroAlunoDetalhes from './components/viewparceiros/aluno/ParceiroAlunoDetalhes';
import ParceiroProfessorDetalhes from './components/viewparceiros/professor/ParceiroProfessorDetalhes';
import ParceiroPJDetalhes from './components/viewparceiros/pj/ParceiroPJDetalhes';
import ParceiroPFDetalhes from './components/viewparceiros/pf/ParceiroPFDetalhes';
import ParceirosExportModal from './components/export/ParceirosExportModal';
import ToastNotification, { useToast } from './components/shared/ToastNotification';
import ParceiroSelectionModal from './components/ParceiroSelectionModal';
import ParceiroFormHost from './components/ParceiroFormHost';
import EnrollmentModal from './components/EnrollmentModal';
import DeleteParceiroModal from './components/DeleteParceiroModal';
import { useParceirosFilters, ParceirosTabType } from './hooks/useParceirosFilters';
import { useParceirosMutations } from './hooks/useParceirosMutations';
import { useParceirosQueries } from './hooks/useParceirosQueries';
import { filterTurmasByModalidades } from './parceiros-turmas.utils';
import ResponsaveisTab from './responsaveis/ResponsaveisTab';
import CoordenacoesTab from './coordenacoes/CoordenacoesTab';

export type ParceiroFormType = 'aluno' | 'professor' | 'responsavel' | 'selection' | 'pf' | 'pj';
type HostedParceiroFormType = Exclude<ParceiroFormType, 'responsavel'>;
type FormType = HostedParceiroFormType | null;
type ParceiroSelectionType = ParceiroFormType | null;
const RESPONSAVEL_CREATE_UNAVAILABLE_REASON =
  'O cadastro de responsável está disponível somente para gestores com escopo global.';

interface ParceirosPageProps {
  activeTabInicial?: ParceirosTabType;
  initialForm?: ParceiroFormType;
  poloId?: string | null;
  includeGlobal?: boolean;
  onRequestScrollTop?: () => void;
}

const tabs = [
  { id: 'todos', label: 'Todos', icon: LayoutGrid },
  { id: 'professores', label: 'Professores', icon: Users },
  { id: 'alunos', label: 'Alunos', icon: GraduationCap },
  { id: 'responsaveis', label: 'Responsáveis', icon: UsersRound },
  { id: 'coordenacoes', label: 'Coordenações', icon: BookOpenCheck },
  { id: 'pj', label: 'Pessoa Jurídica', icon: Building },
  { id: 'pf', label: 'Pessoa Física', icon: User },
] as const;

const ParceirosPage: React.FC<ParceirosPageProps> = ({
  activeTabInicial = 'todos',
  initialForm,
  poloId,
  includeGlobal = false,
  onRequestScrollTop,
}) => {
  const { toasts, removeToast, toast } = useToast();
  const [showForm, setShowForm] = useState<FormType>(
    initialForm === 'responsavel' ? null : initialForm || null,
  );
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ParceirosTabType>(
    initialForm === 'responsavel' ? 'responsaveis' : activeTabInicial,
  );
  const [deletingParceiro, setDeletingParceiro] = useState<any | null>(null);
  const [selectedParceiro, setSelectedParceiro] = useState<any | null>(null);
  const [createdAlunoNome, setCreatedAlunoNome] = useState('');
  const [showEnrollmentModalForAlunoId, setShowEnrollmentModalForAlunoId] = useState<string | null>(null);
  const [selectedTurmaIdForEnrollment, setSelectedTurmaIdForEnrollment] = useState('');
  const [openResponsavelCreate, setOpenResponsavelCreate] = useState(
    initialForm === 'responsavel',
  );

  useEffect(() => {
    setActiveTab(activeTabInicial);
  }, [activeTabInicial]);

  useEffect(() => {
    if (initialForm === 'responsavel') {
      setShowForm(null);
      setActiveTab('responsaveis');
      setOpenResponsavelCreate(true);
      onRequestScrollTop?.();
      return;
    }
    if (initialForm) setShowForm(initialForm);
  }, [initialForm, onRequestScrollTop]);

  const isDedicatedGovernanceTab = activeTab === 'responsaveis' || activeTab === 'coordenacoes';

  const {
    allPartners,
    loadingPartners,
    turmasDisponiveis,
    loadingTurmas,
    turmasError,
    reloadTurmas,
  } = useParceirosQueries({
    poloId,
    includeGlobal,
    enablePartners: !isDedicatedGovernanceTab,
    enableTurmas: !isDedicatedGovernanceTab,
  });
  const {
    searchTerm,
    statusFilter,
    alunoModalidadeFilter,
    turmaFilter,
    setStatusFilter,
    toggleAlunoModalidadeFilter,
    clearAlunoModalidadeFilter,
    setTurmaFilter,
    handleSearch,
    handleSort,
    sortedAndFilteredPartners,
    kpis,
  } = useParceirosFilters(allPartners, activeTab);

  const turmasFiltradas = useMemo(
    () => filterTurmasByModalidades(turmasDisponiveis, alunoModalidadeFilter),
    [alunoModalidadeFilter, turmasDisponiveis],
  );

  useEffect(() => {
    if (loadingTurmas || turmasError || turmaFilter === 'todas') return;
    if (!turmasFiltradas.some((turma) => turma.id === turmaFilter)) {
      setTurmaFilter('todas');
    }
  }, [loadingTurmas, setTurmaFilter, turmaFilter, turmasError, turmasFiltradas]);

  const turmaFilterLabel = turmasDisponiveis.find((turma: any) => turma.id === turmaFilter)?.nome;

  const {
    saveAlunoMutation,
    saveProfessorMutation,
    savePFMutation,
    savePJMutation,
    enrollAlunoMutation,
    deleteMutation,
  } = useParceirosMutations({
    toast,
    createdAlunoNome,
    setCreatedAlunoNome,
    setShowForm,
    setShowEnrollmentModalForAlunoId,
    setSelectedTurmaIdForEnrollment,
    setDeletingParceiro,
  });

  const toastNotification = (
    <ToastNotification toasts={toasts} onRemove={removeToast} />
  );

  const handleFormSelection = (form: ParceiroSelectionType) => {
    if (form === 'responsavel') {
      if (!includeGlobal) {
        toast.info('Cadastro indisponível', RESPONSAVEL_CREATE_UNAVAILABLE_REASON);
        return;
      }
      setShowForm(null);
      setActiveTab('responsaveis');
      setOpenResponsavelCreate(true);
      onRequestScrollTop?.();
      return;
    }
    setShowForm(form);
  };

  if (selectedParceiro) {
    const handleBackFromDetails = () => {
      setSelectedParceiro(null);
      onRequestScrollTop?.();
    };

    if (selectedParceiro.tipo === 'Aluno') {
      return <>{toastNotification}<ParceiroAlunoDetalhes alunoInicial={selectedParceiro} onBack={handleBackFromDetails} onRequestScrollTop={onRequestScrollTop} /></>;
    }
    if (selectedParceiro.tipo === 'Professor') {
      return <>{toastNotification}<ParceiroProfessorDetalhes professorInicial={selectedParceiro} onBack={handleBackFromDetails} /></>;
    }
    if (selectedParceiro.tipo === 'PJ') {
      return <>{toastNotification}<ParceiroPJDetalhes pjInicial={selectedParceiro} onBack={handleBackFromDetails} /></>;
    }
    return <>{toastNotification}<ParceiroPFDetalhes pfInicial={selectedParceiro} onBack={handleBackFromDetails} /></>;
  }

  if (showForm === 'selection') {
    return (
      <>
        {toastNotification}
        <ParceiroSelectionModal
          onSelect={handleFormSelection}
          onClose={() => setShowForm(null)}
          canCreateResponsavel={includeGlobal}
          responsavelUnavailableReason={RESPONSAVEL_CREATE_UNAVAILABLE_REASON}
        />
      </>
    );
  }

  if (showForm && showForm !== 'selection') {
    return (
      <>
        {toastNotification}
        <ParceiroFormHost
          showForm={showForm}
          onCancel={() => setShowForm(null)}
          onSaveAluno={(data) => saveAlunoMutation.mutate(data)}
          onSaveProfessor={(data) => saveProfessorMutation.mutate(data)}
          onSavePF={(data) => savePFMutation.mutate(data)}
          onSavePJ={(data) => savePJMutation.mutate(data)}
          defaultPoloId={poloId}
          canAssociateAllPolos={includeGlobal}
          onScopeError={(message) => toast.error('Polo não selecionado', message)}
        />
      </>
    );
  }

  return (
    <div className="pb-12">
      {toastNotification}

      <div className="flex flex-col md:flex-row justify-between items-center mb-5 gap-6">
        <div>
          <h2 className="text-3xl font-bold text-[#001a33]">
            Parceiros & <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4169E1] to-[#003366]">Convênios</span>
          </h2>
        </div>

        {!isDedicatedGovernanceTab ? <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowExportModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-slate-700 px-6 py-3 rounded-2xl font-semibold text-xs hover:bg-slate-50 hover:text-blue-600 transition-all border border-slate-200 shadow-sm"
          >
            <Download size={16} />
            Exportar
          </button>

          <button
            onClick={() => setShowForm('selection')}
            data-parceiro-selection-trigger
            className="group relative flex-1 md:flex-none px-6 md:px-8 py-3 bg-[#001a33] text-white rounded-2xl font-semibold text-xs overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-blue-900/20 transition-all hover:-translate-y-1"
          >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-blue-600 to-[#001a33] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center justify-center gap-3">
              <div className="bg-white/20 p-1.5 rounded-lg">
                <Plus size={16} />
              </div>
              <span>Novo Registro</span>
            </div>
          </button>
        </div> : null}
      </div>

      {!isDedicatedGovernanceTab ? <ParceirosKpis
        totalParceiros={kpis.totalParceiros || 0}
        totalParceirosAtivos={kpis.totalParceirosAtivos || 0}
        totalAlunos={kpis.totalAlunosVinculados || 0}
        totalAlunosAtivos={kpis.totalAlunosAtivos || 0}
        totalAlunosInativos={kpis.totalAlunosInativos || 0}
        totalProfessores={kpis.totalProfessoresVinculados || 0}
        totalProfessoresAtivos={kpis.totalProfessoresAtivos || 0}
        totalProfessoresInativos={kpis.totalProfessoresInativos || 0}
      /> : null}

      <div className="border-b border-slate-200 mb-5 mt-2">
        <div className="flex gap-6 overflow-x-auto pb-px">
          {tabs.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 pb-3 text-xs font-bold uppercase tracking-wider transition-all relative shrink-0 ${
                  isActive
                    ? 'text-[#001a33] font-extrabold'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-[#4169E1]' : 'text-slate-400'} />
                {label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4169E1] rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'responsaveis' ? (
        <ResponsaveisTab
          poloId={poloId}
          includeGlobal={includeGlobal}
          toast={toast}
          openCreateOnMount={openResponsavelCreate}
          onCreateOpenHandled={() => setOpenResponsavelCreate(false)}
        />
      ) : activeTab === 'coordenacoes' ? (
        <CoordenacoesTab
          poloId={poloId}
          includeGlobal={includeGlobal}
          toast={toast}
        />
      ) : (
        <>
      <ParceirosFilters
        onSearch={handleSearch}
        onSortChange={handleSort}
        onStatusChange={setStatusFilter}
        selectedAlunoModalidades={alunoModalidadeFilter}
        onToggleAlunoModalidade={toggleAlunoModalidadeFilter}
        onClearAlunoModalidades={clearAlunoModalidadeFilter}
        onTurmaChange={setTurmaFilter}
        selectedTurma={turmaFilter}
        turmas={turmasFiltradas}
        loadingTurmas={loadingTurmas}
        turmasError={turmasError}
        onRetryTurmas={() => { void reloadTurmas(); }}
        activeTab={activeTab}
      />

      <ParceirosList

        items={sortedAndFilteredPartners}
        isLoading={loadingPartners}
        onSelectParceiro={(parceiro) => {
          setSelectedParceiro(parceiro);
          onRequestScrollTop?.();
        }}
        onDeleteParceiro={setDeletingParceiro}
      />

      <ParceirosExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        items={sortedAndFilteredPartners}
        activeTab={activeTab}
        poloId={poloId}
        filtrosAtuais={{ searchTerm, statusFilter, alunoModalidadeFilter, turmaFilter, turmaFilterLabel }}
      />

      {showEnrollmentModalForAlunoId && (
        <EnrollmentModal
          alunoNome={createdAlunoNome}
          alunoId={showEnrollmentModalForAlunoId}
          turmas={turmasDisponiveis}
          selectedTurmaId={selectedTurmaIdForEnrollment}
          isPending={enrollAlunoMutation.isPending}
          onClose={() => setShowEnrollmentModalForAlunoId(null)}
          onSelectTurma={setSelectedTurmaIdForEnrollment}
          onConfirm={(input) => enrollAlunoMutation.mutate(input)}
        />
      )}

      {deletingParceiro && (
        <DeleteParceiroModal
          parceiro={deletingParceiro}
          isPending={deleteMutation.isPending}
          onCancel={() => setDeletingParceiro(null)}
          onConfirm={(id) => deleteMutation.mutate(id)}
        />
      )}
        </>
      )}
    </div>
  );
};

export default ParceirosPage;
