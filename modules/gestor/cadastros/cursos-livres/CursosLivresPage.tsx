// File: modules/gestor/cadastros/cursos-livres/CursosLivresPage.tsx

import React, { useState } from 'react';
import CursoLivreCreateView from './components/CursoLivreCreateView';
import CursosLivresOverview from './components/CursosLivresOverview';
import '../formacoes-cursos.css';
import CursoGradeCurricularDetails from '../components/CursoGradeCurricularDetails';
import { Curso, CursoFinanceiroConfig } from '../cadastros.types';
import { CursoLivreStatusFilter } from './cursos-livres.service';
import { useCursosLivresQueries } from './hooks/useCursosLivresQueries';
import { useCursosLivresRealtime } from './hooks/useCursosLivresRealtime';
import { useCursosLivresMutations } from './hooks/useCursosLivresMutations';

interface CursosLivresPageProps {
  readOnly?: boolean;
}

const CursosLivresPage: React.FC<CursosLivresPageProps> = ({ readOnly = false }) => {
  const [viewState, setViewState] = useState<'list' | 'details'>('list');
  const [selectedCurso, setSelectedCurso] = useState<Curso | null>(null);

  const [statusFilter, setStatusFilter] = useState<CursoLivreStatusFilter>('ativo');

  // Estados para Modal de Novo Curso
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCursoNome, setNewCursoNome] = useState('');
  const [newCursoDesc, setNewCursoDesc] = useState('');
  const [newCursoArea, setNewCursoArea] = useState('Capacitação');
  const [newCursoVersao, setNewCursoVersao] = useState('1.0');
  const [newCursoCargaHoraria, setNewCursoCargaHoraria] = useState(40);
  const [newCursoDuracaoMeses, setNewCursoDuracaoMeses] = useState(1);
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

  const [areasDisponiveis, setAreasDisponiveis] = useState(['Capacitação', 'Tecnologia', 'Gestão', 'Idiomas', 'Outros']);
  const [showNewAreaInput, setShowNewAreaInput] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');

  const resetCreateForm = () => {
    setShowCreateModal(false);
    setNewCursoNome('');
    setNewCursoDesc('');
    setNewCursoArea('Capacitação');
    setNewCursoVersao('1.0');
    setNewCursoCargaHoraria(40);
    setNewCursoDuracaoMeses(1);
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

  const { cursosQuery, invalidateCursosLivres } = useCursosLivresQueries();
  useCursosLivresRealtime(invalidateCursosLivres);

  const {
    createMutation,
    duplicateMutation,
    toggleStatusMutation,
    deleteMutation,
    uploadImagemMutation
  } = useCursosLivresMutations({
    invalidateCursosLivres,
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
    invalidateCursosLivres();
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
      cargaHoraria: Number.isFinite(newCursoCargaHoraria) ? newCursoCargaHoraria : 40,
      duracaoMeses: Number.isFinite(newCursoDuracaoMeses) ? newCursoDuracaoMeses : 1,
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
      ? 'Deseja INATIVAR este curso livre?' 
      : 'Deseja reativar este curso livre?';
    
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
      title: 'Excluir Curso Livre',
      message: `Tem certeza de que deseja EXCLUIR definitivamente o curso "${curso.nome}"? Esta ação removerá a grade curricular vinculada e não poderá ser desfeita.`,
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
        onUpdate={invalidateCursosLivres}
      />
    );
  }

  if (!readOnly && showCreateModal) {
    return (
      <CursoLivreCreateView
        areasDisponiveis={areasDisponiveis}
        financeiroBoleto={financeiroBoleto}
        financeiroCartao={financeiroCartao}
        financeiroMaxParcelas={financeiroMaxParcelas}
        financeiroPix={financeiroPix}
        isCreatingCurso={isCreatingCurso}
        isUploading={isUploading}
        newAreaName={newAreaName}
        newCursoArea={newCursoArea}
        newCursoCargaHoraria={newCursoCargaHoraria}
        newCursoDesc={newCursoDesc}
        newCursoDuracaoMeses={newCursoDuracaoMeses}
        newCursoImagemUrl={newCursoImagemUrl}
        newCursoNome={newCursoNome}
        newCursoPublicarSite={newCursoPublicarSite}
        newCursoVersao={newCursoVersao}
        showNewAreaInput={showNewAreaInput}
        handleAddArea={handleAddArea}
        resetCreateForm={resetCreateForm}
        handleCreateCurso={handleCreateCurso}
        handleUploadImagem={handleUploadImagem}
        setFinanceiroBoleto={setFinanceiroBoleto}
        setFinanceiroCartao={setFinanceiroCartao}
        setFinanceiroMaxParcelas={setFinanceiroMaxParcelas}
        setFinanceiroPix={setFinanceiroPix}
        setNewAreaName={setNewAreaName}
        setNewCursoArea={setNewCursoArea}
        setNewCursoCargaHoraria={setNewCursoCargaHoraria}
        setNewCursoDesc={setNewCursoDesc}
        setNewCursoDuracaoMeses={setNewCursoDuracaoMeses}
        setNewCursoImagemUrl={setNewCursoImagemUrl}
        setNewCursoNome={setNewCursoNome}
        setNewCursoPublicarSite={setNewCursoPublicarSite}
        setNewCursoVersao={setNewCursoVersao}
        setShowNewAreaInput={setShowNewAreaInput}
      />
    );
  }

  return (
    <CursosLivresOverview
      readOnly={readOnly}
      cursos={cursos}
      filteredCursos={filteredCursos}
      groupedCursos={groupedCursos}
      loading={loading}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      showCreateModal={showCreateModal}
      setShowCreateModal={setShowCreateModal}
      handleSelectCurso={handleSelectCurso}
      handleOpenDuplicate={handleOpenDuplicate}
      handleToggleStatus={handleToggleStatus}
      handleDeleteCurso={handleDeleteCurso}
      areasDisponiveis={areasDisponiveis}
      isCreatingCurso={isCreatingCurso}
      isUploading={isUploading}
      newCursoArea={newCursoArea}
      newCursoCargaHoraria={newCursoCargaHoraria}
      newCursoDesc={newCursoDesc}
      newCursoDuracaoMeses={newCursoDuracaoMeses}
      newCursoImagemUrl={newCursoImagemUrl}
      newCursoNome={newCursoNome}
      newCursoPublicarSite={newCursoPublicarSite}
      newCursoVersao={newCursoVersao}
      handleCreateCurso={handleCreateCurso}
      handleUploadImagem={handleUploadImagem}
      setNewCursoArea={setNewCursoArea}
      setNewCursoCargaHoraria={setNewCursoCargaHoraria}
      setNewCursoDesc={setNewCursoDesc}
      setNewCursoDuracaoMeses={setNewCursoDuracaoMeses}
      setNewCursoImagemUrl={setNewCursoImagemUrl}
      setNewCursoNome={setNewCursoNome}
      setNewCursoPublicarSite={setNewCursoPublicarSite}
      setNewCursoVersao={setNewCursoVersao}
      showDuplicateModal={showDuplicateModal}
      setShowDuplicateModal={setShowDuplicateModal}
      duplicateNome={duplicateNome}
      setDuplicateNome={setDuplicateNome}
      duplicateVersao={duplicateVersao}
      setDuplicateVersao={setDuplicateVersao}
      isDuplicating={isDuplicating}
      handleDuplicateCurso={handleDuplicateCurso}
      confirmModal={confirmModal}
      setConfirmModal={setConfirmModal}
      toast={toast}
    />
  );
};

export default CursosLivresPage;
