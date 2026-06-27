// File: modules/gestor/cadastros/cursos-ead/components/EadCourseWizard.tsx

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Clock, Save, Plus, Trash2, Loader2, Play, FileUp, Pencil, X, 
  HelpCircle, Award, Sparkles, MonitorPlay, ChevronRight, ChevronLeft, 
  BookOpen, CheckCircle2, Image as ImageIcon, FileText, Lock, ListChecks, CreditCard, Link2, AlertTriangle
} from 'lucide-react';
import { supabase } from '../../../../../lib/supabase';
import { Curso, EadAtividade, EadConfig, EadCronogramaItem, EadConteudoItem, EadProva, EadQuestao } from '../../cadastros.types';
import { cadastrosService, normalizeCursoFinanceiroConfig } from '../../cadastros.service';
import { diplomaService } from '../../modelos-documentos/diploma/diploma.service';
import DiplomaPreview from '../../modelos-documentos/diploma/components/DiplomaPreview';

interface EadCourseWizardProps {
  curso?: Curso | null;
  onBack: () => void;
  onSave: () => void;
}

import {
  DEFAULT_EAD_RETRY_HOURS,
  EAD_IMAGE_BUCKET,
  MIN_EAD_PROVA_QUESTOES,
  STORAGE_BASE_PATH,
  agenteComunitarioTemplate,
  compressImageToWebp,
  getStoragePathFromPublicUrl,
  parseBRLPrice,
  removeOldStorageImage
} from './eadCourseWizard.helpers';

