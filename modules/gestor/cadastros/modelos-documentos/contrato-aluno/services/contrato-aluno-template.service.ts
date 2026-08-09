import { supabase } from '../../../../../../lib/supabase';
import {
  CONTRATO_ALUNO_MODALIDADES,
  type ConteudoModeloContratoAluno,
  type ContratoAlunoModalidade,
  type ModeloDocumentoSeguro,
  type SalvarModeloDocumentoSeguroInput,
} from '../types/contrato-aluno.types';
import { normalizeContractSectionHeader } from '../../../../../shared/contrato-aluno/section-header';
import {
  DEFAULT_CONTRACT_CRITICAL_HIGHLIGHTS,
  normalizeContractCriticalHighlights,
} from '../../../../../shared/contrato-aluno/semantic-format';

const TEMPLATE_KEY = 'contrato_aluno';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isModalidade = (value: unknown): value is ContratoAlunoModalidade => (
  typeof value === 'string' && (CONTRATO_ALUNO_MODALIDADES as readonly string[]).includes(value)
);

const isStatus = (value: unknown): value is ModeloDocumentoSeguro<unknown>['status'] => (
  value === 'RASCUNHO' || value === 'ATIVO' || value === 'EM_REVISAO'
);

const asString = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;

const defaultContent = (modalidade: ContratoAlunoModalidade): ConteudoModeloContratoAluno => {
  const isTechnical = modalidade === 'TECNICO';
  return {
    status: 'EM_REVISAO',
    tituloDocumento: 'Contrato de Prestação de Serviços Educacionais',
    cabecalho: '',
    corpo: isTechnical
      ? 'A minuta técnica oficial será carregada a partir do modelo canônico aprovado. Edite apenas após a revisão jurídica institucional.'
      : 'Este modelo aguarda texto jurídico aprovado para a modalidade selecionada. Nenhuma cláusula técnica é adaptada automaticamente.',
    destaquesCriticos: [...DEFAULT_CONTRACT_CRITICAL_HIGHLIGHTS],
    rodape: 'Documento emitido eletronicamente pela Universo Cursos e Consultoria.',
    observacaoEscopo: isTechnical
      ? 'Base: minuta técnica institucional preservada no repositório de documentos.'
      : 'Revisão jurídica obrigatória antes da primeira emissão desta modalidade.',
    fonte: isTechnical ? 'MINUTA_TECNICA' : 'AGUARDANDO_REVISAO_JURIDICA',
    marcaDagua: {
      habilitada: true,
      intensidade: 'SUAVE',
      origem: 'POLO_EMISSOR',
    },
    qr: {
      habilitado: true,
      rotulo: 'Validar documento',
      caminhoValidacao: '/validar-documento',
      modoValidade: 'SEM_VENCIMENTO',
      diasValidade: null,
    },
  };
};

const normalizeContent = (
  value: unknown,
  modalidade: ContratoAlunoModalidade,
): ConteudoModeloContratoAluno => {
  const fallback = defaultContent(modalidade);
  if (!isRecord(value)) return fallback;

  const marcaDagua = isRecord(value.marcaDagua) ? value.marcaDagua : {};
  const qr = isRecord(value.qr) ? value.qr : {};
  const fonte = value.fonte === 'MINUTA_TECNICA'
    || value.fonte === 'AGUARDANDO_REVISAO_JURIDICA'
    ? value.fonte
    : fallback.fonte;
  const modoValidade = qr.modoValidade === 'POR_DIAS' ? 'POR_DIAS' : 'SEM_VENCIMENTO';
  const diasValidade = typeof qr.diasValidade === 'number' && Number.isFinite(qr.diasValidade)
    ? qr.diasValidade
    : null;

  return {
    status: isStatus(value.status) ? value.status : fallback.status,
    tituloDocumento: asString(value.tituloDocumento, fallback.tituloDocumento),
    cabecalho: normalizeContractSectionHeader(
      asString(value.cabecalho, fallback.cabecalho),
      ['UNIVERSO CURSOS E CONSULTORIA'],
    ),
    corpo: asString(value.corpo, fallback.corpo),
    destaquesCriticos: normalizeContractCriticalHighlights(value.destaquesCriticos),
    rodape: asString(value.rodape, fallback.rodape),
    observacaoEscopo: asString(value.observacaoEscopo, fallback.observacaoEscopo),
    fonte,
    marcaDagua: {
      habilitada: marcaDagua.habilitada !== false,
      intensidade: marcaDagua.intensidade === 'MEDIA' ? 'MEDIA' : 'SUAVE',
      origem: 'POLO_EMISSOR',
    },
    qr: {
      // O QR do contrato é obrigatório; somente sua validade e rótulo podem
      // ser configurados no modelo.
      habilitado: true,
      rotulo: asString(qr.rotulo, fallback.qr.rotulo),
      caminhoValidacao: asString(qr.caminhoValidacao, fallback.qr.caminhoValidacao),
      modoValidade,
      diasValidade: modoValidade === 'POR_DIAS' ? diasValidade : null,
    },
  };
};

