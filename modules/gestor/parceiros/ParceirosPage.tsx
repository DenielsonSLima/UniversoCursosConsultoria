import React, { useEffect, useState } from 'react';
import {
  Building,
  Download,
  GraduationCap,
  LayoutGrid,
  Plus,
  Sparkles,
  User,
  Users,
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
import { useParceirosRealtime } from './hooks/useParceirosRealtime';

type FormType = 'aluno' | 'professor' | 'selection' | 'pf' | 'pj' | null;

interface ParceirosPageProps {
  activeTabInicial?: ParceirosTabType;
  poloId?: string | null;
  includeGlobal?: boolean;
}

const tabs = [
  { id: 'todos', label: 'Todos', icon: LayoutGrid },
  { id: 'professores', label: 'Professores', icon: Users },
  { id: 'alunos', label: 'Alunos', icon: GraduationCap },
  { id: 'pj', label: 'Pessoa Jurídica', icon: Building },
  { id: 'pf', label: 'Pessoa Física', icon: User },
] as const;

const ParceirosPage: React.FC<ParceirosPageProps> = ({ activeTabInicial = 'todos', poloId, includeGlobal = false }) => {
  const { toasts, removeToast, toast } = useToast();
  const [showForm, setShowForm] = useState<FormType>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ParceirosTabType>(activeTabInicial);
  const [deletingParceiro, setDeletingParceiro] = useState<any | null>(null);
  const [selectedParceiro, setSelectedParceiro] = useState<any | null>(null);
  const [createdAlunoNome, setCreatedAlunoNome] = useState('');
  const [showEnrollmentModalForAlunoId, setShowEnrollmentModalForAlunoId] = useState<string | null>(null);
  const [selectedTurmaIdForEnrollment, setSelectedTurmaIdForEnrollment] = useState('');

  useEffect(() => {
    setActiveTab(activeTabInicial);
  }, [activeTabInicial]);

  const {
    allPartners,
    loadingPartners,
    turmasDisponiveis,
    invalidateParceiros,
  } = useParceirosQueries(showEnrollmentModalForAlunoId, { poloId, includeGlobal });
  useParceirosRealtime(invalidateParceiros);
  const {
    searchTerm,
    statusFilter,
    cursoFilter,
    turmaFilter,
    setStatusFilter,
    setCursoFilter,
    setTurmaFilter,
    handleSearch,
    handleSort,
    sortedAndFilteredPartners,
    kpis,
  } = useParceirosFilters(allPartners, activeTab);

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

  if (selectedParceiro) {
    const handleBackFromDetails = () => setSelectedParceiro(null);

    if (selectedParceiro.tipo === 'Aluno') {
      return <ParceiroAlunoDetalhes alunoInicial={selectedParceiro} onBack={handleBackFromDetails} />;
    }
    if (selectedParceiro.tipo === 'Professor') {
      return <ParceiroProfessorDetalhes professorInicial={selectedParceiro} onBack={handleBackFromDetails} />;
    }
    if (selectedParceiro.tipo === 'PJ') {
      return <ParceiroPJDetalhes pjInicial={selectedParceiro} onBack={handleBackFromDetails} />;
    }
    return <ParceiroPFDetalhes pfInicial={selectedParceiro} onBack={handleBackFromDetails} />;
  }

  if (showForm === 'selection') {
    return (
      <ParceiroSelectionModal
        onSelect={setShowForm}
        onClose={() => setShowForm(null)}
      />
    );
  }

  if (showForm && showForm !== 'selection') {
    return (
      <ParceiroFormHost
        showForm={showForm}
        onCancel={() => setShowForm(null)}
        onSaveAluno={(data) => saveAlunoMutation.mutate(data)}
        onSaveProfessor={(data) => saveProfessorMutation.mutate(data)}
        onSavePF={(data) => savePFMutation.mutate(data)}
        onSavePJ={(data) => savePJMutation.mutate(data)}
      />
    );
  }

  return (
    <div className="animate-fadeIn pb-12">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-[#4169E1]" />
            <span className="text-xs font-bold text-[#4169E1] uppercase tracking-[0.2em]">Módulo Gestão</span>
          </div>
          <h2 className="text-4xl font-black text-[#001a33] uppercase tracking-tighter">
            Parceiros & <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4169E1] to-[#003366]">Convênios</span>
          </h2>
          <p className="text-slate-500 font-medium mt-2 max-w-lg">
            Administre prefeituras, empresas e as conexões acadêmicas da instituição em um único lugar.
          </p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowExportModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-slate-700 px-6 py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-slate-50 hover:text-blue-600 transition-all border border-slate-200 shadow-sm"
          >
            <Download size={16} />
            Exportar
          </button>

          <button
            onClick={() => setShowForm('selection')}
            className="group relative flex-1 md:flex-none px-6 md:px-8 py-4 bg-[#001a33] text-white rounded-2xl font-bold uppercase tracking-widest text-xs overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-blue-900/20 transition-all hover:-translate-y-1"
          >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-blue-600 to-[#001a33] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center justify-center gap-3">
              <div className="bg-white/20 p-1.5 rounded-lg">
                <Plus size={16} />
              </div>
              <span>Novo Registro</span>
            </div>
          </button>
        </div>
      </div>

      <ParceirosKpis
        totalParceiros={kpis.totalParceiros || 0}
        totalParceirosAtivos={kpis.totalParceirosAtivos || 0}
        totalAlunos={kpis.totalAlunosVinculados || 0}
        totalAlunosAtivos={kpis.totalAlunosAtivos || 0}
        totalAlunosInativos={kpis.totalAlunosInativos || 0}
        totalProfessores={kpis.totalProfessoresVinculados || 0}
        totalProfessoresAtivos={kpis.totalProfessoresAtivos || 0}
        totalProfessoresInativos={kpis.totalProfessoresInativos || 0}
      />

      <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8 bg-white p-2 rounded-[2rem] border border-slate-100 shadow-sm w-full md:w-fit">
        <div className="flex p-1 gap-1 w-full md:w-auto overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === id
                  ? 'bg-[#001a33] text-white shadow-lg'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <ParceirosFilters
        onSearch={handleSearch}
        onSortChange={handleSort}
        onStatusChange={setStatusFilter}
        onCursoChange={setCursoFilter}
        onTurmaChange={setTurmaFilter}
      />

      <ParceirosList
        items={sortedAndFilteredPartners}
        isLoading={loadingPartners}
        onSelectParceiro={setSelectedParceiro}
        onDeleteParceiro={setDeletingParceiro}
      />

      <ParceirosExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        filtrosAtuais={{ searchTerm, statusFilter, cursoFilter, turmaFilter }}
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
    </div>
  );
};

export default ParceirosPage;
