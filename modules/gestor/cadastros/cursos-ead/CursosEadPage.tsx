import React, { useState, useEffect } from 'react';
import { MonitorPlay, Plus, Loader2, X, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';
import CursoEadCard from './components/CursoEadCard';
import EadCourseWizard from './components/EadCourseWizard';
import { cadastrosService } from '../cadastros.service';
import { Curso } from '../cadastros.types';

const CursosEadPage: React.FC = () => {
  const [viewState, setViewState] = useState<'list' | 'wizard'>('list');
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [selectedCurso, setSelectedCurso] = useState<Curso | null>(null);
  const [loading, setLoading] = useState(true);

  // Status Filter ('ativo' | 'inativo')
  const [statusFilter, setStatusFilter] = useState<'ativo' | 'inativo'>('ativo');

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

  useEffect(() => {
    loadCursos();
  }, []);

  const loadCursos = async () => {
    setLoading(true);
    try {
      const data = await cadastrosService.getCursosByModalidade('EAD');
      setCursos(data);
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar cursos EAD.', 'error');
    } finally {
      setLoading(false);
    }
  };

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
    loadCursos();
  };

  const handleWizardSave = () => {
    setViewState('list');
    loadCursos();
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
    try {
      await cadastrosService.duplicateEadCurso(duplicateTargetId, duplicateNome, duplicateVersao);
      setShowDuplicateModal(false);
      setDuplicateTargetId(null);
      loadCursos();
      showToast('Curso EAD duplicado com sucesso!', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao duplicar curso EAD: ' + err.message, 'error');
    } finally {
      setIsDuplicating(false);
    }
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
      onConfirm: async () => {
        try {
          await cadastrosService.toggleStatus(curso.id, novoStatus);
          loadCursos();
          showToast(`Curso EAD ${novoStatus === 'inativo' ? 'inativado' : 'ativado'} com sucesso!`, 'success');
        } catch (err: any) {
          console.error(err);
          showToast('Erro ao alterar status do curso EAD: ' + err.message, 'error');
        }
      }
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
      onConfirm: async () => {
        try {
          await cadastrosService.deleteCurso(curso.id);
          loadCursos();
          showToast('Curso EAD excluído com sucesso!', 'success');
        } catch (err: any) {
          console.error(err);
          showToast('Erro ao excluir curso EAD: ' + err.message, 'error');
        }
      }
    });
  };

  // Filter and group
  const filteredCursos = cursos.filter(c => c.status === statusFilter);

  const groupedCursos: Record<string, Curso[]> = {};
  filteredCursos.forEach(c => {
    const area = c.area || 'Outros';
    if (!groupedCursos[area]) {
      groupedCursos[area] = [];
    }
    groupedCursos[area].push(c);
  });

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
        
        <button 
          onClick={handleCreateNew}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-purple-700 hover:shadow-lg hover:shadow-purple-600/20 transition-all shadow-md"
        >
          <Plus size={16} /> Novo Curso EAD
        </button>
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
          <Loader2 className="animate-spin text-purple-600" size={32} />
        </div>
      ) : filteredCursos.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-250">
           <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-purple-100">
             <MonitorPlay size={28} />
           </div>
           <p className="text-slate-500 font-bold text-sm uppercase tracking-wide">Nenhum curso EAD {statusFilter === 'ativo' ? 'ativo' : 'inativo'} cadastrado.</p>
           <p className="text-slate-400 text-xs mt-1">Clique em "Novo Curso EAD" para criar o primeiro curso online.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedCursos).map(([area, list]) => (
            <div key={area} className="animate-fadeIn">
              <h3 className="text-base font-black text-[#001a33] uppercase tracking-widest border-l-4 border-purple-600 pl-3 mb-6 flex items-center gap-2">
                <span>{area}</span>
                <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-100 font-bold">{list.length}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {list.map((curso) => (
                  <CursoEadCard 
                    key={curso.id} 
                    curso={curso} 
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
      {showDuplicateModal && (
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

export default CursosEadPage;