const normalizeEnvelope = (
  payload: unknown,
  modalidade: ContratoAlunoModalidade,
): ModeloDocumentoSeguro<ConteudoModeloContratoAluno> => {
  const row = Array.isArray(payload) ? payload[0] : payload;
  const source = isRecord(row) ? row : {};
  const modalidadeRecebida = source.modalidade ?? source.modality;
  const revision = typeof source.revisao === 'number'
    ? source.revisao
    : typeof source.revision === 'number'
      ? source.revision
      : 0;
  const content = source.conteudo ?? source.content;
  const status = isStatus(source.status) ? source.status : 'RASCUNHO';
  const normalizedContent = normalizeContent(content, modalidade);

  return {
    templateKey: asString(source.templateKey ?? source.template_key, TEMPLATE_KEY),
    modalidade: isModalidade(modalidadeRecebida) ? modalidadeRecebida : modalidade,
    revisao: Number.isFinite(revision) ? revision : 0,
    status,
    atualizadoEm: asString(source.atualizadoEm ?? source.updatedAt ?? source.updated_at) || null,
    atualizadoPorNome: asString(source.atualizadoPorNome ?? source.updatedByName ?? source.updated_by_name) || null,
    // Modelos anteriores não possuíam estado dentro do JSON. Espelhar o
    // envelope aqui mantém a edição compatível e envia o estado explicitamente
    // no próximo save, sem o browser decidir autorização de emissão.
    conteudo: isRecord(content) && isStatus(content.status)
      ? normalizedContent
      : { ...normalizedContent, status },
  };
};

/**
 * Contrato público da RPC, mantido aqui para alinhar o frontend e a migration:
 *
 * get_modelo_documento_template_secure(
 *   p_template_key text,
 *   p_modality text null
 * ) -> jsonb { templateKey, modality, revision, status, updatedAt, updatedByName, content }
 *
 * save_modelo_documento_template_secure(
 *   p_template_key text,
 *   p_modality text null,
 *   p_expected_revision integer,
 *   p_content jsonb,
 *   p_request_id uuid
 * ) -> o mesmo envelope, com a revisão canônica incrementada. O campo
 * O `status` presente no rascunho é apenas um espelho do envelope. A RPC de
 * salvamento nunca ativa contrato; a aprovação é uma operação separada,
 * versionada e auditada no servidor.
 *
 * A RPC é responsável por autorização de módulo/polo, versionamento, auditoria,
 * idempotência e validação de conteúdo. O browser nunca grava documentos_templates.
 */
export const contratoAlunoTemplateService = {
  async getTemplate(modalidade: ContratoAlunoModalidade) {
    const { data, error } = await supabase.rpc('get_modelo_documento_template_secure', {
      p_template_key: TEMPLATE_KEY,
      p_modality: modalidade,
    });
    if (error) throw error;
    return normalizeEnvelope(data, modalidade);
  },

  async saveTemplate(
    input: SalvarModeloDocumentoSeguroInput<ConteudoModeloContratoAluno>,
  ) {
    const { data, error } = await supabase.rpc('save_modelo_documento_template_secure', {
      p_template_key: input.templateKey,
      p_modality: input.modalidade,
      p_expected_revision: input.revisaoEsperada,
      p_content: input.conteudo,
      p_request_id: input.requestId,
    });
    if (error) throw error;
    if (!input.modalidade) throw new Error('A modalidade do contrato é obrigatória.');
    return normalizeEnvelope(data, input.modalidade);
  },

  async approveTemplate(input: {
    modalidade: ContratoAlunoModalidade;
    revisaoEsperada: number;
    requestId: string;
  }) {
    const { data, error } = await supabase.rpc('aprovar_modelo_contrato_aluno_secure', {
      p_modality: input.modalidade,
      p_expected_revision: input.revisaoEsperada,
      p_acknowledgement: 'APROVADO_JURIDICAMENTE',
      p_request_id: input.requestId,
    });
    if (error) throw error;
    return normalizeEnvelope(data, input.modalidade);
  },
};

export { TEMPLATE_KEY as CONTRATO_ALUNO_TEMPLATE_KEY };
