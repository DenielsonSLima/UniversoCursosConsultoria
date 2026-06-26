import React, { useState, useEffect } from 'react';
import { BarChart3, BookOpenCheck, MonitorPlay, Plus, Loader2, X, Copy, CheckCircle2, AlertTriangle, Search, Users } from 'lucide-react';
import CursoEadCard from './components/CursoEadCard';
import EadCourseWizard from './components/EadCourseWizard';
import { Curso } from '../cadastros.types';
import { EadGroupMode, EadSortMode, EadStatusFilter } from './cursos-ead.service';
import { useCursosEadQueries } from './hooks/useCursosEadQueries';
import { useCursosEadRealtime } from './hooks/useCursosEadRealtime';
import { useCursosEadMutations } from './hooks/useCursosEadMutations';

interface CursosEadPageProps {
  readOnly?: boolean;
}

const formatMonthLabelPtBr = (item: any) => {
  const rawLabel = String(item?.label || item?.month || '').trim();
  const normalizedLabel = rawLabel.toUpperCase().replace('.', '');
  const englishToPtBr: Record<string, string> = {
    JAN: 'JAN',
    FEB: 'FEV',
    MAR: 'MAR',
    APR: 'ABR',
    MAY: 'MAI',
    JUN: 'JUN',
    JUL: 'JUL',
    AUG: 'AGO',
    SEP: 'SET',
    OCT: 'OUT',
    NOV: 'NOV',
    DEC: 'DEZ'
  };

  if (englishToPtBr[normalizedLabel]) return englishToPtBr[normalizedLabel];

  const rawMonth = String(item?.month || '').trim();
  const numericMonth = rawMonth.match(/^\d{4}-(\d{1,2})/)?.[1] || rawMonth.match(/^(\d{1,2})$/)?.[1];
  if (numericMonth) {
    const ptBrMonths = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    return ptBrMonths[Number(numericMonth) - 1] || rawLabel.toUpperCase();
  }

  return rawLabel.toUpperCase();
};

