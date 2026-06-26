// File: modules/gestor/cadastros/cursos-tecnicos/CursosTecnicosPage.tsx

import React, { useState } from 'react';
import { Briefcase, Plus, Loader2, X, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';
import CursoTecnicoCard from './components/CursoTecnicoCard';
import CursoGradeCurricularDetails from '../components/CursoGradeCurricularDetails';
import { Curso } from '../cadastros.types';
import { CursoTecnicoStatusFilter } from './cursos-tecnicos.service';
import { useCursosTecnicosQueries } from './hooks/useCursosTecnicosQueries';
import { useCursosTecnicosRealtime } from './hooks/useCursosTecnicosRealtime';
import { useCursosTecnicosMutations } from './hooks/useCursosTecnicosMutations';

const CursosTecnicosPage: React.FC = () => {
  const [viewState, setViewState] = useState<'list' | 'details'>('list');
  const [selectedCurso, setSelectedCurso] = useState<Curso | null>(null);

  const [statusFilter, setStatusFilter] = useState<CursoTecnicoStatusFilter>('ativo');

  // Estados para Modal de Novo Curso
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCursoNome, setNewCursoNome] = useState('');
  const [newCursoDesc, setNewCursoDesc] = useState('');
  const [newCursoArea, setNewCursoArea] = useState('Saúde');
  const [newCursoVersao, setNewCursoVersao] = useState('1.0');
  const [newCursoCargaHoraria, setNewCursoCargaHoraria] = useState<number>(1200);
  const [newCursoDuracaoMeses, setNewCursoDuracaoMeses] = useState<number>(24);
  const [isCreatingCurso, setIsCreatingCurso] = useState(false);

  // Estados para Upload de Imagem e Publicação
  const [newCursoImagemUrl, setNewCursoImagemUrl] = useState('');
  const [newCursoPublicarSite, setNewCursoPublicarSite] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

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
    setNewCursoCargaHoraria(1200);
    setNewCursoDuracaoMeses(24);
    setNewCursoImagemUrl('');
    setNewCursoPublicarSite(true);
  };

  const closeDuplicateModal = () => {
    setShowDuplicateModal(false);
    setDuplicateTargetId(null);
  };

  const { cursosQuery, invalidateCursosTecnicos } = useCursosTecnicosQueries();
  useCursosTecnicosRealtime(invalidateCursosTecnicos);

  const {
    createMutation,
    deleteMutation,
    duplicateMutation,
    toggleStatusMutation,
    uploadImagemMutation
  } = useCursosTecnicosMutations({
    invalidateCursosTecnicos,
    showToast,
    resetCreateForm,
    closeDuplicateModal,
    setIsCreatingCurso,
    setIsDuplicating
  });

  const cursos = cursosQuery.data || [];
  const loading = cursosQuery.isLoading;

  const handleUploadImagem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const publicUrl = await uploadImagemMutation.mutateAsync(file);
      setNewCursoImagemUrl(publicUrl);
    } catch {
      // O toast de erro fica centralizado na mutation.
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectCurso = (curso: Curso) => {
    setSelectedCurso(curso);
    setViewState('details');
  };

  const handleBack = () => {
    setSelectedCurso(null);
    setViewState('list');
    invalidateCursosTecnicos();
  };

  // Criação de Curso
  const handleCreateCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCursoNome.trim()) return;

    setIsCreatingCurso(true);
    createMutation.mutate({
      nome: newCursoNome,
      carga_horaria: newCursoCargaHoraria,
      area: newCursoArea,
      descricao: newCursoDesc,
      versao: newCursoVersao,
      duracao_meses: newCursoDuracaoMeses,
      imagem_url: newCursoImagemUrl || null,
      publicar_site: newCursoPublicarSite
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
      title: 'Excluir Curso Técnico',
      message: `Tem certeza de que deseja EXCLUIR definitivamente o curso "${curso.nome}"? Esta ação removerá a grade curricular vinculada e não poderá ser desfeita.`,
      onConfirm: () => deleteMutation.mutate(curso.id)
    });
  };

  // Duplicação de Curso
  const handleOpenDuplicate = (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    setDuplicateTargetId(curso.id);
    setDuplicateNome(`${curso.nome} (Cópia)`);
    // Tenta sugerir uma versão incremental
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
      ? 'Tem certeza de que deseja INATIVAR este curso? Ele não ficará visível para novas matrículas.' 
      : 'Deseja reativar este curso?';
    
    setConfirmModal({
      isOpen: true,
      title: novoStatus === 'inativo' ? 'Pausar Curso' : 'Reativar Curso',
      message: confirmMsg,
      onConfirm: () => toggleStatusMutation.mutate({ cursoId: curso.id, novoStatus })
    });
  };

  // Filtra cursos pelo status
  const filteredCursos = cursos.filter(c => c.status === statusFilter);

  const groupedClean: Record<string, Curso[]> = {};
  filteredCursos.forEach(c => {
    const area = c.area || 'Outros';
    if (!groupedClean[area]) {
      groupedClean[area] = [];
    }
    groupedClean[area].push(c);
  });

  if (viewState === 'details' && selectedCurso) {
    return (
      <CursoGradeCurricularDetails 
        curso={selectedCurso} 
        onBack={handleBack} 
        onUpdate={invalidateCursosTecnicos}
      />
    );
  }

  return (
    <div className="animate-fadeIn relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 border-b border-slate-100 pb-6 gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Cursos Técnicos
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Gerenciamento de grade curricular e ofertas de cursos técnicos.
          </p>
        </div>
        
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Curso
        </button>
      </div>

      {/* Tabs de Filtro de Status */}
      <div className="flex gap-2 mb-8 bg-slate-100 p-1 rounded-2xl max-w-xs border border-slate-200">
        <button 
          onClick={() => setStatusFilter('ativo')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            statusFilter === 'ativo' 
              ? 'bg-white text-emerald-600 shadow-sm' 
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
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : filteredCursos.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2rem] border border-dashed border-slate-300">
           <Briefcase className="text-slate-300 mx-auto mb-4" size={48} />
           <p className="text-slate-500 font-medium">Nenhum curso técnico {statusFilter === 'ativo' ? 'ativo' : 'inativo'} cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedClean).map(([area, list]) => (
            <div key={area} className="animate-fadeIn">
              <h3 className="text-base font-black text-[#001a33] uppercase tracking-widest border-l-4 border-emerald-500 pl-3 mb-6 flex items-center gap-2">
                <span>{area}</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{list.length}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {list.map((curso) => (
                  <CursoTecnicoCard 
                    key={curso.id} 
                    curso={curso} 
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
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => setShowCreateModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-50 transition-all"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight mb-6">Novo Curso Técnico</h3>
            
            <form onSubmit={handleCreateCurso} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Curso</label>
                <input 
                  required
                  type="text" 
                  value={newCursoNome}
                  onChange={(e) => setNewCursoNome(e.target.value)}
                  placeholder="Ex: Técnico em Enfermagem"
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Carga Horária (Hrs)</label>
                  <input 
                    required
                    type="number" 
                    value={newCursoCargaHoraria}
                    onChange={(e) => setNewCursoCargaHoraria(Number(e.target.value))}
                    placeholder="Ex: 1200"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Duração (Meses)</label>
                  <input 
                    required
                    type="number" 
                    value={newCursoDuracaoMeses}
                    onChange={(e) => setNewCursoDuracaoMeses(Number(e.target.value))}
                    placeholder="Ex: 24"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Imagem de Capa */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Imagem de Capa (Card)</label>
                <div className="flex items-center gap-4">
                  {newCursoImagemUrl ? (
                    <div className="relative w-24 h-16 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shrink-0">
                      <img src={newCursoImagemUrl} alt="Capa" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setNewCursoImagemUrl('')}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full transition-colors"
                        title="Remover Imagem"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-16 bg-slate-50 border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 shrink-0 text-xs font-bold uppercase">
                      Sem Capa
                    </div>
                  )}
                  <div className="flex-grow">
                    <label className="inline-block px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all">
                      {isUploading ? 'Fazendo Upload...' : newCursoImagemUrl ? 'Alterar Imagem' : 'Upload de Imagem'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadImagem}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[9px] text-slate-400 mt-1">Imagens recomendadas: 16:9.</p>
                  </div>
                </div>
              </div>

              {/* Publicar no site público checkbox */}
              <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <input 
                  type="checkbox"
                  id="newCursoPublicarSite"
                  checked={newCursoPublicarSite}
                  onChange={(e) => setNewCursoPublicarSite(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="newCursoPublicarSite" className="text-xs font-bold text-slate-700 select-none cursor-pointer">
                  Publicar no site público
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Descrição do Curso</label>
                <textarea 
                  value={newCursoDesc}
                  onChange={(e) => setNewCursoDesc(e.target.value)}
                  placeholder="Resumo sobre a formação e mercado..."
                  className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={isCreatingCurso}
                  className="flex-1 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg disabled:opacity-75"
                >
                  {isCreatingCurso ? 'Criando...' : 'Criar Curso'}
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

      {/* Modal Duplicar / Criar Nova Versão */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => setShowDuplicateModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-50 transition-all"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight mb-6 flex items-center gap-2">
              <Copy size={20} className="text-emerald-500" />
              <span>Duplicar Curso</span>
            </h3>
            
            <form onSubmit={handleDuplicateCurso} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome da Nova Versão/Cópia</label>
                <input 
                  required
                  type="text" 
                  value={duplicateNome}
                  onChange={(e) => setDuplicateNome(e.target.value)}
                  placeholder="Ex: Técnico em Enfermagem 2.0"
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
                  placeholder="Ex: 2.0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-xs text-blue-800 leading-relaxed font-medium">
                Esta ação criará um novo curso clonando toda a estrutura curricular (módulos, disciplinas e aulas) do curso original. O curso original permanecerá intacto.
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={isDuplicating}
                  className="flex-1 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg disabled:opacity-75"
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

export default CursosTecnicosPage;