const EadCourseWizard: React.FC<EadCourseWizardProps> = ({ curso, onBack, onSave }) => {
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

  // --- ETAPA 2: CRONOGRAMA ---
  const [cronograma, setCronograma] = useState<EadCronogramaItem[]>([]);
  const [newCronogramaTitle, setNewCronogramaTitle] = useState('');
  const [newCronogramaHours, setNewCronogramaHours] = useState('');

  // --- ETAPA 3: CONTEÚDO (APOSTILA / VÍDEOS) ---
  const [conteudos, setConteudos] = useState<EadConteudoItem[]>([]);
  const [newContTitle, setNewContTitle] = useState('');
  const [newContDesc, setNewContDesc] = useState('');
  const [newContVideo, setNewContVideo] = useState('');
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
  const [textoCustomizado, setTextoCustomizado] = useState(
    'Confere-se o presente certificado por concluir com êxito o curso livre na modalidade de Educação a Distância (EAD).'
  );
  const [isUploadingAssinatura, setIsUploadingAssinatura] = useState(false);
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

  // Carrega dados se for modo edição
  useEffect(() => {
    if (curso) {
      setNome(curso.nome || '');
      setArea(curso.area || 'Outros');
      setCargaHoraria(curso.carga_horaria?.toString() || '');
      setValorText(curso.valor !== null && curso.valor !== undefined ? curso.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
      setDescricao(curso.descricao || '');
      setImagemUrl(curso.imagem_url || '');
      setVersao(curso.versao || '1.0');
      setPublicarSite(curso.publicar_site || false);

      const financeiroConfig = normalizeCursoFinanceiroConfig(curso.financeiro_config || undefined);
      setFinanceiroPix(financeiroConfig.metodosRecebimento.pix);
      setFinanceiroBoleto(financeiroConfig.metodosRecebimento.boleto);
      setFinanceiroCartao(financeiroConfig.metodosRecebimento.cartao);
      setFinanceiroParcelado(financeiroConfig.cartao.aceitar);
      setFinanceiroParcelasPadrao(financeiroConfig.parcelasPadrao.toString());
      setFinanceiroMaxParcelas(financeiroConfig.cartao.maxParcelas.toString());
      setFinanceiroTaxaPagaPor(financeiroConfig.taxaPagaPor);

      const config: EadConfig = curso.ead_config || {
        cronograma: [],
        conteudos: [],
        atividades: [],
        provas: [],
        certificacao: { emitirAutomatico: true, minimoAproveitamento: 70 },
        regras: { tempoMinimoMinutos: 60, liberarSequencialmente: true, exigirAtividades: true, exigirVideosConcluidos: true, intervaloReprovacaoHoras: DEFAULT_EAD_RETRY_HOURS }
      };

      setSubtituloPagina(config.pagina?.subtitulo || '');
      setObjetivosPagina((config.pagina?.objetivos || []).join('\n'));
      setPublicoAlvo(config.pagina?.publicoAlvo || '');
      setRequisitos(config.pagina?.requisitos || '');
      setMetodologia(config.pagina?.metodologia || '');
      setTempoMinimoMinutos((config.regras?.tempoMinimoMinutos ?? 60).toString());
      setIntervaloReprovacaoHoras((config.regras?.intervaloReprovacaoHoras ?? DEFAULT_EAD_RETRY_HOURS).toString());
      setLiberarSequencialmente(config.regras?.liberarSequencialmente ?? true);
      setExigirAtividades(config.regras?.exigirAtividades ?? true);
      setExigirVideosConcluidos(config.regras?.exigirVideosConcluidos ?? true);
      setCronograma(config.cronograma || []);
      setConteudos(config.conteudos || []);
      setAtividades(config.atividades || []);
      setProvas(config.provas || []);
      
      if (config.certificacao) {
        setEmitirAutomatico(config.certificacao.emitirAutomatico ?? (config.certificacao as any).emitirAutomaticamente ?? true);
        setMinimoAproveitamento((config.certificacao.minimoAproveitamento ?? (config.certificacao as any).notaMinima ?? 70).toString());
        setAssinaturaUrl(config.certificacao.assinaturaUrl || '');
        setTextoCustomizado(config.certificacao.textoCustomizado || '');
      }
    }
  }, [curso]);

  useEffect(() => {
    const loadModeloCertificado = async () => {
      setIsLoadingModeloCertificado(true);
      try {
        const modelos = await diplomaService.getTemplates();
        const modelo = modelos.find(item => item.id === 'certificado_ead');
        setModeloCertificadoEad(modelo || null);
      } catch (err) {
        console.error('Erro ao carregar modelo de certificado EAD:', err);
        setModeloCertificadoEad(null);
      } finally {
        setIsLoadingModeloCertificado(false);
      }
    };
    void loadModeloCertificado();
  }, []);

  const gradeCurricularPreview = cronograma.length
    ? cronograma
        .map((item) => `${item.titulo || 'Módulo do curso'} - ${item.cargaHoraria || 0}h - Aprovado`)
        .join('\n')
    : 'Módulo introdutório - 20h - Aprovado\nMódulo profissionalizante - 40h - Aprovado\nAvaliação final - 10h - Aprovado';

  const previewTemplateValues = {
    nome_aluno: 'Aluno Teste',
    cpf: '000.000.000-00',
    curso_nome: nome || '[Nome do Curso EAD]',
    carga_horaria: cargaHoraria || '0',
    data_inicio: '04/12/2025',
    data_fim: '30/12/2025',
    periodo: '04/12/2025 até 30/12/2025',
    data_conclusao: new Date().toLocaleDateString('pt-BR'),
    cidade: 'Cidade Exemplo',
    uf: 'UF',
    cidade_uf: 'Cidade Exemplo/UF',
    grade_curricular: gradeCurricularPreview,
    certificado_numero: '00001',
    codigo_certificado: 'CERT-EAD-2B4F-D710-0F26',
    codigo_validacao: 'CERT-EAD-2B4F-D710-0F26',
    pagina_livro: '—',
    livro: '—',
    livro_registro: '—',
    validacao_sistec: '—',
    ensino_medio_estabelecimento: '—',
    ensino_medio_localidade_uf: '—',
    ensino_medio_ano_conclusao: '—',
    url_validacao: 'https://universo.com/validacao',
  };
  const certificatePreviewZoom = 34;
  const certificatePreviewFrameStyle = {
    width: `${297 * (certificatePreviewZoom / 100)}mm`,
    height: `${210 * (certificatePreviewZoom / 100)}mm`,
  };

  // --- MÉTODOS DE CONTROLE ---

  // Upload genérico para o Bucket 'documentos'
  const handleUploadImage = async (file: File, type: 'capa' | 'assinatura') => {
    if (type === 'capa') setIsUploadingCapa(true);
    else setIsUploadingAssinatura(true);

    try {
      const previousUrl = type === 'capa' ? imagemUrl : assinaturaUrl;
      const compressedFile = await compressImageToWebp(file);
      const filePath = `${STORAGE_BASE_PATH}/${type}_${Date.now()}.webp`;

      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, compressedFile, {
          cacheControl: '31536000',
          upsert: true,
          contentType: 'image/webp'
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(data.path);

      if (type === 'capa') {
        setImagemUrl(urlData.publicUrl);
      } else {
        setAssinaturaUrl(urlData.publicUrl);
      }

      if (previousUrl) {
        await removeOldStorageImage(previousUrl);
      }
    } catch (err: any) {
      showToast('Erro ao fazer upload da imagem: ' + err.message, 'error');
    } finally {
      if (type === 'capa') setIsUploadingCapa(false);
      else setIsUploadingAssinatura(false);
    }
  };

  const handleRemoveImageConfirmed = async (type: 'capa' | 'assinatura') => {
    const currentUrl = type === 'capa' ? imagemUrl : assinaturaUrl;
    if (!currentUrl) return;

    try {
      await removeOldStorageImage(currentUrl);

      if (type === 'capa') {
        setImagemUrl('');
      } else {
        setAssinaturaUrl('');
      }

      showToast('Imagem removida com sucesso.', 'success');
    } catch (err: any) {
      showToast('Erro ao remover imagem: ' + err.message, 'error');
    }
  };

  const handleRemoveImage = async (type: 'capa' | 'assinatura') => {
    const currentUrl = type === 'capa' ? imagemUrl : assinaturaUrl;
    if (!currentUrl) return;

    const label = type === 'capa' ? 'capa do curso' : 'assinatura do certificado';
    setConfirmModal({
      isOpen: true,
      title: 'Remover imagem',
      message: `Tem certeza de que deseja remover a ${label}?`,
      onConfirm: () => void handleRemoveImageConfirmed(type)
    });
  };

  const applyAgenteTemplate = () => {
    setNome(prev => prev || 'Agente Comunitário de Saúde');
    setArea('Saúde');
    setCargaHoraria(prev => prev || '180');
    setDescricao(prev => prev || 'Curso EAD para formação introdutória em atuação comunitária, Atenção Básica, SUS, visitas domiciliares, promoção da saúde e prevenção de doenças.');
    setSubtituloPagina(agenteComunitarioTemplate.pagina?.subtitulo || '');
    setObjetivosPagina((agenteComunitarioTemplate.pagina?.objetivos || []).join('\n'));
    setPublicoAlvo(agenteComunitarioTemplate.pagina?.publicoAlvo || '');
    setRequisitos(agenteComunitarioTemplate.pagina?.requisitos || '');
    setMetodologia(agenteComunitarioTemplate.pagina?.metodologia || '');
    setTempoMinimoMinutos((agenteComunitarioTemplate.regras?.tempoMinimoMinutos || 60).toString());
    setIntervaloReprovacaoHoras((agenteComunitarioTemplate.regras?.intervaloReprovacaoHoras || DEFAULT_EAD_RETRY_HOURS).toString());
    setLiberarSequencialmente(true);
    setExigirAtividades(true);
    setExigirVideosConcluidos(true);
    setCronograma(agenteComunitarioTemplate.cronograma);
    setConteudos(agenteComunitarioTemplate.conteudos);
    setAtividades(agenteComunitarioTemplate.atividades || []);
    setProvas(agenteComunitarioTemplate.provas);
    showToast('Modelo de Agente Comunitário aplicado.', 'success');
  };

  const handleApplyAgenteTemplate = () => {
    if (conteudos.length > 0 || provas.length > 0 || cronograma.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: 'Aplicar modelo',
        message: 'Aplicar o modelo de Agente Comunitário de Saúde vai substituir cronograma, etapas, atividades e prova atuais. Deseja continuar?',
        onConfirm: applyAgenteTemplate
      });
      return;
    }

    applyAgenteTemplate();
  };

  // Cronograma
  const handleAddCronograma = () => {
    if (!newCronogramaTitle.trim() || !newCronogramaHours.trim()) return;
    const item: EadCronogramaItem = {
      id: `cron-${Math.random().toString(36).substr(2, 9)}`,
      titulo: newCronogramaTitle.trim(),
      cargaHoraria: parseInt(newCronogramaHours) || 0
    };
    setCronograma(prev => [...prev, item]);
    setNewCronogramaTitle('');
    setNewCronogramaHours('');
  };

  const handleRemoveCronograma = (id: string) => {
    setCronograma(prev => prev.filter(item => item.id !== id));
  };

  // Conteúdo
  const resetConteudoForm = () => {
    setNewContTitle('');
    setNewContDesc('');
    setNewContVideo('');
    setNewContApostila('');
    setNewContTexto('');
    setNewContDuracao('15');
    setNewContObjetivos('');
    setNewContTipo('pagina');
    setEditingConteudoId(null);
  };

  const handleAddConteudo = () => {
    if (!newContTitle.trim()) return;

    const payload = {
      titulo: newContTitle.trim(),
      descricao: newContDesc.trim() || undefined,
      videoUrl: newContVideo.trim() || undefined,
      apostilaUrl: newContApostila.trim() || undefined,
      textoHtml: newContTexto.trim() || undefined,
      duracaoMinutos: parseInt(newContDuracao) || 15,
      objetivos: newContObjetivos
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean),
      tipo: newContTipo
    };

    if (editingConteudoId) {
      setConteudos(prev => prev.map(item =>
        item.id === editingConteudoId ? { ...item, ...payload } : item
      ));
      showToast('Etapa atualizada com sucesso.', 'success');
      resetConteudoForm();
      return;
    }

    const item: EadConteudoItem = {
      id: `cont-${Math.random().toString(36).substr(2, 9)}`,
      ...payload,
      etapa: conteudos.length + 1,
    };
    setConteudos(prev => [...prev, item]);
    resetConteudoForm();
  };

  const handleEditConteudo = (item: EadConteudoItem) => {
    setEditingConteudoId(item.id);
    setNewContTitle(item.titulo || '');
    setNewContDesc(item.descricao || '');
    setNewContVideo(item.videoUrl || '');
    setNewContApostila(item.apostilaUrl || '');
    setNewContTexto(item.textoHtml || '');
    setNewContDuracao((item.duracaoMinutos || parseInt(String((item as any).duracao || ''), 10) || 15).toString());
    setNewContObjetivos((item.objetivos || []).join('\n'));
    setNewContTipo(item.tipo || 'pagina');
  };

  const handleRemoveConteudo = (id: string) => {
    setConteudos(prev => prev.filter(item => item.id !== id));
    setAtividades(prev => prev.filter(item => item.etapaId !== id));
    if (editingConteudoId === id) resetConteudoForm();
  };

  const handleAddAtividade = () => {
    if (!newAtividadeTitulo.trim() || !newAtividadeEnunciado.trim()) return;

    const opcoes = newAtividadeOpcoes
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);

    const item: EadAtividade = {
      id: `atv-${Math.random().toString(36).substr(2, 9)}`,
      etapaId: newAtividadeEtapaId || undefined,
      titulo: newAtividadeTitulo.trim(),
      enunciado: newAtividadeEnunciado.trim(),
      tipo: newAtividadeTipo,
      opcoes: newAtividadeTipo === 'multipla_escolha' ? opcoes : undefined,
      respostaCorreta: newAtividadeTipo === 'multipla_escolha' ? parseInt(newAtividadeCorreta) || 0 : undefined
    };

    setAtividades(prev => [...prev, item]);
    setNewAtividadeTitulo('');
    setNewAtividadeEnunciado('');
    setNewAtividadeEtapaId('');
    setNewAtividadeTipo('reflexao');
    setNewAtividadeOpcoes('');
    setNewAtividadeCorreta('0');
  };

  const handleRemoveAtividade = (id: string) => {
    setAtividades(prev => prev.filter(item => item.id !== id));
  };

  // Provas
  const handleAddProva = () => {
    if (!newProvaTitle.trim()) return;
    const item: EadProva = {
      id: `prova-${Math.random().toString(36).substr(2, 9)}`,
      titulo: newProvaTitle.trim(),
      notaMinima: parseInt(newProvaMinScore) || 70,
      questoes: []
    };
    setProvas(prev => [...prev, item]);
    setSelectedProvaIdx(provas.length);
    setNewProvaTitle('');
  };

  const handleAddQuestao = (provaIdx: number) => {
    if (!newQuestaoPergunta.trim() || !newQuestaoOpcao0.trim() || !newQuestaoOpcao1.trim()) {
      showToast('Preencha a pergunta e pelo menos duas opções de resposta.', 'warning');
      return;
    }

    const opcoes = [
      newQuestaoOpcao0.trim(),
      newQuestaoOpcao1.trim(),
      newQuestaoOpcao2.trim(),
      newQuestaoOpcao3.trim()
    ].filter(Boolean);

    const questao: EadQuestao = {
      id: `quest-${Math.random().toString(36).substr(2, 9)}`,
      pergunta: newQuestaoPergunta.trim(),
      opcoes,
      respostaCorreta: newQuestaoCorreta
    };

    setProvas(prev => prev.map((p, idx) => {
      if (idx === provaIdx) {
        return { ...p, questoes: [...p.questoes, questao] };
      }
      return p;
    }));

    // Reseta form de questão
    setNewQuestaoPergunta('');
    setNewQuestaoOpcao0('');
    setNewQuestaoOpcao1('');
    setNewQuestaoOpcao2('');
    setNewQuestaoOpcao3('');
    setNewQuestaoCorreta(0);
    showToast('Questão adicionada com sucesso.', 'success');
  };

  const handleRemoveQuestao = (provaIdx: number, questaoId: string) => {
    setProvas(prev => prev.map((p, idx) => {
      if (idx === provaIdx) {
        return { ...p, questoes: p.questoes.filter(q => q.id !== questaoId) };
      }
      return p;
    }));
  };

  const handleRemoveProva = (idx: number) => {
    setProvas(prev => prev.filter((_, i) => i !== idx));
    setSelectedProvaIdx(Math.max(0, idx - 1));
  };

  // --- PERSISTÊNCIA COMPLETA ---
  const handleFinalSave = async (forcePublishState?: boolean) => {
    if (!nome.trim() || !cargaHoraria.trim()) {
      showToast('Por favor, preencha o nome do curso e a carga horária.', 'warning');
      return;
    }

    const valorParsed = parseBRLPrice(valorText);
    if (!valorParsed || valorParsed <= 0) {
      showToast('Informe o valor do curso EAD. O preço é obrigatório para exibição pública e geração do link de pagamento no Asaas.', 'warning');
      return;
    }

    if (!financeiroPix && !financeiroBoleto && !financeiroCartao) {
      showToast('Selecione pelo menos uma forma de recebimento para o checkout do curso.', 'warning');
      return;
    }

    const parcelasPadraoParsed = Math.max(1, parseInt(financeiroParcelasPadrao) || 1);
    const maxParcelasParsed = financeiroParcelado
      ? Math.max(parcelasPadraoParsed, parseInt(financeiroMaxParcelas) || parcelasPadraoParsed)
      : 1;

    if (provas.length === 0) {
      showToast('Cadastre pelo menos uma prova final para o curso EAD.', 'warning');
      return;
    }

    const provaComPoucasQuestoes = provas.find(prova => (prova.questoes?.length || 0) < MIN_EAD_PROVA_QUESTOES);
    if (provaComPoucasQuestoes) {
      showToast(`A prova "${provaComPoucasQuestoes.titulo}" precisa ter no mínimo ${MIN_EAD_PROVA_QUESTOES} questões antes de salvar/publicar.`, 'warning');
      return;
    }

    setIsSaving(true);

    // Estrutura o objeto JSONB EAD Config
    const eadConfig: EadConfig = {
      pagina: {
        subtitulo: subtituloPagina.trim() || undefined,
        objetivos: objetivosPagina.split('\n').map(item => item.trim()).filter(Boolean),
        publicoAlvo: publicoAlvo.trim() || undefined,
        requisitos: requisitos.trim() || undefined,
        metodologia: metodologia.trim() || undefined
      },
      regras: {
        tempoMinimoMinutos: parseInt(tempoMinimoMinutos) || 0,
        liberarSequencialmente,
        exigirAtividades,
        exigirVideosConcluidos,
        intervaloReprovacaoHoras: parseInt(intervaloReprovacaoHoras) || DEFAULT_EAD_RETRY_HOURS
      },
      cronograma,
      conteudos,
      atividades,
      provas,
      certificacao: {
        emitirAutomatico,
        minimoAproveitamento: parseInt(minimoAproveitamento) || 70,
        modeloDocumento: 'certificado_ead'
      }
    };

    const isPublishing = forcePublishState !== undefined ? forcePublishState : publicarSite;
    const financeiroConfig = normalizeCursoFinanceiroConfig({
      valorBase: valorParsed,
      parcelasPadrao: parcelasPadraoParsed,
      taxaPagaPor: financeiroTaxaPagaPor,
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
        aceitar: financeiroCartao && financeiroParcelado,
        maxParcelas: financeiroCartao ? maxParcelasParsed : 1,
        aplicarDescontoPontualidade: false
      },
      asaas: {
        gerarParcelamentoMensalidades: false,
        tipoCarnePreferencial: 'COBRANCAS_AVULSAS'
      }
    }, 'EAD');

    const cursoPayload: Omit<Curso, 'id'> & { id?: string } = {
      nome: nome.trim(),
      modalidade: 'EAD',
      carga_horaria: parseInt(cargaHoraria) || 0,
      status: 'ativo',
      area,
      descricao: descricao.trim(),
      versao: versao.trim() || '1.0',
      imagem_url: imagemUrl || null,
      duracao_meses: 12, // EAD virtual padrão 12 meses
      publicar_site: isPublishing,
      valor: valorParsed,
      ead_config: eadConfig,
      financeiro_config: financeiroConfig
    };

    try {
      let savedCurso: Curso;

      if (curso?.id) {
        cursoPayload.id = curso.id;
        await cadastrosService.updateCurso({ ...curso, ...cursoPayload } as Curso);
        savedCurso = { ...curso, ...cursoPayload } as Curso;
      } else {
        savedCurso = await cadastrosService.createCurso(cursoPayload);
      }

      // Se publicado, prepara a turma virtual. O checkout Asaas é gerado individualmente por aluno.
      if (isPublishing) {
        await cadastrosService.autoCreateEadTurma(savedCurso);
      }

      showToast('Curso EAD salvo e configurado com sucesso!', 'success');
      onSave();
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao salvar curso EAD: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const steps = [
    { num: 1, name: 'Informações Básicas', icon: <MonitorPlay size={18} /> },
    { num: 2, name: 'Financeiro', icon: <CreditCard size={18} /> },
    { num: 3, name: 'Cronograma', icon: <Clock size={18} /> },
    { num: 4, name: 'Aulas e Conteúdo', icon: <BookOpen size={18} /> },
    { num: 5, name: 'Provas & Atividades', icon: <HelpCircle size={18} /> },
    { num: 6, name: 'Certificado EAD', icon: <Award size={18} /> }
  ];

  return (
    <div className="flex min-w-0 flex-col h-full animate-fadeIn bg-slate-50 min-h-screen overflow-x-hidden">
      {/* Cabeçalho do editor */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white px-4 py-5 sm:px-6 border-b border-slate-200">
        <div className="flex min-w-0 items-center gap-4">
          <button 
            onClick={onBack} 
            className="flex-shrink-0 p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-purple-600 hover:border-purple-200 transition-colors bg-white shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest bg-purple-50 px-2.5 py-1 rounded-md">Ensino a Distância</span>
            <h3 className="truncate text-lg sm:text-xl font-black text-[#001a33] mt-1.5 uppercase tracking-tight">
              {curso ? `Editando: ${nome}` : 'Novo Curso EAD'}
            </h3>
          </div>
        </div>

        <div className="flex w-full sm:w-auto flex-wrap gap-2 xl:flex-shrink-0">
          <button
            onClick={() => handleFinalSave()}
            disabled={isSaving}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-[#001a33] hover:bg-slate-800 text-white px-4 sm:px-5 py-3 rounded-xl font-bold uppercase text-[10px] sm:text-xs tracking-wider transition-colors disabled:opacity-70 shadow-sm whitespace-nowrap"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar Rascunho
          </button>
          <button
            onClick={() => handleFinalSave(true)}
            disabled={isSaving}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 sm:px-5 py-3 rounded-xl font-bold uppercase text-[10px] sm:text-xs tracking-wider transition-all disabled:opacity-70 shadow-lg shadow-purple-600/25 whitespace-nowrap"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            Publicar Curso
          </button>
        </div>
      </div>

      {/* Indicador de Passos */}
      <div className="bg-white border-b border-slate-200 px-3 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-6">
          {steps.map((s, idx) => (
            <button
              key={s.num}
              onClick={() => setCurrentStep(s.num)}
              className="group relative flex min-w-0 flex-col items-center gap-1.5 px-1 focus:outline-none sm:gap-2"
              aria-current={currentStep === s.num ? 'step' : undefined}
              title={s.name}
            >
              {idx > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-0 right-1/2 top-4 h-0.5 ${
                    currentStep >= s.num ? 'bg-purple-400' : 'bg-slate-200'
                  }`}
                />
              )}
              {idx < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 right-0 top-4 h-0.5 ${
                    currentStep > s.num ? 'bg-purple-400' : 'bg-slate-200'
                  }`}
                />
              )}
              <span className={`relative z-10 w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm transition-all border shrink-0 ${
                  currentStep === s.num 
                    ? 'bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-600/20' 
                    : currentStep > s.num
                    ? 'bg-purple-55 text-purple-600 border-purple-200 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600'
                }`}>
                  {s.num}
              </span>
              <span className={`block w-full truncate text-center text-[8px] font-bold uppercase tracking-tight sm:text-[10px] lg:text-xs lg:tracking-wide ${
                  currentStep === s.num ? 'text-purple-650 font-black' : 'text-slate-500 group-hover:text-slate-700'
                }`}>
                  {s.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo da Etapa */}
      <div className="flex-1 min-w-0 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8">
        <div className="bg-white border border-slate-250/60 rounded-[2.5rem] p-6 md:p-8 shadow-sm">
          
          {/* STEP 1: INFORMAÇÕES BÁSICAS */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><MonitorPlay size={20} /></span>
                <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Informações Principais do Curso</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Curso *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Gestão e Planejamento Hospitalar"
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Área de Formação</label>
                  <select
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-bold text-slate-800 transition-all appearance-none cursor-pointer"
                    value={area}
                    onChange={e => setArea(e.target.value)}
                  >
                    <option value="Saúde">Saúde</option>
                    <option value="Tecnologia">Tecnologia</option>
                    <option value="Gestão">Gestão</option>
                    <option value="Educação">Educação</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga Horária (Horas) *</label>
                  <input
                    type="number"
                    required
                    placeholder="Ex: 80"
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all"
                    value={cargaHoraria}
                    onChange={e => setCargaHoraria(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Versão do curso</label>
                  <input
                    type="text"
                    placeholder="Ex: 1.0"
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all"
                    value={versao}
                    onChange={e => setVersao(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo do Curso (Exibido no Catálogo)</label>
                <textarea
                  rows={4}
                  placeholder="Forneça um breve resumo descrevendo os objetivos do curso, público-alvo e diferenciais."
                  className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all resize-none"
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                />
              </div>

              <div className="border border-slate-200 rounded-3xl p-5 bg-slate-50/60 space-y-5">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-purple-600" />
                  <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">Página Própria do Curso</h5>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtítulo Comercial</label>
                  <input
                    type="text"
                    placeholder="Ex: Aprenda com etapas guiadas, atividades e certificado"
                    className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-100 outline-none font-semibold text-slate-800"
                    value={subtituloPagina}
                    onChange={e => setSubtituloPagina(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Objetivos (um por linha)</label>
                    <textarea
                      rows={5}
                      placeholder="Compreender...\nAplicar...\nIdentificar..."
                      className="w-full px-4 py-3 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-100 outline-none font-semibold text-slate-800 resize-none"
                      value={objetivosPagina}
                      onChange={e => setObjetivosPagina(e.target.value)}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Público-alvo</label>
                      <textarea
                        rows={2}
                        className="w-full px-4 py-3 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-100 outline-none font-semibold text-slate-800 resize-none"
                        value={publicoAlvo}
                        onChange={e => setPublicoAlvo(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Requisitos</label>
                      <textarea
                        rows={2}
                        className="w-full px-4 py-3 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-100 outline-none font-semibold text-slate-800 resize-none"
                        value={requisitos}
                        onChange={e => setRequisitos(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Metodologia</label>
                  <textarea
                    rows={3}
                    placeholder="Como o aluno vai estudar, avançar, fazer atividades e liberar a prova."
                    className="w-full px-4 py-3 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-100 outline-none font-semibold text-slate-800 resize-none"
                    value={metodologia}
                    onChange={e => setMetodologia(e.target.value)}
                  />
                </div>
              </div>

              <div className="border border-amber-200 rounded-3xl p-5 bg-amber-50/50 space-y-4">
                <div className="flex items-center gap-2">
                  <Lock size={18} className="text-amber-700" />
                  <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">Regras para Forçar Aprendizagem</h5>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-amber-700 uppercase tracking-widest">Tempo mínimo na plataforma</label>
                    <input
                      type="number"
                      className="w-full px-4 py-3 text-sm bg-white border border-amber-200 rounded-xl outline-none font-black text-slate-800"
                      value={tempoMinimoMinutos}
                      onChange={e => setTempoMinimoMinutos(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-amber-700 uppercase tracking-widest">Retentativa após reprovar</label>
                    <input
                      type="number"
                      min={1}
                      className="w-full px-4 py-3 text-sm bg-white border border-amber-200 rounded-xl outline-none font-black text-slate-800"
                      value={intervaloReprovacaoHoras}
                      onChange={e => setIntervaloReprovacaoHoras(e.target.value)}
                    />
                    <p className="text-[9px] font-bold text-amber-700">Em horas. Padrão: 3h.</p>
                  </div>
                  {[
                    ['Sequencial', liberarSequencialmente, setLiberarSequencialmente],
                    ['Atividades obrigatórias', exigirAtividades, setExigirAtividades],
                    ['Vídeos concluídos', exigirVideosConcluidos, setExigirVideosConcluidos]
                  ].map(([label, checked, setter]) => (
                    <button
                      key={label as string}
                      type="button"
                      onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)(!(checked as boolean))}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-xs font-black uppercase tracking-wide transition-all ${
                        checked ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-white/70 border-slate-200 text-slate-400'
                      }`}
                    >
                      <span>{label as string}</span>
                      <CheckCircle2 size={16} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload de Capa */}
              <div className="space-y-2.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Imagem de Capa do Curso</label>
                <div className="border-2 border-dashed border-slate-200 rounded-3xl p-6 text-center bg-slate-50/50 flex flex-col items-center justify-center gap-4 relative overflow-hidden group hover:bg-slate-50 transition-colors">
                  {imagemUrl ? (
                    <>
                      <img 
                        src={imagemUrl} 
                        alt="Capa do Curso EAD" 
                        className="max-h-48 rounded-2xl object-cover border border-slate-200 shadow-sm animate-fadeIn"
                      />
                      <div className="flex gap-2">
                        <label className="px-4 py-2 bg-[#001a33] hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all">
                          {isUploadingCapa ? 'Enviando...' : 'Alterar Imagem'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0], 'capa')}
                            disabled={isUploadingCapa}
                            className="hidden"
                          />
                        </label>
                        <button 
                          onClick={() => void handleRemoveImage('capa')}
                          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-red-200"
                        >
                          Remover
                        </button>
                      </div>
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
                      <label className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md shadow-purple-600/15">
                        {isUploadingCapa ? 'Enviando...' : 'Carregar Foto'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0], 'capa')}
                          disabled={isUploadingCapa}
                          className="hidden"
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: FINANCEIRO */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl"><CreditCard size={20} /></span>
                <div>
                  <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Financeiro e Checkout Asaas</h4>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">Defina valor, formas de recebimento, parcelamento e regra da taxa antes de publicar o curso.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor do curso *</label>
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100 focus-within:border-emerald-500 transition-all">
                    <span className="text-slate-400 font-bold text-sm">R$</span>
                    <input
                      type="text"
                      placeholder="Ex: 299,90"
                      className="w-full bg-transparent border-none outline-none text-sm font-semibold text-slate-800 placeholder-slate-400"
                      value={valorText}
                      onChange={e => setValorText(e.target.value)}
                      onBlur={() => {
                        const parsed = parseBRLPrice(valorText);
                        setValorText(parsed !== null && !isNaN(parsed) ? parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsável pela taxa Asaas</label>
                  <select
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all"
                    value={financeiroTaxaPagaPor}
                    onChange={e => setFinanceiroTaxaPagaPor(e.target.value as 'aluno' | 'instituicao')}
                  >
                    <option value="aluno">Aluno (registro interno)</option>
                    <option value="instituicao">Instituição absorve a taxa</option>
                  </select>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                <h5 className="mb-4 text-sm font-black uppercase tracking-tight text-[#001a33]">Formas de recebimento no checkout</h5>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {[
                    ['Pix', financeiroPix, setFinanceiroPix],
                    ['Boleto', financeiroBoleto, setFinanceiroBoleto],
                    ['Cartão', financeiroCartao, setFinanceiroCartao]
                  ].map(([label, checked, setter]) => (
                    <button
                      key={label as string}
                      type="button"
                      onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)(!(checked as boolean))}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left text-xs font-black uppercase tracking-wide transition-all ${
                        checked ? 'border-emerald-200 bg-white text-emerald-700 shadow-sm' : 'border-slate-200 bg-white/70 text-slate-400'
                      }`}
                    >
                      <span>{label as string}</span>
                      <CheckCircle2 size={16} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <button
                  type="button"
                  disabled={!financeiroCartao}
                  onClick={() => setFinanceiroParcelado(!financeiroParcelado)}
                  className={`rounded-2xl border p-4 text-left transition-all disabled:opacity-50 ${
                    financeiroParcelado && financeiroCartao ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  <span className="block text-[10px] font-black uppercase tracking-widest">Parcelamento</span>
                  <span className="mt-2 block text-sm font-black">{financeiroParcelado && financeiroCartao ? 'Ativo' : 'Desativado'}</span>
                </button>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Parcelas padrão</label>
                  <input
                    type="number"
                    min={1}
                    disabled={!financeiroCartao}
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 disabled:opacity-50"
                    value={financeiroParcelasPadrao}
                    onChange={e => setFinanceiroParcelasPadrao(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Máximo de parcelas</label>
                  <input
                    type="number"
                    min={1}
                    disabled={!financeiroCartao || !financeiroParcelado}
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 disabled:opacity-50"
                    value={financeiroMaxParcelas}
                    onChange={e => setFinanceiroMaxParcelas(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <Link2 size={18} className="mt-0.5 text-emerald-700" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Checkout individual do aluno</p>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-800">
                      Ao publicar, o sistema cria a turma única EAD. Na compra, o checkout Asaas é gerado para cada aluno usando estas regras financeiras e vinculado à matrícula.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CRONOGRAMA */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><Clock size={20} /></span>
                <div>
                  <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Cronograma de Matérias (Certificado)</h4>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">Cadastre o cronograma detalhado de disciplinas/módulos para constar no verso do certificado impresso.</p>
                </div>
              </div>

              {/* Form Cadastro */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-end">
                <div className="flex-1 space-y-1.5 w-full">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome do Módulo/Matéria *</label>
                  <input
                    type="text"
                    placeholder="Ex: Introdução ao Planejamento de Saúde"
                    className="w-full px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-slate-800"
                    value={newCronogramaTitle}
                    onChange={e => setNewCronogramaTitle(e.target.value)}
                  />
                </div>
                <div className="w-full md:w-32 space-y-1.5">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Carga Horária *</label>
                  <input
                    type="number"
                    placeholder="Ex: 20"
                    className="w-full px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-center text-slate-800"
                    value={newCronogramaHours}
                    onChange={e => setNewCronogramaHours(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddCronograma()}
                  />
                </div>
                <button
                  onClick={handleAddCronograma}
                  className="px-5 py-2.5 bg-[#001a33] hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider h-fit shrink-0 w-full md:w-auto"
                >
                  Adicionar
                </button>
              </div>

              {/* Tabela de Matérias */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estrutura de Matérias Cadastradas ({cronograma.length})</h5>
                {cronograma.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-slate-250 rounded-2xl bg-slate-50/50">
                    <Clock className="text-slate-300 mx-auto mb-2" size={32} />
                    <p className="text-slate-400 text-xs font-bold uppercase">Nenhuma matéria adicionada ao cronograma.</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                    {cronograma.map((item, idx) => (
                      <div key={item.id} className="flex justify-between items-center p-4 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-black text-xs">{idx + 1}</span>
                          <span className="font-bold text-xs text-[#001a33]">{item.titulo}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="bg-slate-100 px-3 py-1 rounded-md text-[10px] font-bold text-slate-600">{item.cargaHoraria}h</span>
                          <button
                            onClick={() => handleRemoveCronograma(item.id)}
                            className="text-slate-350 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="p-4 bg-slate-50 flex justify-between items-center text-xs font-black text-slate-700">
                      <span>Carga Horária Total Cadastrada:</span>
                      <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-md">{cronograma.reduce((acc, c) => acc + c.cargaHoraria, 0)}h</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: AULAS E CONTEÚDO */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><BookOpen size={20} /></span>
                <div>
                  <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Aulas, páginas e videoaulas</h4>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">Cadastre o conteúdo nativo que o aluno vai ler no portal, com vídeo opcional acima do texto quando houver.</p>
                </div>
              </div>

              {/* Form Cadastro */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                {editingConteudoId && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Editando aula cadastrada</p>
                      <p className="text-xs font-semibold text-slate-600">Altere o texto, vídeo, objetivos ou duração e salve a etapa.</p>
                    </div>
                    <button
                      onClick={resetConteudoForm}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-150 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-50"
                    >
                      <X size={13} /> Cancelar edição
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Título da Etapa/Aula *</label>
                    <input
                      type="text"
                      placeholder="Ex: Introdução ao Módulo de Faturamento"
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-xs"
                      value={newContTitle}
                      onChange={e => setNewContTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Tipo de Conteúdo</label>
                    <select
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-xs appearance-none cursor-pointer"
                      value={newContTipo}
                      onChange={e => setNewContTipo(e.target.value as any)}
                    >
                      <option value="pagina">Aula do Sistema + Vídeo Opcional</option>
                      <option value="ambos">Vídeo + Material de Apoio</option>
                      <option value="video">Apenas Vídeo (YouTube/Vimeo)</option>
                      <option value="material">Apenas Material de Apoio</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Descrição (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Breve comentário explicativo..."
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-medium text-xs"
                    value={newContDesc}
                    onChange={e => setNewContDesc(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Duração mínima desta etapa (min)</label>
                    <input
                      type="number"
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-xs"
                      value={newContDuracao}
                      onChange={e => setNewContDuracao(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Objetivos da etapa (um por linha)</label>
                    <textarea
                      rows={3}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-medium text-xs resize-none"
                      value={newContObjetivos}
                      onChange={e => setNewContObjetivos(e.target.value)}
                    />
                  </div>
                </div>

                {(newContTipo === 'pagina' || newContTipo === 'ambos' || newContTipo === 'material') && (
                  <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Texto da página do curso</label>
                    <textarea
                      rows={9}
                      placeholder="Escreva ou cole aqui o texto da aula. O aluno verá este conteúdo como uma página do próprio sistema."
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-medium text-xs leading-relaxed resize-y"
                      value={newContTexto}
                      onChange={e => setNewContTexto(e.target.value)}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(newContTipo === 'video' || newContTipo === 'ambos' || newContTipo === 'pagina') && (
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">URL da Videoaula (YouTube ou Vimeo)</label>
                      <input
                        type="url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-semibold text-xs text-blue-650"
                        value={newContVideo}
                        onChange={e => setNewContVideo(e.target.value)}
                      />
                    </div>
                  )}

                  {(newContTipo === 'material' || newContTipo === 'ambos') && (
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">URL ou Link da Apostila (PDF)</label>
                      <input
                        type="url"
                        placeholder="https://suaconta.storage.com/apostila.pdf"
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-semibold text-xs"
                        value={newContApostila}
                        onChange={e => setNewContApostila(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleAddConteudo}
                    className="px-6 py-2.5 bg-[#001a33] hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                  >
                    {editingConteudoId ? <Save size={14} /> : <Plus size={14} />}
                    {editingConteudoId ? 'Salvar Alterações' : 'Adicionar Etapa'}
                  </button>
                </div>
              </div>

              {/* Tabela de Conteúdos */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Etapas Cadastradas ({conteudos.length})</h5>
                {conteudos.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-slate-250 rounded-2xl bg-slate-50/50">
                    <BookOpen className="text-slate-300 mx-auto mb-2" size={32} />
                    <p className="text-slate-400 text-xs font-bold uppercase">Nenhuma etapa criada.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {conteudos.map((item, index) => (
                      <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider">Etapa {item.etapa || index + 1}</span>
                            <span className="font-bold text-xs text-[#001a33]">{item.titulo}</span>
                          </div>
                          {item.descricao && <p className="text-[10px] text-slate-500 font-medium">{item.descricao}</p>}
                          {item.textoHtml && <p className="text-[10px] text-emerald-600 font-bold"><FileText size={10} className="inline mr-1" /> Página nativa configurada</p>}
                          
                          <div className="flex gap-4 pt-1 text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                            {item.videoUrl && <span className="flex items-center gap-1 text-red-500"><Play size={10} /> Videoaula Configurada</span>}
                            {item.apostilaUrl && <span className="flex items-center gap-1 text-blue-500"><FileUp size={10} /> PDF Configurado</span>}
                            <span className="flex items-center gap-1 text-amber-600"><Clock size={10} /> {item.duracaoMinutos || 0} min</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end md:self-center">
                          <button
                            onClick={() => handleEditConteudo(item)}
                            className="p-2 border border-slate-100 hover:border-blue-150 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-xl transition-all"
                            title="Editar etapa"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleRemoveConteudo(item.id)}
                            className="p-2 border border-slate-100 hover:border-red-150 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all"
                            title="Excluir etapa"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: PROVAS / ATIVIDADES */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><HelpCircle size={20} /></span>
                <div>
                  <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Atividades e Provas Avaliativas</h4>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">Cadastre atividades obrigatórias por etapa antes da prova final.</p>
                </div>
              </div>

              <div className="border border-emerald-200 rounded-3xl p-5 bg-emerald-50/40 space-y-4">
                <div className="flex items-center gap-2">
                  <ListChecks size={18} className="text-emerald-700" />
                  <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">Atividades antes da prova</h5>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Título da atividade</label>
                    <input
                      className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-bold text-xs"
                      value={newAtividadeTitulo}
                      onChange={e => setNewAtividadeTitulo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Vincular à etapa</label>
                    <select
                      className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-bold text-xs"
                      value={newAtividadeEtapaId}
                      onChange={e => setNewAtividadeEtapaId(e.target.value)}
                    >
                      <option value="">Geral do curso</option>
                      {conteudos.map((conteudo, index) => (
                        <option key={conteudo.id} value={conteudo.id}>Etapa {conteudo.etapa || index + 1}: {conteudo.titulo}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Enunciado</label>
                  <textarea
                    rows={3}
                    className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-medium text-xs resize-none"
                    value={newAtividadeEnunciado}
                    onChange={e => setNewAtividadeEnunciado(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Tipo</label>
                    <select
                      className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-bold text-xs"
                      value={newAtividadeTipo}
                      onChange={e => setNewAtividadeTipo(e.target.value as any)}
                    >
                      <option value="reflexao">Resposta reflexiva</option>
                      <option value="multipla_escolha">Múltipla escolha</option>
                    </select>
                  </div>
                  {newAtividadeTipo === 'multipla_escolha' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Opções (uma por linha)</label>
                        <textarea
                          rows={3}
                          className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-medium text-xs resize-none"
                          value={newAtividadeOpcoes}
                          onChange={e => setNewAtividadeOpcoes(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Correta (0, 1, 2...)</label>
                        <input
                          type="number"
                          className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-bold text-xs"
                          value={newAtividadeCorreta}
                          onChange={e => setNewAtividadeCorreta(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-between items-center gap-4">
                  <span className="text-[10px] text-emerald-800 font-bold">{atividades.length} atividade(s) cadastrada(s)</span>
                  <button
                    onClick={handleAddAtividade}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Adicionar Atividade
                  </button>
                </div>

                {atividades.length > 0 && (
                  <div className="grid grid-cols-1 gap-2">
                    {atividades.map((atividade) => (
                      <div key={atividade.id} className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3">
                        <div>
                          <p className="text-xs font-black text-[#001a33]">{atividade.titulo}</p>
                          <p className="text-[10px] text-slate-500 font-medium line-clamp-1">{atividade.enunciado}</p>
                        </div>
                        <button onClick={() => handleRemoveAtividade(atividade.id)} className="text-slate-350 hover:text-red-500">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Abas de Provas */}
              <div className="flex flex-col md:flex-row gap-6">
                
                {/* Lado Esquerdo: Lista de Provas */}
                <div className="w-full md:w-64 space-y-3 shrink-0">
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <span>Avaliações ({provas.length})</span>
                  </div>

                  <div className="space-y-2">
                    {provas.map((p, idx) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProvaIdx(idx)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          selectedProvaIdx === idx 
                            ? 'bg-purple-50 border-purple-200 text-purple-800 font-bold' 
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <p className="text-xs font-bold">{p.titulo}</p>
                          <p className={`text-[9px] mt-0.5 ${p.questoes.length >= MIN_EAD_PROVA_QUESTOES ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {p.questoes.length}/{MIN_EAD_PROVA_QUESTOES} questões mín. • Min: {p.notaMinima}%
                          </p>
                        </div>
                        <Trash2 
                          size={14} 
                          className="text-slate-350 hover:text-red-500 shrink-0 cursor-pointer" 
                          onClick={(e) => { e.stopPropagation(); handleRemoveProva(idx); }}
                        />
                      </button>
                    ))}

                    {/* Cadastrar Nova Prova */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 mt-2">
                      <input 
                        type="text" 
                        placeholder="Título da Prova..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] outline-none font-bold"
                        value={newProvaTitle}
                        onChange={e => setNewProvaTitle(e.target.value)}
                      />
                      <div className="flex gap-2 items-center">
                        <input 
                          type="number" 
                          placeholder="Mínimo %"
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] outline-none font-bold text-center"
                          value={newProvaMinScore}
                          onChange={e => setNewProvaMinScore(e.target.value)}
                        />
                        <button
                          onClick={handleAddProva}
                          className="px-3 py-1.5 bg-[#001a33] text-white rounded-lg text-[10px] uppercase font-bold shrink-0"
                        >
                          Criar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lado Direito: Editor de Questões */}
                <div className="flex-1 border border-slate-200 rounded-2xl p-5 bg-white space-y-6">
                  {provas.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 font-bold text-xs uppercase">
                      Crie uma avaliação na barra lateral para começar a configurar as perguntas.
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <h5 className="font-bold text-sm text-[#001a33] uppercase">Perguntas de: {provas[selectedProvaIdx]?.titulo}</h5>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded">
                            Aprovação mínima: {provas[selectedProvaIdx]?.notaMinima}%
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            (provas[selectedProvaIdx]?.questoes.length || 0) >= MIN_EAD_PROVA_QUESTOES
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {(provas[selectedProvaIdx]?.questoes.length || 0)}/{MIN_EAD_PROVA_QUESTOES} questões
                          </span>
                        </div>
                      </div>

                      {/* Criar Nova Questão */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="space-y-1">
                          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Enunciado da Pergunta *</label>
                          <input 
                            type="text" 
                            placeholder="Qual a pergunta da questão?"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none font-bold"
                            value={newQuestaoPergunta}
                            onChange={e => setNewQuestaoPergunta(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Alternativas (Selecione a Correta)</label>
                          
                          {/* Opção 1 */}
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="questao_correta"
                              checked={newQuestaoCorreta === 0}
                              onChange={() => setNewQuestaoCorreta(0)}
                              className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                            />
                            <input 
                              type="text" 
                              placeholder="Opção A *"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                              value={newQuestaoOpcao0}
                              onChange={e => setNewQuestaoOpcao0(e.target.value)}
                            />
                          </div>

                          {/* Opção 2 */}
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="questao_correta"
                              checked={newQuestaoCorreta === 1}
                              onChange={() => setNewQuestaoCorreta(1)}
                              className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                            />
                            <input 
                              type="text" 
                              placeholder="Opção B *"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                              value={newQuestaoOpcao1}
                              onChange={e => setNewQuestaoOpcao1(e.target.value)}
                            />
                          </div>

                          {/* Opção 3 */}
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="questao_correta"
                              checked={newQuestaoCorreta === 2}
                              onChange={() => setNewQuestaoCorreta(2)}
                              className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                            />
                            <input 
                              type="text" 
                              placeholder="Opção C (Opcional)"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                              value={newQuestaoOpcao2}
                              onChange={e => setNewQuestaoOpcao2(e.target.value)}
                            />
                          </div>

                          {/* Opção 4 */}
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="questao_correta"
                              checked={newQuestaoCorreta === 3}
                              onChange={() => setNewQuestaoCorreta(3)}
                              className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                            />
                            <input 
                              type="text" 
                              placeholder="Opção D (Opcional)"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                              value={newQuestaoOpcao3}
                              onChange={e => setNewQuestaoOpcao3(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => handleAddQuestao(selectedProvaIdx)}
                            className="px-4 py-1.5 bg-[#001a33] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider"
                          >
                            Adicionar Questão
                          </button>
                        </div>
                      </div>

                      {/* Lista de Questões Adicionadas */}
                      <div className="space-y-3">
                        <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Questões criadas ({provas[selectedProvaIdx]?.questoes.length}) • mínimo obrigatório: {MIN_EAD_PROVA_QUESTOES}
                        </h6>
                        {provas[selectedProvaIdx]?.questoes.length === 0 ? (
                          <p className="text-center py-6 text-slate-400 text-xs italic">Nenhuma pergunta cadastrada para esta prova.</p>
                        ) : (
                          <div className="space-y-4">
                            {provas[selectedProvaIdx].questoes.map((q, qIdx) => (
                              <div key={q.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50/20 relative group">
                                <div className="flex justify-between items-start gap-4">
                                  <div>
                                    <h6 className="font-bold text-xs text-[#001a33]">{qIdx + 1}. {q.pergunta}</h6>
                                    <ul className="mt-2 space-y-1 pl-4 list-disc text-[11px] text-slate-650 font-medium">
                                      {q.opcoes.map((op, oIdx) => (
                                        <li key={oIdx} className={q.respostaCorreta === oIdx ? 'text-emerald-600 font-bold' : ''}>
                                          {op} {q.respostaCorreta === oIdx && '✔'}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveQuestao(selectedProvaIdx, q.id)}
                                    className="text-slate-350 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: CERTIFICAÇÃO */}
            {currentStep === 6 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><Award size={20} /></span>
                <div>
                  <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Geração de Certificado EAD</h4>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">
                    Configure as regras acadêmicas. O preview abaixo usa o modelo atual de certificado cadastrado em Cadastros &gt; Modelos Documentos.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Parâmetros do Certificado */}
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="space-y-1">
                      <span className="font-bold text-xs text-slate-800 block uppercase tracking-wide">Emissão Automática</span>
                      <span className="text-[10px] text-slate-400 font-medium block leading-relaxed">
                        Liberar o certificado na área do aluno automaticamente após a aprovação nas provas.
                      </span>
                    </div>
                    <button 
                      onClick={() => setEmitirAutomatico(!emitirAutomatico)}
                      className={`w-12 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                        emitirAutomatico ? 'bg-purple-600' : 'bg-slate-300'
                      }`}
                    >
                      <div 
                        className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                          emitirAutomatico ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">% de Aproveitamento Mínimo</label>
                    <input
                      type="number"
                      placeholder="Ex: 70"
                      className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800"
                      value={minimoAproveitamento}
                      onChange={e => setMinimoAproveitamento(e.target.value)}
                    />
                    <p className="text-[9px] text-slate-400 leading-normal">Média geral nas avaliações do curso necessária para obter aprovação.</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <span className="block text-xs font-black uppercase tracking-wide text-slate-800">Modelo aplicado na emissão</span>
                    <span className="mt-1 block text-[10px] font-medium leading-relaxed text-slate-400">
                      {isLoadingModeloCertificado ? 'Carregando modelo de certificado...' : (modeloCertificadoEad?.nome || 'Modelo não encontrado.')}
                    </span>
                  </div>
                </div>

                <div className="rounded-3xl border border-purple-100 bg-purple-50/60 p-6">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-purple-700">Modelo usado na emissão</span>
                  {isLoadingModeloCertificado ? (
                    <p className="text-xs font-bold text-slate-500">Carregando configuração do modelo...</p>
                  ) : modeloCertificadoEad ? (
                    <>
                      <h5 className="text-lg font-black uppercase tracking-tight text-[#001a33]">{modeloCertificadoEad.nome}</h5>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-600">{modeloCertificadoEad.tipoCurso}</p>
                      <p className="mt-3 text-xs leading-relaxed text-slate-500">
                        Alterações feitas em Cadastros &gt; Modelos Documentos são refletidas automaticamente nesta prévia.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                        <span className="px-2.5 py-1 rounded-full border border-purple-200 bg-white text-purple-700">
                          {modeloCertificadoEad.hasVerso ? 'Frente e verso' : 'Somente frente'}
                        </span>
                        <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-600">
                          QR Code: {modeloCertificadoEad.hasValidationQrCode ? 'Ativo' : 'Desativado'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">
                      Não foi possível carregar o modelo. O curso continua podendo ser salvo com o modelo padrão.
                    </p>
                  )}
                </div>
              </div>

              {/* Prévia do Certificado */}
              <div className="border border-slate-250 bg-slate-50/50 rounded-3xl p-6 mt-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-purple-600" />
                <div className="mb-5 flex flex-col gap-1 pl-2">
                  <h5 className="font-black text-xs text-slate-600 uppercase tracking-wider">Pré-visualização real do certificado</h5>
                  <p className="text-[10px] font-semibold text-slate-400">
                    Frente e verso renderizados com o modelo usado na emissão do certificado EAD.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  {isLoadingModeloCertificado ? (
                    <div className="flex min-h-[260px] items-center justify-center text-xs font-bold text-slate-400">
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Carregando preview do certificado...
                    </div>
                  ) : !modeloCertificadoEad ? (
                    <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
                      Modelo indisponível no momento.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl bg-slate-200/70 p-4">
                      <div className="flex min-w-max gap-6">
                        <div className="space-y-2">
                          <span className="block text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Frente</span>
                          <div className="relative" style={certificatePreviewFrameStyle}>
                            <div className="absolute left-0 top-0">
                              <DiplomaPreview
                                formData={modeloCertificadoEad}
                                page="frente"
                                zoomLevel={certificatePreviewZoom}
                                previewValues={previewTemplateValues}
                              />
                            </div>
                          </div>
                        </div>
                        {modeloCertificadoEad.hasVerso && (
                          <div className="space-y-2">
                            <span className="block text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Verso</span>
                            <div className="relative" style={certificatePreviewFrameStyle}>
                              <div className="absolute left-0 top-0">
                                <DiplomaPreview
                                  formData={modeloCertificadoEad}
                                  page="verso"
                                  zoomLevel={certificatePreviewZoom}
                                  previewValues={previewTemplateValues}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

      {/* Botões de Navegação Inferiores */}
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-250/75 px-4 py-2.5 rounded-xl text-xs font-bold uppercase disabled:opacity-50 transition-colors"
          >
            <ChevronLeft size={16} /> Voltar
          </button>
          
          {currentStep < 6 ? (
            <button
              onClick={() => setCurrentStep(prev => Math.min(6, prev + 1))}
              className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase transition-colors shadow-md shadow-purple-600/15"
            >
              Avançar <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={() => handleFinalSave(true)}
              disabled={isSaving}
              className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase transition-all shadow-lg shadow-purple-600/25 animate-pulse"
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              Publicar Curso EAD
            </button>
          )}
        </div>

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
    </div>
  );
};

export default EadCourseWizard;