const CursosEadPage: React.FC<CursosEadPageProps> = ({ readOnly = false }) => {
  const [viewState, setViewState] = useState<'list' | 'wizard'>('list');
  const [selectedCurso, setSelectedCurso] = useState<Curso | null>(null);

  const [statusFilter, setStatusFilter] = useState<EadStatusFilter>('ativo');
  const [searchTerm, setSearchTerm] = useState('');
  const [areaFilter, setAreaFilter] = useState('Todas');
  const [groupMode, setGroupMode] = useState<EadGroupMode>('area');
  const [sortMode, setSortMode] = useState<EadSortMode>('nome_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Duplicate Modal states
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateTargetId, setDuplicateTargetId] = useState<string | null>(null);
  const [duplicateNome, setDuplicateNome] = useState('');
  const [duplicateVersao, setDuplicateVersao] = useState('2.0');
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Estados para Modal de Confirmação Customizado
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Estados para Toast Customizado
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const {
    dashboardQuery,
    groupedCoursesQuery,
    areaOptionsQuery,
    invalidateEadQueries
  } = useCursosEadQueries({
    statusFilter,
    searchTerm,
    areaFilter,
    groupMode,
    sortMode,
    currentPage,
    pageSize
  });

  useCursosEadRealtime(invalidateEadQueries);

  const {
    duplicateMutation,
    toggleStatusMutation,
    deleteMutation
  } = useCursosEadMutations(
    invalidateEadQueries,
    showToast,
    setIsDuplicating,
    setShowDuplicateModal,
    setDuplicateTargetId
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm, areaFilter, groupMode, sortMode]);

  const handleCreateNew = () => {
    setSelectedCurso(null);
    setViewState('wizard');
  };

  const handleEditCurso = (curso: Curso) => {
    setSelectedCurso(curso);
    setViewState('wizard');
  };

  const handleWizardBack = () => {
    setViewState('list');
    invalidateEadQueries();
  };

  const handleWizardSave = () => {
    setViewState('list');
    invalidateEadQueries();
  };

  // Open Duplication Modal
  const handleOpenDuplicate = (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    setDuplicateTargetId(curso.id);
    setDuplicateNome(`${curso.nome} (Cópia)`);
    const currentVer = parseFloat(curso.versao || '1.0');
    setDuplicateVersao(isNaN(currentVer) ? '2.0' : (currentVer + 1.0).toFixed(1));
    setShowDuplicateModal(true);
  };

  // Submit Duplication
  const handleDuplicateCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateTargetId || !duplicateNome.trim()) return;

    setIsDuplicating(true);
    duplicateMutation.mutate({
      cursoId: duplicateTargetId,
      nome: duplicateNome,
      versao: duplicateVersao
    });
  };

  // Toggle Status
  const handleToggleStatus = async (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    const novoStatus = curso.status === 'ativo' ? 'inativo' : 'ativo';
    const confirmMsg = novoStatus === 'inativo' 
      ? 'Deseja PAUSAR (inativar) este curso EAD? Ele deixará de aparecer no catálogo público.' 
      : 'Deseja REATIVAR este curso EAD?';
    
    setConfirmModal({
      isOpen: true,
      title: novoStatus === 'inativo' ? 'Pausar Curso EAD' : 'Ativar Curso EAD',
      message: confirmMsg,
      onConfirm: () => toggleStatusMutation.mutate({ cursoId: curso.id, novoStatus })
    });
  };

  // Delete Course
  const handleDeleteCurso = async (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    const totalTurmas = (curso as any).total_turmas || 0;
    if (Number(totalTurmas) > 0) {
      showToast(`Não é possível excluir o curso "${curso.nome}" porque ele possui ${totalTurmas} turma(s) vinculada(s).`, 'warning');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Excluir Curso EAD',
      message: `Tem certeza que deseja EXCLUIR DEFINITIVAMENTE o curso EAD "${curso.nome}"?\n\nEsta ação não poderá ser desfeita.`,
      onConfirm: () => deleteMutation.mutate(curso.id)
    });
  };

  const dashboard = dashboardQuery.data || { totalCursos: 0, cursosAtivos: 0, cursosInativos: 0, totalAlunos: 0, ultimosTresMeses: [] };
  const groupedData = groupedCoursesQuery.data || { groups: [], total: 0 };
  const areaOptions = areaOptionsQuery.data || [];
  const loading = dashboardQuery.isLoading || groupedCoursesQuery.isLoading;
  const monthlyTrend = dashboard.ultimosTresMeses || [];
  const total = Number(groupedData.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (viewState === 'wizard') {
    return (
      <EadCourseWizard 
        curso={selectedCurso} 
        onBack={handleWizardBack} 
        onSave={handleWizardSave} 
      />
    );
  }

  return (
    <div className="animate-fadeIn relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b border-slate-100 pb-6 gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Cursos EAD
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Gestão de cursos na modalidade de Educação a Distância (online).
          </p>
        </div>
        
        {!readOnly && <button
          onClick={handleCreateNew}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-purple-700 hover:shadow-lg hover:shadow-purple-600/20 transition-all shadow-md"
        >
          <Plus size={16} /> Novo Curso EAD
        </button>}
      </div>

      {readOnly && (
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
          Modo de visualização do polo: cadastros e alterações são exclusivos da Matriz.
        </div>
      )}

      {/* KPIs e gráfico calculados pelo Supabase */}
      <div className="grid grid-cols-1 lg:grid-cols-12 items-start gap-4 mb-6">
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 items-start gap-4">
          <div className="min-h-[132px] bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
            <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
              <BookOpenCheck size={18} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total de cursos EAD</p>
            <p className="text-2xl font-black text-[#001a33] mt-1">{dashboard.totalCursos}</p>
          </div>

          <div className="min-h-[132px] bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <Users size={18} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Alunos em EAD</p>
            <p className="text-2xl font-black text-[#001a33] mt-1">{dashboard.totalAlunos}</p>
          </div>

          <div className="min-h-[132px] bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <MonitorPlay size={18} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cursos publicados</p>
            <p className="text-2xl font-black text-[#001a33] mt-1">{dashboard.cursosAtivos}</p>
          </div>
        </div>

        <div className="lg:col-span-4 min-h-[132px] bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inscrições EAD</p>
              <h3 className="text-sm font-black text-[#001a33] uppercase tracking-tight">Últimos 3 meses</h3>
            </div>
            <BarChart3 size={18} className="text-purple-600" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {monthlyTrend.map((item: any) => (
              <div key={item.month} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-center">
                <p className="text-xl font-black text-[#001a33] leading-none">{item.total}</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{formatMonthLabelPtBr(item)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Busca, filtros e organizacao */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 mb-6 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-6 relative">
            <span className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
              <Search size={17} />
            </span>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar curso EAD por nome ou descrição..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-xs font-bold text-slate-700 outline-none transition-all focus:border-purple-400 focus:bg-white focus:ring-2 focus:ring-purple-100"
            />
          </div>
          <div className="lg:col-span-2">
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 outline-none transition-all focus:border-purple-400 focus:bg-white focus:ring-2 focus:ring-purple-100"
            >
              <option value="Todas">Todas as áreas</option>
              {areaOptions.map((area: string) => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <select
              value={groupMode}
              onChange={(e) => setGroupMode(e.target.value as EadGroupMode)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 outline-none transition-all focus:border-purple-400 focus:bg-white focus:ring-2 focus:ring-purple-100"
            >
              <option value="area">Agrupar por área</option>
              <option value="none">Sem agrupamento</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as EadSortMode)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 outline-none transition-all focus:border-purple-400 focus:bg-white focus:ring-2 focus:ring-purple-100"
            >
              <option value="nome_asc">A-Z</option>
              <option value="nome_desc">Z-A</option>
              <option value="area_asc">Área + A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs Filtro Status */}
      <div className="flex gap-2 mb-8 bg-slate-100 p-1 rounded-2xl max-w-xs border border-slate-200">
        <button 
          onClick={() => setStatusFilter('ativo')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            statusFilter === 'ativo' 
              ? 'bg-white text-purple-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Ativos ({dashboard.cursosAtivos})
        </button>
        <button 
          onClick={() => setStatusFilter('inativo')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            statusFilter === 'inativo' 
              ? 'bg-white text-red-500 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Inativos ({dashboard.cursosInativos})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-purple-600" size={32} />
        </div>
      ) : groupedData.groups.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-250">
           <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-purple-100">
             <MonitorPlay size={28} />
           </div>
           <p className="text-slate-500 font-bold text-sm uppercase tracking-wide">Nenhum curso EAD {statusFilter === 'ativo' ? 'ativo' : 'inativo'} cadastrado.</p>
           <p className="text-slate-400 text-xs mt-1">Ajuste a busca, o filtro de área ou clique em "Novo Curso EAD".</p>
        </div>
      ) : (
        <div className="space-y-10">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs font-bold text-slate-500">
              Exibindo {total === 0 ? 0 : ((currentPage - 1) * pageSize + 1)} a {Math.min(currentPage * pageSize, total)} de {total} curso(s)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 text-[10px] font-black rounded-xl border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="text-[10px] font-black px-3 py-2 bg-slate-100 rounded-xl border border-slate-200">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-2 text-[10px] font-black rounded-xl border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próxima
              </button>
            </div>
          </div>
          {groupedData.groups.map((group: any) => (
            <div key={group.area} className="animate-fadeIn">
              {groupMode === 'area' && (
                <h3 className="text-base font-black text-[#001a33] uppercase tracking-widest border-l-4 border-purple-600 pl-3 mb-6 flex items-center gap-2">
                  <span>{group.area}</span>
                  <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-100 font-bold">{group.total}</span>
                </h3>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {(group.cursos || []).map((curso: Curso) => (
                  <CursoEadCard 
                    key={curso.id} 
                    curso={curso} 
                    readOnly={readOnly}
                    onClick={() => handleEditCurso(curso)} 
                    onDuplicate={(e) => handleOpenDuplicate(curso, e)}
                    onToggleStatus={(e) => handleToggleStatus(curso, e)}
                    onDelete={(e) => handleDeleteCurso(curso, e)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Duplicação */}
      {!readOnly && showDuplicateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => setShowDuplicateModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-50 transition-all"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl border border-purple-100">
                <Copy size={20} />
              </div>
              <div>
                <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Duplicar Curso EAD</h4>
                <p className="text-xs text-slate-550">Gere uma cópia completa com todas as etapas configuradas.</p>
              </div>
            </div>

            <form onSubmit={handleDuplicateCurso} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Novo Curso EAD</label>
                <input
                  type="text"
                  required
                  placeholder="Nome do curso clonado..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-bold text-slate-800 text-xs"
                  value={duplicateNome}
                  onChange={e => setDuplicateNome(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nova Versão</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 2.0"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-bold text-slate-800 text-xs"
                  value={duplicateVersao}
                  onChange={e => setDuplicateVersao(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowDuplicateModal(false)}
                  className="flex-1 py-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl font-bold uppercase text-[10px] tracking-wider border border-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDuplicating}
                  className="flex-1 py-3 bg-purple-650 hover:bg-purple-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-600/15"
                >
                  {isDuplicating ? (
                    <>
                      <Loader2 className="animate-spin" size={12} />
                      Duplicando...
                    </>
                  ) : (
                    'Confirmar Cópia'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Custom Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 relative animate-slideUp">
            <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight mb-2">
              {confirmModal.title}
            </h3>
            <p className="text-xs text-slate-500 font-semibold mb-6 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl font-bold uppercase text-[10px] tracking-wider border border-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all shadow-md shadow-red-600/20 animate-none border border-red-700/10"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed top-6 right-6 z-[99999] animate-fadeIn">
          <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 ${
            toast.type === 'success' 
            ? 'bg-emerald-500/95 border-emerald-400 text-white' 
            : toast.type === 'warning'
            ? 'bg-amber-500/95 border-amber-400 text-white'
            : 'bg-red-500/95 border-red-400 text-white'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CursosEadPage;
