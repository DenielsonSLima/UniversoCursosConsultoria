import { useEffect } from 'react';
import type { Curso, EadConfig } from '../../cadastros.types';
import { normalizeCursoFinanceiroConfig } from '../../cadastros.service';
import { diplomaService } from '../../modelos-documentos/diploma/diploma.service';
import { DEFAULT_EAD_RETRY_HOURS } from './eadCourseWizard.helpers';
import { getMainEadVideoUrl } from './eadCourseWizard.utils';
import type { EadCourseWizardState } from './useEadCourseWizardState';

export const useEadCourseWizardInitialization = (
  curso: Curso | null | undefined,
  state: EadCourseWizardState,
) => {
  const {
    setNome,
    setArea,
    setCargaHoraria,
    setValorText,
    setFinanceiroPix,
    setFinanceiroBoleto,
    setFinanceiroCartao,
    setFinanceiroParcelado,
    setFinanceiroParcelasPadrao,
    setFinanceiroMaxParcelas,
    setFinanceiroTaxaPagaPor,
    setFinanceiroRepassarCustoParcelamento,
    setFinanceiroConsiderarTaxaNoCheckout,
    setDescricao,
    setImagemUrl,
    setVersao,
    setPublicarSite,
    setSubtituloPagina,
    setObjetivosPagina,
    setPublicoAlvo,
    setRequisitos,
    setMetodologia,
    setTempoMinimoMinutos,
    setIntervaloReprovacaoHoras,
    setLiberarSequencialmente,
    setExigirAtividades,
    setExigirVideosConcluidos,
    setVideoPrincipalUrl,
    setCronograma,
    setConteudos,
    setAtividades,
    setProvas,
    setEmitirAutomatico,
    setMinimoAproveitamento,
    setAssinaturaUrl,
    setModeloCertificadoEad,
    setIsLoadingModeloCertificado,
  } = state;

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
      setFinanceiroRepassarCustoParcelamento(financeiroConfig.cartao.repassarCustoParcelamento === true);
      setFinanceiroConsiderarTaxaNoCheckout(financeiroConfig.considerarTaxaNoCheckout === true);

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
      setVideoPrincipalUrl(getMainEadVideoUrl(config));
      setCronograma(config.cronograma || []);
      setConteudos(config.conteudos || []);
      setAtividades(config.atividades || []);
      setProvas(config.provas || []);

      if (config.certificacao) {
        setEmitirAutomatico(config.certificacao.emitirAutomatico ?? (config.certificacao as any).emitirAutomaticamente ?? true);
        setMinimoAproveitamento((config.certificacao.minimoAproveitamento ?? (config.certificacao as any).notaMinima ?? 70).toString());
        setAssinaturaUrl(config.certificacao.assinaturaUrl || '');
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
};
