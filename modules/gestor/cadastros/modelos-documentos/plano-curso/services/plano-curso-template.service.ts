import { supabase } from '../../../../../../lib/supabase';
import type {
  ConteudoModeloPlanoCurso,
  ModeloPlanoCursoSeguro,
  SalvarModeloPlanoCursoInput,
  StatusModeloPlanoCurso,
} from '../types/plano-curso.types';

export const PLANO_CURSO_TEMPLATE_KEY = 'plano_curso' as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const asString = (value: unknown, fallback = '') => (
  typeof value === 'string' ? value : fallback
);

const asInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const isStatus = (value: unknown): value is StatusModeloPlanoCurso => (
  value === 'RASCUNHO' || value === 'ATIVO' || value === 'EM_REVISAO' || value === 'ARQUIVADO'
);

export const DEFAULT_PLANO_CURSO_CONTENT: ConteudoModeloPlanoCurso = {
  nomeModelo: 'Plano de Curso',
  titulo: 'Plano de Curso',
  subtitulo: '{{CURSO}} · {{TURMA}}',
  orientacao: 'A4_RETRATO',
  exibirMarcaDagua: true,
  exibirAssinaturaDocente: true,
  instrucoesConteudo: 'Registre o conteúdo programático previsto para cada encontro, respeitando as datas, os horários e as aulas canônicas da grade.',
  rotulos: {
    componenteCurricular: 'Componente curricular',
    docente: 'Professor(a)',
    diasAulas: 'Dias de aula',
    objetivosDisciplina: 'Objetivos',
    criteriosAvaliacao: 'Critérios de avaliação',
    insumosRecursos: 'Insumos e recursos',
    conteudoProgramatico: 'Conteúdo programático por encontro',
    dataLocal: 'Local e data',
    assinaturaDocente: 'Assinatura do(a) professor(a)',
  },
  paginacao: {
    encontrosPrimeiraPagina: 0,
    encontrosDemaisPaginas: 9,
  },
};

const normalizeContent = (value: unknown): ConteudoModeloPlanoCurso => {
  if (!isRecord(value)) return DEFAULT_PLANO_CURSO_CONTENT;
  const labels = isRecord(value.rotulos) ? value.rotulos : {};
  const pagination = isRecord(value.paginacao) ? value.paginacao : {};

  return {
    nomeModelo: asString(value.nomeModelo, DEFAULT_PLANO_CURSO_CONTENT.nomeModelo),
    titulo: asString(value.titulo, DEFAULT_PLANO_CURSO_CONTENT.titulo),
    subtitulo: asString(value.subtitulo, DEFAULT_PLANO_CURSO_CONTENT.subtitulo),
    orientacao: 'A4_RETRATO',
    exibirMarcaDagua: value.exibirMarcaDagua !== false,
    exibirAssinaturaDocente: value.exibirAssinaturaDocente !== false,
    instrucoesConteudo: asString(
      value.instrucoesConteudo,
      DEFAULT_PLANO_CURSO_CONTENT.instrucoesConteudo,
    ),
    rotulos: {
      componenteCurricular: asString(
        labels.componenteCurricular,
        DEFAULT_PLANO_CURSO_CONTENT.rotulos.componenteCurricular,
      ),
      docente: asString(labels.docente, DEFAULT_PLANO_CURSO_CONTENT.rotulos.docente),
      diasAulas: asString(labels.diasAulas, DEFAULT_PLANO_CURSO_CONTENT.rotulos.diasAulas),
      objetivosDisciplina: asString(
        labels.objetivosDisciplina,
        DEFAULT_PLANO_CURSO_CONTENT.rotulos.objetivosDisciplina,
      ),
      criteriosAvaliacao: asString(
        labels.criteriosAvaliacao,
        DEFAULT_PLANO_CURSO_CONTENT.rotulos.criteriosAvaliacao,
      ),
      insumosRecursos: asString(
        labels.insumosRecursos,
        DEFAULT_PLANO_CURSO_CONTENT.rotulos.insumosRecursos,
      ),
      conteudoProgramatico: asString(
        labels.conteudoProgramatico,
        DEFAULT_PLANO_CURSO_CONTENT.rotulos.conteudoProgramatico,
      ),
      dataLocal: asString(labels.dataLocal, DEFAULT_PLANO_CURSO_CONTENT.rotulos.dataLocal),
      assinaturaDocente: asString(
        labels.assinaturaDocente,
        DEFAULT_PLANO_CURSO_CONTENT.rotulos.assinaturaDocente,
      ),
    },
    paginacao: {
      encontrosPrimeiraPagina: asInteger(
        pagination.encontrosPrimeiraPagina,
        DEFAULT_PLANO_CURSO_CONTENT.paginacao.encontrosPrimeiraPagina,
        0,
        12,
      ),
      encontrosDemaisPaginas: asInteger(
        pagination.encontrosDemaisPaginas,
        DEFAULT_PLANO_CURSO_CONTENT.paginacao.encontrosDemaisPaginas,
        1,
        12,
      ),
    },
  };
};

const normalizeEnvelope = (payload: unknown): ModeloPlanoCursoSeguro => {
  const row = Array.isArray(payload) ? payload[0] : payload;
  const source = isRecord(row) ? row : {};
  const revision = typeof source.revisao === 'number'
    ? source.revisao
    : typeof source.revision === 'number' ? source.revision : 0;

  return {
    templateKey: PLANO_CURSO_TEMPLATE_KEY,
    revisao: Number.isFinite(revision) ? revision : 0,
    status: isStatus(source.status) ? source.status : 'RASCUNHO',
    atualizadoEm: asString(source.atualizadoEm ?? source.updatedAt ?? source.updated_at) || null,
    atualizadoPorNome: asString(
      source.atualizadoPorNome ?? source.updatedByName ?? source.updated_by_name,
    ) || null,
    conteudo: normalizeContent(source.conteudo ?? source.content),
  };
};

export const planoCursoTemplateService = {
  async getTemplate() {
    const { data, error } = await supabase.rpc('get_modelo_documento_template_secure', {
      p_template_key: PLANO_CURSO_TEMPLATE_KEY,
      p_modality: null,
    });
    if (error) throw error;
    return normalizeEnvelope(data);
  },

  async saveTemplate(input: SalvarModeloPlanoCursoInput) {
    const { data, error } = await supabase.rpc('save_modelo_documento_template_secure', {
      p_template_key: PLANO_CURSO_TEMPLATE_KEY,
      p_modality: null,
      p_expected_revision: input.revisaoEsperada,
      p_content: input.conteudo,
      p_request_id: input.requestId,
    });
    if (error) throw error;
    return normalizeEnvelope(data);
  },
};
