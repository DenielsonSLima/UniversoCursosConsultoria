import { supabase } from '../../../../../lib/supabase';
import type { EadAtividade, EadCronogramaItem, EadConteudoItem, EadProva, EadQuestao } from '../../cadastros.types';
import {
  STORAGE_BASE_PATH,
  compressImageToWebp,
  removeOldStorageImage,
} from './eadCourseWizard.helpers';
import { normalizeChoiceAnswer } from './eadCourseWizard.utils';
import type { EadCourseWizardState } from './useEadCourseWizardState';

export const useEadCourseWizardActions = (state: EadCourseWizardState) => {
  const {
    imagemUrl,
    setImagemUrl,
    setIsUploadingCapa,
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
    setSelectedProvaIdx,
    newProvaTitle,
    setNewProvaTitle,
    newProvaMinScore,
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
    assinaturaUrl,
    setAssinaturaUrl,
    setConfirmModal,
    showToast,
  } = state;

  // --- MÉTODOS DE CONTROLE ---

  // Upload genérico para o Bucket 'documentos'
  const handleUploadImage = async (file: File, type: 'capa' | 'assinatura') => {
    if (type === 'capa') setIsUploadingCapa(true);

    try {
      const previousUrl = type === 'capa' ? imagemUrl : assinaturaUrl;
      const compressedFile = await compressImageToWebp(file);
      const ext = compressedFile.name.split('.').pop() || 'webp';
      const filePath = `${STORAGE_BASE_PATH}/${type}_${Date.now()}.${ext}`;

      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, compressedFile, {
          cacheControl: '31536000',
          upsert: true,
          contentType: compressedFile.type
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
    setNewContApostila(item.apostilaUrl || '');
    setNewContTexto(item.textoHtml || '');
    setNewContDuracao((item.duracaoMinutos || parseInt(String((item as any).duracao || ''), 10) || 15).toString());
    setNewContObjetivos((item.objetivos || []).join('\n'));
    setNewContTipo(item.tipo === 'video' || item.tipo === 'ambos' ? (item.apostilaUrl ? 'material' : 'pagina') : item.tipo || 'pagina');
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

    if (newAtividadeTipo === 'multipla_escolha' && opcoes.length < 2) {
      showToast('Cadastre pelo menos duas opções para a atividade de múltipla escolha.', 'warning');
      return;
    }

    const normalizedActivityAnswer = normalizeChoiceAnswer(
      opcoes,
      parseInt(newAtividadeCorreta, 10),
    );

    const item: EadAtividade = {
      id: `atv-${Math.random().toString(36).substr(2, 9)}`,
      etapaId: newAtividadeEtapaId || undefined,
      titulo: newAtividadeTitulo.trim(),
      enunciado: newAtividadeEnunciado.trim(),
      tipo: newAtividadeTipo,
      opcoes: newAtividadeTipo === 'multipla_escolha' ? normalizedActivityAnswer.options : undefined,
      respostaCorreta: newAtividadeTipo === 'multipla_escolha' ? normalizedActivityAnswer.answerIndex : undefined
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

    const rawOptions = [
      newQuestaoOpcao0.trim(),
      newQuestaoOpcao1.trim(),
      newQuestaoOpcao2.trim(),
      newQuestaoOpcao3.trim()
    ];
    const normalizedQuestionAnswer = normalizeChoiceAnswer(rawOptions, newQuestaoCorreta);

    const questao: EadQuestao = {
      id: `quest-${Math.random().toString(36).substr(2, 9)}`,
      pergunta: newQuestaoPergunta.trim(),
      opcoes: normalizedQuestionAnswer.options,
      respostaCorreta: normalizedQuestionAnswer.answerIndex
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

  return {
    handleUploadImage,
    handleRemoveImageConfirmed,
    handleRemoveImage,
    handleAddCronograma,
    handleRemoveCronograma,
    resetConteudoForm,
    handleAddConteudo,
    handleEditConteudo,
    handleRemoveConteudo,
    handleAddAtividade,
    handleRemoveAtividade,
    handleAddProva,
    handleAddQuestao,
    handleRemoveQuestao,
    handleRemoveProva,
  };
};
