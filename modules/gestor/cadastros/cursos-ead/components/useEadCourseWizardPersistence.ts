import type { Curso, EadConfig } from '../../cadastros.types';
import { cadastrosService, normalizeCursoFinanceiroConfig } from '../../cadastros.service';
import {
  DEFAULT_EAD_RETRY_HOURS,
  MIN_EAD_PROVA_QUESTOES,
  parseBRLPrice,
} from './eadCourseWizard.helpers';
import { normalizeChoiceAnswer, normalizeVimeoVideoUrl } from './eadCourseWizard.utils';
import type { EadCourseWizardState } from './useEadCourseWizardState';

export const useEadCourseWizardPersistence = ({
  curso,
  onSave,
  state,
}: {
  curso?: Curso | null;
  onSave: () => void;
  state: EadCourseWizardState;
}) => {
  const {
    setIsSaving,
    nome,
    area,
    cargaHoraria,
    valorText,
    financeiroPix,
    financeiroBoleto,
    financeiroCartao,
    descricao,
    imagemUrl,
    versao,
    publicarSite,
    subtituloPagina,
    objetivosPagina,
    publicoAlvo,
    requisitos,
    metodologia,
    tempoMinimoMinutos,
    intervaloReprovacaoHoras,
    liberarSequencialmente,
    exigirAtividades,
    exigirVideosConcluidos,
    videoPrincipalUrl,
    cronograma,
    conteudos,
    atividades,
    provas,
    emitirAutomatico,
    minimoAproveitamento,
    showToast,
  } = state;

  // --- PERSISTÊNCIA COMPLETA ---
  const handleFinalSave = async (forcePublishState?: boolean) => {
    if (!nome.trim() || !cargaHoraria.trim()) {
      showToast('Por favor, preencha o nome do curso e a carga horária.', 'warning');
      return;
    }

    const valorParsed = parseBRLPrice(valorText);
    if (!valorParsed || valorParsed <= 0) {
      showToast('Informe o valor do curso EAD. O preço é obrigatório para exibição no catálogo e geração da cobrança.', 'warning');
      return;
    }

    if (!financeiroPix && !financeiroBoleto && !financeiroCartao) {
      showToast('Selecione pelo menos uma forma de recebimento para o checkout do curso.', 'warning');
      return;
    }

    if (provas.length === 0) {
      showToast('Cadastre pelo menos uma prova final para o curso EAD.', 'warning');
      return;
    }

    const provaComPoucasQuestoes = provas.find(prova => (prova.questoes?.length || 0) < MIN_EAD_PROVA_QUESTOES);
    if (provaComPoucasQuestoes) {
      showToast(`A prova "${provaComPoucasQuestoes.titulo}" precisa ter no mínimo ${MIN_EAD_PROVA_QUESTOES} questões antes de salvar/publicar.`, 'warning');
      return;
    }

    const atividadeComPoucasOpcoes = atividades.find((atividade) => (
      atividade.tipo === 'multipla_escolha'
      && normalizeChoiceAnswer(atividade.opcoes, atividade.respostaCorreta).options.length < 2
    ));
    if (atividadeComPoucasOpcoes) {
      showToast(`A atividade "${atividadeComPoucasOpcoes.titulo}" precisa ter pelo menos duas opções de resposta.`, 'warning');
      return;
    }

    const provaComQuestaoInvalida = provas.find((prova) => prova.questoes.some((questao) => (
      normalizeChoiceAnswer(questao.opcoes, questao.respostaCorreta).options.length < 2
    )));
    if (provaComQuestaoInvalida) {
      showToast(`A prova "${provaComQuestaoInvalida.titulo}" possui questão com menos de duas opções de resposta.`, 'warning');
      return;
    }

    setIsSaving(true);

    const normalizedVideoUrl = normalizeVimeoVideoUrl(videoPrincipalUrl);
    const conteudosSemVideo = conteudos.map((item: any, index) => {
      const conteudo = { ...item };
      delete conteudo.videoUrl;
      const tipo = conteudo.tipo === 'video' || conteudo.tipo === 'ambos'
        ? (conteudo.apostilaUrl ? 'material' : 'pagina')
        : conteudo.tipo;
      return {
        ...conteudo,
        tipo,
        ...(index === 0 && normalizedVideoUrl ? { videoUrl: normalizedVideoUrl } : {})
      };
    });
    const normalizedAtividades = atividades.map((atividade) => {
      if (atividade.tipo !== 'multipla_escolha') return atividade;
      const normalizedAnswer = normalizeChoiceAnswer(atividade.opcoes, atividade.respostaCorreta);
      return {
        ...atividade,
        opcoes: normalizedAnswer.options,
        respostaCorreta: normalizedAnswer.answerIndex,
      };
    });
    const normalizedProvas = provas.map((prova) => ({
      ...prova,
      questoes: prova.questoes.map((questao) => {
        const normalizedAnswer = normalizeChoiceAnswer(questao.opcoes, questao.respostaCorreta);
        return {
          ...questao,
          opcoes: normalizedAnswer.options,
          respostaCorreta: normalizedAnswer.answerIndex,
        };
      }),
    }));

    // Estrutura o objeto JSONB EAD Config
    const eadConfig: EadConfig = {
      videoUrl: normalizedVideoUrl || undefined,
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
      conteudos: conteudosSemVideo,
      atividades: normalizedAtividades,
      provas: normalizedProvas,
      certificacao: {
        emitirAutomatico,
        minimoAproveitamento: parseInt(minimoAproveitamento) || 70,
        modeloDocumento: 'certificado_ead'
      }
    };

    const isPublishing = forcePublishState !== undefined ? forcePublishState : publicarSite;
    const financeiroConfig = normalizeCursoFinanceiroConfig({
      valorBase: valorParsed,
      parcelasPadrao: 1,
      considerarTaxaNoCheckout: false,
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
        maxParcelas: 1,
        aplicarDescontoPontualidade: false,
        repassarCustoParcelamento: false
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
      if (curso?.id) {
        cursoPayload.id = curso.id;
        await cadastrosService.updateCurso({ ...curso, ...cursoPayload } as Curso);
      } else {
        await cadastrosService.createCurso(cursoPayload);
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

  return { handleFinalSave };
};
