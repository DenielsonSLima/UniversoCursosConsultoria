import React from 'react';
import { Award, Plus, Loader2, X, Copy, CheckCircle2, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { Curso } from '../../cadastros.types';
import CursoEspecializacaoCard from './CursoEspecializacaoCard';

interface CursosEspecializacaoOverviewProps {
  readOnly: boolean;
  cursos: Curso[];
  filteredCursos: Curso[];
  groupedCursos: Record<string, Curso[]>;
  loading: boolean;
  statusFilter: 'ativo' | 'inativo';
  setStatusFilter: React.Dispatch<React.SetStateAction<'ativo' | 'inativo'>>;
  showCreateModal: boolean;
  setShowCreateModal: React.Dispatch<React.SetStateAction<boolean>>;
  handleSelectCurso: (curso: Curso) => void;
  handleOpenDuplicate: (curso: Curso, event: React.MouseEvent) => void;
  handleToggleStatus: (curso: Curso, event: React.MouseEvent) => void;
  handleDeleteCurso: (curso: Curso, event: React.MouseEvent) => void;
  areasDisponiveis: string[];
  isCreatingCurso: boolean;
  isUploading: boolean;
  newCursoArea: string;
  newCursoCargaHoraria: number;
  newCursoDesc: string;
  newCursoDuracaoMeses: number;
  newCursoImagemUrl: string;
  newCursoNome: string;
  newCursoPublicarSite: boolean;
  newCursoVersao: string;
  handleCreateCurso: (event: React.FormEvent) => void;
  handleUploadImagem: (event: React.ChangeEvent<HTMLInputElement>) => void;
  setNewCursoArea: React.Dispatch<React.SetStateAction<string>>;
  setNewCursoCargaHoraria: React.Dispatch<React.SetStateAction<number>>;
  setNewCursoDesc: React.Dispatch<React.SetStateAction<string>>;
  setNewCursoDuracaoMeses: React.Dispatch<React.SetStateAction<number>>;
  setNewCursoImagemUrl: React.Dispatch<React.SetStateAction<string>>;
  setNewCursoNome: React.Dispatch<React.SetStateAction<string>>;
  setNewCursoPublicarSite: React.Dispatch<React.SetStateAction<boolean>>;
  setNewCursoVersao: React.Dispatch<React.SetStateAction<string>>;
  showDuplicateModal: boolean;
  setShowDuplicateModal: React.Dispatch<React.SetStateAction<boolean>>;
  duplicateNome: string;
  setDuplicateNome: React.Dispatch<React.SetStateAction<string>>;
  duplicateVersao: string;
  setDuplicateVersao: React.Dispatch<React.SetStateAction<string>>;
  isDuplicating: boolean;
  handleDuplicateCurso: (event: React.FormEvent) => void;
  confirmModal: { isOpen: boolean; title: string; message: string; onConfirm: () => void } | null;
  setConfirmModal: React.Dispatch<React.SetStateAction<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>>;
  toast: { message: string; type: 'success' | 'error' | 'warning' } | null;
}

const CursosEspecializacaoOverview: React.FC<CursosEspecializacaoOverviewProps> = ({
  readOnly,
  cursos,
  filteredCursos,
  groupedCursos,
  loading,
  statusFilter,
  setStatusFilter,
  showCreateModal,
  setShowCreateModal,
  handleSelectCurso,
  handleOpenDuplicate,
  handleToggleStatus,
  handleDeleteCurso,
  areasDisponiveis,
  isCreatingCurso,
  isUploading,
  newCursoArea,
  newCursoCargaHoraria,
  newCursoDesc,
  newCursoDuracaoMeses,
  newCursoImagemUrl,
  newCursoNome,
  newCursoPublicarSite,
  newCursoVersao,
  handleCreateCurso,
  handleUploadImagem,
  setNewCursoArea,
  setNewCursoCargaHoraria,
  setNewCursoDesc,
  setNewCursoDuracaoMeses,
  setNewCursoImagemUrl,
  setNewCursoNome,
  setNewCursoPublicarSite,
  setNewCursoVersao,
  showDuplicateModal,
  setShowDuplicateModal,
  duplicateNome,
  setDuplicateNome,
  duplicateVersao,
  setDuplicateVersao,
  isDuplicating,
  handleDuplicateCurso,
  confirmModal,
  setConfirmModal,
  toast,
}: CursosEspecializacaoOverviewProps) => (
  <div className="formacoes-cursos-overview animate-fadeIn relative">
    {/* Header */}
    <div className="formacoes-cursos-heading flex flex-col md:flex-row justify-between items-end mb-8 border-b border-slate-100 pb-6 gap-4">
      <div>
        <h2 className="formacoes-cursos-title text-3xl font-black text-[#001a33] uppercase tracking-tight">
          Especialização Técnica
        </h2>
        <p className="formacoes-cursos-intro text-slate-500 font-medium mt-1">
          Pós-técnico e aprofundamento profissional.
        </p>
      </div>
      
      {!readOnly && <button
        onClick={() => setShowCreateModal(true)}
        className="formacoes-cursos-new flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-rose-600 transition-colors shadow-lg shadow-rose-900/20"
      >
        <Plus size={16} /> Nova Especialização
      </button>}
    </div>

    {readOnly && (
      <div className="formacoes-cursos-readonly mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
        Modo de visualização do polo: cadastros e alterações são exclusivos da Matriz.
      </div>
    )}

    {/* Tabs de Filtro de Status */}
    <div className="formacoes-cursos-status flex gap-2 mb-8 bg-slate-100 p-1 rounded-2xl max-w-xs border border-slate-200">
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
      <div className="formacoes-cursos-empty flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-rose-600" size={32} />
      </div>
    ) : filteredCursos.length === 0 ? (
      <div className="formacoes-cursos-empty text-center py-20 bg-slate-50 rounded-[2rem] border border-dashed border-slate-300">
         <Award className="text-slate-300 mx-auto mb-4" size={48} />
         <p className="text-slate-500 font-medium">Nenhuma especialização {statusFilter === 'ativo' ? 'ativa' : 'inativa'} cadastrada.</p>
      </div>
    ) : (
      <div className="formacoes-cursos-groups space-y-10">
        {Object.entries(groupedCursos).map(([area, list]) => (
          <div key={area} className="animate-fadeIn">
            <h3 className="formacoes-cursos-group-title text-base font-black text-[#001a33] uppercase tracking-widest border-l-4 border-rose-500 pl-3 mb-6 flex items-center gap-2">
              <span>{area}</span>
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{list.length}</span>
            </h3>
            <div className="formacoes-cursos-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
        <div className="bg-white rounded-[2.5rem] p-6 sm:p-8 max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100 relative">
          <button 
            onClick={() => setShowCreateModal(false)}
            className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-50 transition-all"
          >
            <X size={20} />
          </button>
          <div className="mb-6 pr-10">
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Nova Especialização</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Cadastro próprio da especialização com capa, publicação e dados para o site.</p>
          </div>
          
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Duração (meses)</label>
                <input 
                  required
                  type="number"
                  min="1"
                  value={newCursoDuracaoMeses}
                  onChange={(e) => setNewCursoDuracaoMeses(parseInt(e.target.value, 10) || 0)}
                  placeholder="Ex: 6"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Imagem de capa do curso</label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                {newCursoImagemUrl ? (
                  <div className="relative aspect-video w-full sm:w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <img src={newCursoImagemUrl} alt="Capa da especialização" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setNewCursoImagemUrl('')}
                      className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-600"
                      title="Remover imagem"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex aspect-video w-full sm:w-40 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400">
                    <ImageIcon size={24} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#001a33] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-rose-600">
                    {isUploading ? 'Enviando...' : newCursoImagemUrl ? 'Alterar imagem' : 'Carregar imagem'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadImagem}
                      disabled={isUploading}
                      className="hidden"
                    />
                  </label>
                  <p className="mt-2 text-[10px] font-semibold text-slate-400">Formato recomendado: horizontal 16:9.</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <input 
                type="checkbox"
                id="newCursoEspecializacaoPublicarSite"
                checked={newCursoPublicarSite}
                onChange={(e) => setNewCursoPublicarSite(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <label htmlFor="newCursoEspecializacaoPublicarSite" className="cursor-pointer select-none text-xs font-bold text-slate-700">
                Publicar no site público
              </label>
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
              className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all shadow-md shadow-red-600/20 animate-none border border-red-700/10"
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

export default CursosEspecializacaoOverview;
