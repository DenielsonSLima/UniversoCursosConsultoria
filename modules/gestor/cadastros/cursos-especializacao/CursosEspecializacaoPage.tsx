// File: modules/gestor/cadastros/cursos-especializacao/CursosEspecializacaoPage.tsx

import React, { useState } from 'react';
import { Award, Plus, Loader2, X, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';
import CursoEspecializacaoCard from './components/CursoEspecializacaoCard';
import CursoGradeCurricularDetails from '../components/CursoGradeCurricularDetails';
import { Curso } from '../cadastros.types';
import { CursoEspecializacaoStatusFilter } from './cursos-especializacao.service';
import { useCursosEspecializacaoQueries } from './hooks/useCursosEspecializacaoQueries';
import { useCursosEspecializacaoRealtime } from './hooks/useCursosEspecializacaoRealtime';
import { useCursosEspecializacaoMutations } from './hooks/useCursosEspecializacaoMutations';

interface CursosEspecializacaoPageProps {
  readOnly?: boolean;
}

const CursosEspecializacaoPage: React.FC<CursosEspecializacaoPageProps> = ({ readOnly = false }) => {
  const [viewState, setViewState] = useState<'list' | 'details'>('list');
  const [selectedCurso, setSelectedCurso] = useState<Curso | null>(null);

  const [statusFilter, setStatusFilter] = useState<CursoEspecializacaoStatusFilter>('ativo');

  // Estados para Modal de Novo Curso
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCursoNome, setNewCursoNome] = useState('');
  const [newCursoDesc, setNewCursoDesc] = useState('');
  const [newCursoArea, setNewCursoArea] = useState('Saúde');
  const [newCursoVersao, setNewCursoVersao] = useState('1.0');
  const [newCursoCargaHoraria, setNewCursoCargaHoraria] = useState(120);
  const [isCreatingCurso, setIsCreatingCurso] = useState(false);

  // Estados para Modal de Duplicação
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

  const areasDisponiveis = ['Saúde', 'Gestão', 'Tecnologia', 'Educação', 'Outros'];

  const resetCreateForm = () => {
    setShowCreateModal(false);
    setNewCursoNome('');
    setNewCursoDesc('');
    setNewCursoArea('Saúde');
    setNewCursoVersao('1.0');
    setNewCursoCargaHoraria(120);
  };

  const closeDuplicateModal = () => {
    setShowDuplicateModal(false);
    setDuplicateTargetId(null);
  };

  const { cursosQuery, invalidateCursosEspecializacao } = useCursosEspecializacaoQueries();
  useCursosEspecializacaoRealtime(invalidateCursosEspecializacao);

  const {
    createMutation,
    duplicateMutation,
    toggleStatusMutation,
    deleteMutation
  } = useCursosEspecializacaoMutations({
    invalidateCursosEspecializacao,
    showToast,
    resetCreateForm,
    closeDuplicateModal,
    setIsCreatingCurso,
    setIsDuplicating,
  });

  const cursos = cursosQuery.data || [];
  const loading = cursosQuery.isLoading;

  const handleSelectCurso = (curso: Curso) => {
    setSelectedCurso(curso);
    setViewState('details');
  };

  const handleBack = () => {
    setSelectedCurso(null);
    setViewState('list');
    invalidateCursosEspecializacao();
  };

  // Criação de Curso
  const handleCreateCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCursoNome.trim()) return;

    setIsCreatingCurso(true);
    createMutation.mutate({
      nome: newCursoNome,
      descricao: newCursoDesc,
      area: newCursoArea,
      versao: newCursoVersao,
      cargaHoraria: Number.isFinite(newCursoCargaHoraria) ? newCursoCargaHoraria : 120,
    });
  };

  // Duplicação de Curso
  const handleOpenDuplicate = (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    setDuplicateTargetId(curso.id);
    setDuplicateNome(`${curso.nome} (Cópia)`);
    const currentVer = parseFloat(curso.versao);
    setDuplicateVersao(isNaN(currentVer) ? '2.0' : (currentVer + 1.0).toFixed(1));
    setShowDuplicateModal(true);
  };

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

  // Alterar Status (Ativo/Inativo)
  const handleToggleStatus = async (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    const novoStatus = curso.status === 'ativo' ? 'inativo' : 'ativo';
    const confirmMsg = novoStatus === 'inativo' 
      ? 'Deseja INATIVAR esta especialização técnica?' 
      : 'Deseja reativar esta especialização técnica?';
    
    setConfirmModal({
      isOpen: true,
      title: novoStatus === 'inativo' ? 'Pausar Curso' : 'Reativar Curso',
      message: confirmMsg,
      onConfirm: () => toggleStatusMutation.mutate({ cursoId: curso.id, novoStatus })
    });
  };

  // Exclusão definitiva de curso
  const handleDeleteCurso = async (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    const totalTurmas = (curso as any).total_turmas || 0;
    if (Number(totalTurmas) > 0) {
      showToast(`Não é possível excluir o curso "${curso.nome}" porque ele possui ${totalTurmas} turma(s) vinculada(s).`, 'warning');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Excluir Especialização',
      message: `Tem certeza de que deseja EXCLUIR definitivamente a especialização "${curso.nome}"? Esta ação removerá a grade curricular vinculada e não poderá ser desfeita.`,
      onConfirm: () => deleteMutation.mutate(curso.id)
    });
  };

  // Filtra cursos pelo status
  const filteredCursos = cursos.filter(c => c.status === statusFilter);

  // Agrupa os cursos por área
  const groupedCursos: Record<string, Curso[]> = {};
  filteredCursos.forEach(c => {
    const area = c.area || 'Outros';
    if (!groupedCursos[area]) {
      groupedCursos[area] = [];
    }
    groupedCursos[area].push(c);
  });

  if (viewState === 'details' && selectedCurso) {
    return (
      <CursoGradeCurricularDetails 
        curso={selectedCurso} 
        onBack={handleBack} 
        onUpdate={invalidateCursosEspecializacao}
      />
    );
  }

  return (
    <div className="animate-fadeIn relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 border-b border-slate-100 pb-6 gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Especialização Técnica
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Pós-técnico e aprofundamento profissional.
          </p>
        </div>
        
        {!readOnly && <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-rose-600 transition-colors shadow-lg shadow-rose-900/20"
        >
          <Plus size={16} /> Nova Especialização
        </button>}
      </div>

      {readOnly && (
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
          Modo de visualização do polo: cadastros e alterações são exclusivos da Matriz.
        </div>
      )}

      {/* Tabs de Filtro de Status */}
      <div className="flex gap-2 mb-8 bg-slate-100 p-1 rounded-2xl max-w-xs border border-slate-200">
        <button 
          onClick={() => setStatusFilter('ativo')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            statusFilter === 'ativo' 
              ? 'bg-white text-rose-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Ativos ({cursos.filter(c => c.status === 'ativo').length})
        </button>
        <button 
          onClick={() => setStatusFilter('inativo')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            statusFilter === 'inativo' 
              ? 'bg-white text-red-500 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Inativos ({cursos.filter(c => c.status === 'inativo').length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-rose-600" size={32} />
        </div>
      ) : filteredCursos.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2rem] border border-dashed border-slate-300">
           <Award className="text-slate-300 mx-auto mb-4" size={48} />
           <p className="text-slate-500 font-medium">Nenhuma especialização {statusFilter === 'ativo' ? 'ativa' : 'inativa'} cadastrada.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedCursos).map(([area, list]) => (
            <div key={area} className="animate-fadeIn">
              <h3 className="text-base font-black text-[#001a33] uppercase tracking-widest border-l-4 border-rose-500 pl-3 mb-6 flex items-center gap-2">
                <span>{area}</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{list.length}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {list.map((curso) => (
                  <CursoEspecializacaoCard 
                    key={curso.id} 
                    curso={curso} 
                    readOnly={readOnly}
                    onClick={() => handleSelectCurso(curso)} 
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

      {/* Modal Criar Novo Curso */}
      {!readOnly && showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => setShowCreateModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-50 transition-all"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight mb-6">Nova Especialização</h3>
            
            <form onSubmit={handleCreateCurso} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Curso</label>
                <input 
                  required
                  type="text" 
                  value={newCursoNome}
                  onChange={(e) => setNewCursoNome(e.target.value)}
                  placeholder="Ex: Especialização em Instrumentação Cirúrgica"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Área / Categoria</label>
                  <select 
                    value={newCursoArea}
                    onChange={(e) => setNewCursoArea(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                  >
                    {areasDisponiveis.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Carga Horária (h)</label>
                  <input 
                    required
                    type="number"
                    min="1"
                    value={newCursoCargaHoraria}
                    onChange={(e) => setNewCursoCargaHoraria(parseInt(e.target.value, 10) || 0)}
                    placeholder="Ex: 120"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Versão</label>
                  <input 
                    required
                    type="text" 
                    value={newCursoVersao}
                    onChange={(e) => setNewCursoVersao(e.target.value)}
                    placeholder="Ex: 1.0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Descrição do Curso</label>
                <textarea 
                  value={newCursoDesc}
                  onChange={(e) => setNewCursoDesc(e.target.value)}
                  placeholder="Resumo..."
                  className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={isCreatingCurso}
                  className="flex-1 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-rose-600 transition-colors shadow-lg disabled:opacity-75"
                >
                  {isCreatingCurso ? 'Criando...' : 'Criar Especialização'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Duplicar */}
      {!readOnly && showDuplicateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => setShowDuplicateModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-50 transition-all"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight mb-6 flex items-center gap-2">
              <Copy size={20} className="text-rose-500" />
              <span>Duplicar Especialização</span>
            </h3>
            
            <form onSubmit={handleDuplicateCurso} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome da Cópia</label>
                <input 
                  required
                  type="text" 
                  value={duplicateNome}
                  onChange={(e) => setDuplicateNome(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Versão</label>
                <input 
                  required
                  type="text" 
                  value={duplicateVersao}
                  onChange={(e) => setDuplicateVersao(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={isDuplicating}
                  className="flex-1 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-rose-600 transition-colors shadow-lg disabled:opacity-75"
                >
                  {isDuplicating ? 'Clonando...' : 'Confirmar Duplicação'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowDuplicateModal(false)}
                  className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-colors"
                >
                  Cancelar
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
                className="flex-1 py-3 bg-red-650 hover:bg-red-750 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all shadow-md animate-none"
              >
                Confirmar
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

export default CursosEspecializacaoPage;
