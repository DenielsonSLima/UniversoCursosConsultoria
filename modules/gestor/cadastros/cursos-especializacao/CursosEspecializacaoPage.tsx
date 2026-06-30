// File: modules/gestor/cadastros/cursos-especializacao/CursosEspecializacaoPage.tsx

import React, { useState } from 'react';
import { ArrowLeft, Award, Plus, Loader2, X, Copy, CheckCircle2, AlertTriangle, Image as ImageIcon, Save, Banknote, Receipt, CreditCard } from 'lucide-react';
import CursoEspecializacaoCard from './components/CursoEspecializacaoCard';
import CursoGradeCurricularDetails from '../components/CursoGradeCurricularDetails';
import { Curso, CursoFinanceiroConfig } from '../cadastros.types';
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
  const [newCursoDuracaoMeses, setNewCursoDuracaoMeses] = useState(6);
  const [newCursoImagemUrl, setNewCursoImagemUrl] = useState('');
  const [newCursoPublicarSite, setNewCursoPublicarSite] = useState(true);
  const [financeiroPix, setFinanceiroPix] = useState(true);
  const [financeiroBoleto, setFinanceiroBoleto] = useState(true);
  const [financeiroCartao, setFinanceiroCartao] = useState(true);
  const [financeiroMaxParcelas, setFinanceiroMaxParcelas] = useState(2);
  const [isUploading, setIsUploading] = useState(false);
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

  const [areasDisponiveis, setAreasDisponiveis] = useState(['Saúde', 'Gestão', 'Tecnologia', 'Educação', 'Outros']);
  const [showNewAreaInput, setShowNewAreaInput] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');

  const resetCreateForm = () => {
    setShowCreateModal(false);
    setNewCursoNome('');
    setNewCursoDesc('');
    setNewCursoArea('Saúde');
    setNewCursoVersao('1.0');
    setNewCursoCargaHoraria(120);
    setNewCursoDuracaoMeses(6);
    setNewCursoImagemUrl('');
    setNewCursoPublicarSite(true);
    setFinanceiroPix(true);
    setFinanceiroBoleto(true);
    setFinanceiroCartao(true);
    setFinanceiroMaxParcelas(2);
  };

  const closeDuplicateModal = () => {
    setShowDuplicateModal(false);
    setDuplicateTargetId(null);
  };

  const handleAddArea = () => {
    const area = newAreaName.trim();
    if (!area) return;

    setAreasDisponiveis((prev) => prev.some((item) => item.toLowerCase() === area.toLowerCase()) ? prev : [...prev, area]);
    setNewCursoArea(area);
    setNewAreaName('');
    setShowNewAreaInput(false);
  };

  const buildFinanceiroConfig = (): CursoFinanceiroConfig => ({
    valorBase: 0,
    descontoPontualidade: 0,
    parcelasPadrao: 1,
    taxaPagaPor: 'aluno',
    metodosRecebimento: {
      pix: financeiroPix,
      boleto: financeiroBoleto,
      cartao: financeiroCartao
    },
    descontoMetodo: {
      pix: false,
      boleto: false,
      cartao: false
    },
    cartao: {
      aceitar: financeiroCartao,
      maxParcelas: financeiroCartao ? Math.max(1, financeiroMaxParcelas) : 1,
      aplicarDescontoPontualidade: false
    },
    asaas: {
      gerarParcelamentoMensalidades: false,
      tipoCarnePreferencial: 'COBRANCAS_AVULSAS'
    }
  });

  const { cursosQuery, invalidateCursosEspecializacao } = useCursosEspecializacaoQueries();
  useCursosEspecializacaoRealtime(invalidateCursosEspecializacao);

  const {
    createMutation,
    duplicateMutation,
    toggleStatusMutation,
    deleteMutation,
    uploadImagemMutation
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
      e.target.value = '';
    }
  };

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
      duracaoMeses: Number.isFinite(newCursoDuracaoMeses) ? newCursoDuracaoMeses : 6,
      imagemUrl: newCursoImagemUrl || null,
      publicarSite: newCursoPublicarSite,
      financeiroConfig: buildFinanceiroConfig(),
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

  if (!readOnly && showCreateModal) {
    return (
      <div className="flex min-w-0 flex-col h-full animate-fadeIn bg-slate-50 min-h-screen overflow-x-hidden">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white px-4 py-5 sm:px-6 border-b border-slate-200">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => resetCreateForm()}
              className="flex-shrink-0 p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition-colors bg-white shadow-sm"
              aria-label="Voltar"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest bg-rose-50 px-2.5 py-1 rounded-md">
                Especialização Técnica
              </span>
              <h3 className="truncate text-lg sm:text-xl font-black text-[#001a33] mt-1.5 uppercase tracking-tight">
                Nova Especialização
              </h3>
            </div>
          </div>

          <button
            type="submit"
            form="create-especializacao-form"
            disabled={isCreatingCurso || isUploading}
            className="flex w-full sm:w-auto items-center justify-center gap-2 bg-[#001a33] hover:bg-rose-600 text-white px-5 py-3 rounded-xl font-bold uppercase text-xs tracking-wider transition-all disabled:opacity-70 shadow-lg shadow-rose-900/20"
          >
            {isCreatingCurso ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Criar Especialização
          </button>
        </div>

        <div className="bg-white border-b border-slate-200 px-3 py-3 sm:px-6 sm:py-4">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1">
            <div className="group relative flex min-w-0 flex-col items-center gap-2 px-1">
              <span className="relative z-10 w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm transition-all border bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-600/20">
                1
              </span>
              <span className="block w-full truncate text-center text-[10px] font-black uppercase tracking-wide text-rose-600">
                Informações Básicas
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8">
          <form id="create-especializacao-form" onSubmit={handleCreateCurso} className="bg-white border border-slate-200 rounded-[2.5rem] p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                <Award size={20} />
              </span>
              <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">
                Informações Principais do Curso
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Curso *</label>
                <input required type="text" value={newCursoNome} onChange={(e) => setNewCursoNome(e.target.value)} placeholder="Ex: Especialização em Instrumentação Cirúrgica" className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-semibold text-slate-800 transition-all" />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Área de Formação</label>
                  <button type="button" onClick={() => setShowNewAreaInput((prev) => !prev)} className="text-[10px] font-black uppercase tracking-wider text-rose-600 hover:text-rose-700">
                    + Nova área
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <select value={newCursoArea} onChange={(e) => setNewCursoArea(e.target.value)} className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-bold text-slate-800 transition-all cursor-pointer">
                    {areasDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  {showNewAreaInput && (
                    <div className="flex gap-2">
                      <input type="text" value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddArea())} placeholder="Nome da nova área" className="min-w-0 flex-1 px-4 py-2.5 text-xs bg-white border border-rose-200 rounded-xl focus:ring-2 focus:ring-rose-100 outline-none font-bold text-slate-800" />
                      <button type="button" onClick={handleAddArea} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-rose-700">Adicionar</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga Horária (Horas) *</label>
                <input required type="number" min="1" value={newCursoCargaHoraria} onChange={(e) => setNewCursoCargaHoraria(parseInt(e.target.value, 10) || 0)} placeholder="Ex: 120" className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-semibold text-slate-800 transition-all" />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Versão do Curso</label>
                <input required type="text" value={newCursoVersao} onChange={(e) => setNewCursoVersao(e.target.value)} placeholder="Ex: 1.0" className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-semibold text-slate-800 transition-all" />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Duração (Meses)</label>
                <input required type="number" min="1" value={newCursoDuracaoMeses} onChange={(e) => setNewCursoDuracaoMeses(parseInt(e.target.value, 10) || 0)} placeholder="Ex: 6" className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-semibold text-slate-800 transition-all" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo do Curso (Exibido no Catálogo)</label>
              <textarea value={newCursoDesc} onChange={(e) => setNewCursoDesc(e.target.value)} rows={4} placeholder="Forneça um breve resumo descrevendo os objetivos do curso, público-alvo e diferenciais." className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-semibold text-slate-800 transition-all resize-none" />
            </div>

            <div className="border border-slate-200 rounded-3xl p-5 bg-slate-50/60 space-y-4">
              <div className="flex items-center gap-2">
                <Banknote size={18} className="text-rose-600" />
                <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">Opções Financeiras do Curso</h5>
              </div>
              <p className="text-xs font-semibold leading-relaxed text-slate-500">
                Aqui ficam apenas os meios aceitos e o limite do cartão. Valor, número de parcelas, desconto, juros e multa serão definidos na turma.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: 'Pix', icon: Banknote, enabled: financeiroPix, onToggle: () => setFinanceiroPix((prev) => !prev) },
                  { label: 'Boleto', icon: Receipt, enabled: financeiroBoleto, onToggle: () => setFinanceiroBoleto((prev) => !prev) },
                  { label: 'Cartão', icon: CreditCard, enabled: financeiroCartao, onToggle: () => setFinanceiroCartao((prev) => !prev) }
                ].map((method) => {
                  const Icon = method.icon;
                  return (
                    <button type="button" key={method.label} onClick={method.onToggle} className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all ${method.enabled ? 'border-rose-200 bg-white text-rose-700 shadow-sm' : 'border-slate-200 bg-white/70 text-slate-400'}`}>
                      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                        <Icon size={16} />
                        {method.label}
                      </span>
                      <span className={`h-5 w-5 rounded-full border ${method.enabled ? 'border-rose-500 bg-rose-500' : 'border-slate-300 bg-white'}`} />
                    </button>
                  );
                })}
              </div>
              <label className="flex flex-col gap-2 md:max-w-xs">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Máximo de parcelas no cartão</span>
                <input type="number" min={1} max={12} disabled={!financeiroCartao} value={financeiroMaxParcelas} onChange={(e) => setFinanceiroMaxParcelas(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none font-black text-slate-800 disabled:opacity-50" />
              </label>
            </div>

            <div className="border border-slate-200 rounded-3xl p-5 bg-slate-50/60 space-y-4">
              <div className="flex items-center gap-2">
                <ImageIcon size={18} className="text-rose-600" />
                <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">Imagem de Capa do Curso</h5>
              </div>
              <div className="border-2 border-dashed border-slate-200 rounded-3xl p-6 text-center bg-white flex flex-col items-center justify-center gap-4">
                {newCursoImagemUrl ? (
                  <>
                    <img src={newCursoImagemUrl} alt="Capa da especialização" className="max-h-48 rounded-2xl object-cover border border-slate-200 shadow-sm" />
                    <button type="button" onClick={() => setNewCursoImagemUrl('')} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-red-200">Remover</button>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-200 shadow-inner">
                      <ImageIcon size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">Selecione a imagem de capa do curso</p>
                      <p className="text-[10px] text-slate-400 mt-1 font-medium">Recomendado formato horizontal (16:9)</p>
                    </div>
                  </>
                )}
                <label className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md shadow-rose-600/15">
                  {isUploading ? 'Enviando...' : newCursoImagemUrl ? 'Alterar Imagem' : 'Carregar Foto'}
                  <input type="file" accept="image/*" onChange={handleUploadImagem} disabled={isUploading} className="hidden" />
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <input type="checkbox" id="newCursoEspecializacaoPublicarSitePage" checked={newCursoPublicarSite} onChange={(e) => setNewCursoPublicarSite(e.target.checked)} className="h-4 w-4 cursor-pointer rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
              <label htmlFor="newCursoEspecializacaoPublicarSitePage" className="cursor-pointer select-none text-xs font-bold text-slate-700">
                Publicar no site público
              </label>
            </div>
          </form>
        </div>
      </div>
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
};

export default CursosEspecializacaoPage;
