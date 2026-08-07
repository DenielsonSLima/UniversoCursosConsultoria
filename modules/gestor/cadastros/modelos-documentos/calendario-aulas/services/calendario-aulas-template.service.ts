import { supabase } from '../../../../../../lib/supabase';
import type {
  ConteudoModeloCalendarioAulas,
  ModeloCalendarioAulasSeguro,
  SalvarModeloCalendarioAulasInput,
  StatusModeloCalendario,
} from '../types/calendario-aulas.types';

export const CALENDARIO_AULAS_TEMPLATE_KEY = 'calendario_aulas' as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);
const asString = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const isStatus = (value: unknown): value is StatusModeloCalendario => (
  value === 'RASCUNHO' || value === 'ATIVO' || value === 'EM_REVISAO'
);

const DEFAULT_CONTENT: ConteudoModeloCalendarioAulas = {
  nomeModelo: 'Calendário de Aulas',
  titulo: 'Calendário de Aulas Teóricas',
  subtitulo: '{{CURSO}} · {{TURMA}}',
  rodape: 'Calendário gerado eletronicamente pela Universo Cursos e Consultoria.',
  observacaoSemHorario: 'Horário não informado na grade da turma.',
  orientacao: 'A4_RETRATO',
  exibirMarcaDagua: true,
  exibirModulo: true,
  cabecalhosTabela: {
    componente: 'Componente curricular',
    data: 'Data',
    horario: 'Horário',
    professorObservacao: 'Professor(es) / observação',
  },
};

const normalizeContent = (value: unknown): ConteudoModeloCalendarioAulas => {
  if (!isRecord(value)) return DEFAULT_CONTENT;
  const table = isRecord(value.cabecalhosTabela) ? value.cabecalhosTabela : {};
  return {
    nomeModelo: asString(value.nomeModelo, DEFAULT_CONTENT.nomeModelo),
    titulo: asString(value.titulo, DEFAULT_CONTENT.titulo),
    subtitulo: asString(value.subtitulo, DEFAULT_CONTENT.subtitulo),
    rodape: asString(value.rodape, DEFAULT_CONTENT.rodape),
    observacaoSemHorario: asString(value.observacaoSemHorario, DEFAULT_CONTENT.observacaoSemHorario),
    orientacao: 'A4_RETRATO',
    exibirMarcaDagua: value.exibirMarcaDagua !== false,
    exibirModulo: value.exibirModulo !== false,
    cabecalhosTabela: {
      componente: asString(table.componente, DEFAULT_CONTENT.cabecalhosTabela.componente),
      data: asString(table.data, DEFAULT_CONTENT.cabecalhosTabela.data),
      horario: asString(table.horario, DEFAULT_CONTENT.cabecalhosTabela.horario),
      professorObservacao: asString(table.professorObservacao, DEFAULT_CONTENT.cabecalhosTabela.professorObservacao),
    },
  };
};

const normalizeEnvelope = (payload: unknown): ModeloCalendarioAulasSeguro => {
  const row = Array.isArray(payload) ? payload[0] : payload;
  const source = isRecord(row) ? row : {};
  const revision = typeof source.revisao === 'number'
    ? source.revisao
    : typeof source.revision === 'number' ? source.revision : 0;
  return {
    templateKey: CALENDARIO_AULAS_TEMPLATE_KEY,
    revisao: Number.isFinite(revision) ? revision : 0,
    status: isStatus(source.status) ? source.status : 'RASCUNHO',
    atualizadoEm: asString(source.atualizadoEm ?? source.updatedAt ?? source.updated_at) || null,
    atualizadoPorNome: asString(source.atualizadoPorNome ?? source.updatedByName ?? source.updated_by_name) || null,
    conteudo: normalizeContent(source.conteudo ?? source.content),
  };
};

/**
 * RPCs previstas:
 * get_modelo_documento_template_secure('calendario_aulas', null)
 * save_modelo_documento_template_secure('calendario_aulas', null,
 *   p_expected_revision, p_content jsonb, p_request_id uuid)
 *
 * A API segura é a única responsável por versionar, autorizar e auditar este
 * template. A tela do calendário recebe uma grade já ordenada pelo RPC próprio
 * de exportação; esta interface não consulta aulas nem monta horários.
 */
export const calendarioAulasTemplateService = {
  async getTemplate() {
    const { data, error } = await supabase.rpc('get_modelo_documento_template_secure', {
      p_template_key: CALENDARIO_AULAS_TEMPLATE_KEY,
      p_modality: null,
    });
    if (error) throw error;
    return normalizeEnvelope(data);
  },

  async saveTemplate(input: SalvarModeloCalendarioAulasInput) {
    const { data, error } = await supabase.rpc('save_modelo_documento_template_secure', {
      p_template_key: CALENDARIO_AULAS_TEMPLATE_KEY,
      p_modality: null,
      p_expected_revision: input.revisaoEsperada,
      p_content: input.conteudo,
      p_request_id: input.requestId,
    });
    if (error) throw error;
    return normalizeEnvelope(data);
  },
};
