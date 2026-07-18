import { useState } from 'react';
import type { EadAtividade, EadCronogramaItem, EadConteudoItem, EadProva } from '../../cadastros.types';
import { DEFAULT_EAD_RETRY_HOURS } from './eadCourseWizard.helpers';

export const useEadCourseWizardState = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // --- ETAPA 1: DADOS BÁSICOS ---
  const [nome, setNome] = useState('');
  const [area, setArea] = useState('Outros');
  const [cargaHoraria, setCargaHoraria] = useState('');
  const [valorText, setValorText] = useState('');
  const [financeiroPix, setFinanceiroPix] = useState(true);
  const [financeiroBoleto, setFinanceiroBoleto] = useState(true);
  const [financeiroCartao, setFinanceiroCartao] = useState(true);
  const [financeiroParcelado, setFinanceiroParcelado] = useState(true);
  const [financeiroParcelasPadrao, setFinanceiroParcelasPadrao] = useState('1');
  const [financeiroMaxParcelas, setFinanceiroMaxParcelas] = useState('2');
  const [financeiroTaxaPagaPor, setFinanceiroTaxaPagaPor] = useState<'aluno' | 'instituicao'>('aluno');
  const [financeiroRepassarCustoParcelamento, setFinanceiroRepassarCustoParcelamento] = useState(false);
  const [financeiroConsiderarTaxaNoCheckout, setFinanceiroConsiderarTaxaNoCheckout] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [imagemUrl, setImagemUrl] = useState('');
  const [versao, setVersao] = useState('1.0');
  const [publicarSite, setPublicarSite] = useState(false);
  const [isUploadingCapa, setIsUploadingCapa] = useState(false);
  const [subtituloPagina, setSubtituloPagina] = useState('');
  const [objetivosPagina, setObjetivosPagina] = useState('');
  const [publicoAlvo, setPublicoAlvo] = useState('');
  const [requisitos, setRequisitos] = useState('');
  const [metodologia, setMetodologia] = useState('');
  const [tempoMinimoMinutos, setTempoMinimoMinutos] = useState('60');
  const [intervaloReprovacaoHoras, setIntervaloReprovacaoHoras] = useState(DEFAULT_EAD_RETRY_HOURS.toString());
  const [liberarSequencialmente, setLiberarSequencialmente] = useState(true);
  const [exigirAtividades, setExigirAtividades] = useState(true);
  const [exigirVideosConcluidos, setExigirVideosConcluidos] = useState(true);
  const [videoPrincipalUrl, setVideoPrincipalUrl] = useState('');

  // --- ETAPA 2: CRONOGRAMA ---
  const [cronograma, setCronograma] = useState<EadCronogramaItem[]>([]);
  const [newCronogramaTitle, setNewCronogramaTitle] = useState('');
  const [newCronogramaHours, setNewCronogramaHours] = useState('');

  // --- ETAPA 3: CONTEÚDO (APOSTILA / VÍDEOS) ---
  const [conteudos, setConteudos] = useState<EadConteudoItem[]>([]);
  const [newContTitle, setNewContTitle] = useState('');
  const [newContDesc, setNewContDesc] = useState('');
  const [newContApostila, setNewContApostila] = useState('');
  const [newContTexto, setNewContTexto] = useState('');
  const [newContDuracao, setNewContDuracao] = useState('15');
  const [newContObjetivos, setNewContObjetivos] = useState('');
  const [newContTipo, setNewContTipo] = useState<'video' | 'material' | 'ambos' | 'pagina'>('pagina');
  const [editingConteudoId, setEditingConteudoId] = useState<string | null>(null);

  // --- ATIVIDADES ---
  const [atividades, setAtividades] = useState<EadAtividade[]>([]);
  const [newAtividadeTitulo, setNewAtividadeTitulo] = useState('');
  const [newAtividadeEnunciado, setNewAtividadeEnunciado] = useState('');
  const [newAtividadeEtapaId, setNewAtividadeEtapaId] = useState('');
  const [newAtividadeTipo, setNewAtividadeTipo] = useState<'reflexao' | 'multipla_escolha'>('reflexao');
  const [newAtividadeOpcoes, setNewAtividadeOpcoes] = useState('');
  const [newAtividadeCorreta, setNewAtividadeCorreta] = useState('0');

  // --- ETAPA 4: PROVAS / ATIVIDADES ---
  const [provas, setProvas] = useState<EadProva[]>([]);
  const [selectedProvaIdx, setSelectedProvaIdx] = useState<number>(0);
  const [newProvaTitle, setNewProvaTitle] = useState('');
  const [newProvaMinScore, setNewProvaMinScore] = useState('70');

  // Criação de questões para a prova selecionada
  const [newQuestaoPergunta, setNewQuestaoPergunta] = useState('');
  const [newQuestaoOpcao0, setNewQuestaoOpcao0] = useState('');
  const [newQuestaoOpcao1, setNewQuestaoOpcao1] = useState('');
  const [newQuestaoOpcao2, setNewQuestaoOpcao2] = useState('');
  const [newQuestaoOpcao3, setNewQuestaoOpcao3] = useState('');
  const [newQuestaoCorreta, setNewQuestaoCorreta] = useState<number>(0);

  // --- ETAPA 5: CERTIFICAÇÃO ---
  const [emitirAutomatico, setEmitirAutomatico] = useState(true);
  const [minimoAproveitamento, setMinimoAproveitamento] = useState('70');
  const [assinaturaUrl, setAssinaturaUrl] = useState('');
  const [modeloCertificadoEad, setModeloCertificadoEad] = useState<any>(null);
  const [isLoadingModeloCertificado, setIsLoadingModeloCertificado] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  return {
    currentStep,
    setCurrentStep,
    isSaving,
    setIsSaving,
    nome,
    setNome,
    area,
    setArea,
    cargaHoraria,
    setCargaHoraria,
    valorText,
    setValorText,
    financeiroPix,
    setFinanceiroPix,
    financeiroBoleto,
    setFinanceiroBoleto,
    financeiroCartao,
    setFinanceiroCartao,
    financeiroParcelado,
    setFinanceiroParcelado,
    financeiroParcelasPadrao,
    setFinanceiroParcelasPadrao,
    financeiroMaxParcelas,
    setFinanceiroMaxParcelas,
    financeiroTaxaPagaPor,
    setFinanceiroTaxaPagaPor,
    financeiroRepassarCustoParcelamento,
    setFinanceiroRepassarCustoParcelamento,
    financeiroConsiderarTaxaNoCheckout,
    setFinanceiroConsiderarTaxaNoCheckout,
    descricao,
    setDescricao,
    imagemUrl,
    setImagemUrl,
    versao,
    setVersao,
    publicarSite,
    setPublicarSite,
    isUploadingCapa,
    setIsUploadingCapa,
    subtituloPagina,
    setSubtituloPagina,
    objetivosPagina,
    setObjetivosPagina,
    publicoAlvo,
    setPublicoAlvo,
    requisitos,
    setRequisitos,
    metodologia,
    setMetodologia,
    tempoMinimoMinutos,
    setTempoMinimoMinutos,
    intervaloReprovacaoHoras,
    setIntervaloReprovacaoHoras,
    liberarSequencialmente,
    setLiberarSequencialmente,
    exigirAtividades,
    setExigirAtividades,
    exigirVideosConcluidos,
    setExigirVideosConcluidos,
    videoPrincipalUrl,
    setVideoPrincipalUrl,
    cronograma,
    setCronograma,
    newCronogramaTitle,
    setNewCronogramaTitle,
    newCronogramaHours,
    setNewCronogramaHours,
    conteudos,
    setConteudos,
    newContTitle,
    setNewContTitle,
    newContDesc,
    setNewContDesc,
    newContApostila,
    setNewContApostila,
    newContTexto,
    setNewContTexto,
    newContDuracao,
    setNewContDuracao,
    newContObjetivos,
    setNewContObjetivos,
    newContTipo,
    setNewContTipo,
    editingConteudoId,
    setEditingConteudoId,
    atividades,
    setAtividades,
    newAtividadeTitulo,
    setNewAtividadeTitulo,
    newAtividadeEnunciado,
    setNewAtividadeEnunciado,
    newAtividadeEtapaId,
    setNewAtividadeEtapaId,
    newAtividadeTipo,
    setNewAtividadeTipo,
    newAtividadeOpcoes,
    setNewAtividadeOpcoes,
    newAtividadeCorreta,
    setNewAtividadeCorreta,
    provas,
    setProvas,
    selectedProvaIdx,
    setSelectedProvaIdx,
    newProvaTitle,
    setNewProvaTitle,
    newProvaMinScore,
    setNewProvaMinScore,
    newQuestaoPergunta,
    setNewQuestaoPergunta,
    newQuestaoOpcao0,
    setNewQuestaoOpcao0,
    newQuestaoOpcao1,
    setNewQuestaoOpcao1,
    newQuestaoOpcao2,
    setNewQuestaoOpcao2,
    newQuestaoOpcao3,
    setNewQuestaoOpcao3,
    newQuestaoCorreta,
    setNewQuestaoCorreta,
    emitirAutomatico,
    setEmitirAutomatico,
    minimoAproveitamento,
    setMinimoAproveitamento,
    assinaturaUrl,
    setAssinaturaUrl,
    modeloCertificadoEad,
    setModeloCertificadoEad,
    isLoadingModeloCertificado,
    setIsLoadingModeloCertificado,
    toast,
    setToast,
    confirmModal,
    setConfirmModal,
    showToast,
  };
};

export type EadCourseWizardState = ReturnType<typeof useEadCourseWizardState>;
