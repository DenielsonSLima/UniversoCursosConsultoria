import { supabase } from '../../../lib/supabase';
import { getSignatureSignedUrl } from '../../gestor/configuracoes/assinaturas/assinaturas-registry.service';
import type {
  PlanoCursoConclusaoInput,
  PlanoCursoDocumentoResponse,
  PlanoCursoGestaoStatus,
  PlanoCursoProfessorResumo,
  PlanoCursoSaveInput,
  PlanoCursoStatus,
  PlanoCursoWorkspace,
} from './plano-curso.types';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isStatus = (value: unknown): value is PlanoCursoStatus => (
  value === 'AUSENTE' || value === 'RASCUNHO' || value === 'CONCLUIDO'
);

const isStringOrNull = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const isNumberOrNull = (value: unknown): value is number | null => (
  value === null || typeof value === 'number'
);

const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((item) => typeof item === 'string')
);

const hasStringFields = (value: Record<string, unknown>, fields: string[]) => (
  fields.every((field) => typeof value[field] === 'string')
);

const hasNullableStringFields = (value: Record<string, unknown>, fields: string[]) => (
  fields.every((field) => isStringOrNull(value[field]))
);

const hasResumoFields = (value: unknown): value is PlanoCursoProfessorResumo => {
  if (!isRecord(value)) return false;
  return isStringOrNull(value.planoId)
    && isStatus(value.status)
    && typeof value.revisao === 'number'
    && typeof value.turmaId === 'string'
    && typeof value.disciplinaId === 'string'
    && typeof value.professorId === 'string'
    && typeof value.turmaNome === 'string'
    && typeof value.turmaCodigo === 'string'
    && typeof value.cursoNome === 'string'
    && typeof value.poloId === 'string'
    && typeof value.poloNome === 'string'
    && typeof value.disciplinaNome === 'string'
    && typeof value.professorNome === 'string'
    && typeof value.totalDias === 'number'
    && typeof value.totalAulas === 'number'
    && isStringOrNull(value.primeiraAula)
    && isStringOrNull(value.ultimaAula)
    && isStringOrNull(value.updatedAt)
    && isNumberOrNull(value.templateRevision)
    && isStringOrNull(value.documentoFingerprint);
};

const hasAulaFields = (value: unknown) => {
  if (!isRecord(value)) return false;
  return typeof value.aulaId === 'string'
    && typeof value.dataAula === 'string'
    && typeof value.dataExibicao === 'string'
    && typeof value.sessao === 'string'
    && typeof value.titulo === 'string'
    && typeof value.cargaHoraria === 'number'
    && isStringOrNull(value.horaInicio)
    && isStringOrNull(value.horaFim)
    && typeof value.conteudo === 'string';
};

const requireProfessorList = (value: unknown): PlanoCursoProfessorResumo[] => {
  if (!Array.isArray(value) || !value.every(hasResumoFields)) {
    throw new Error('O servidor não retornou a lista canônica dos planos de curso.');
  }
  return value;
};

const requireWorkspace = (value: unknown): PlanoCursoWorkspace => {
  const workspace = value as Record<string, unknown>;
  if (
    !hasResumoFields(value)
    || !isStringArray(workspace.diasAulas)
    || !isStringArray(workspace.objetivos)
    || !isStringArray(workspace.criteriosAvaliacao)
    || !isStringArray(workspace.insumosRecursos)
    || !Array.isArray(workspace.aulas)
    || !workspace.aulas.every(hasAulaFields)
    || !isStringOrNull(workspace.concluidoEm)
    || typeof workspace.canEdit !== 'boolean'
  ) {
    throw new Error('O servidor não retornou o Plano de Curso canônico completo.');
  }
  return value as unknown as PlanoCursoWorkspace;
};

const hasGestaoStatusFields = (value: unknown): value is PlanoCursoGestaoStatus => {
  if (!isRecord(value)) return false;
  return typeof value.disciplinaId === 'string'
    && isStringOrNull(value.professorId)
    && isStringOrNull(value.professorNome)
    && isStringOrNull(value.planoId)
    && isStatus(value.status)
    && typeof value.revisao === 'number'
    && isStringOrNull(value.updatedAt)
    && isNumberOrNull(value.templateRevision)
    && isStringOrNull(value.documentoFingerprint);
};

const requireGestaoStatusList = (value: unknown): PlanoCursoGestaoStatus[] => {
  if (!Array.isArray(value) || !value.every(hasGestaoStatusFields)) {
    throw new Error('O servidor não retornou os estados canônicos dos planos de curso.');
  }
  return value;
};

const requireDocument = (value: unknown): PlanoCursoDocumentoResponse => {
  if (!isRecord(value) || !isRecord(value.documento)) {
    throw new Error('O servidor não retornou o documento canônico do Plano de Curso.');
  }
  const documento = value.documento;
  const cabecalho = documento.cabecalho;
  const instituicao = documento.instituicao;
  const marcaDagua = documento.marcaDagua;
  const componente = documento.componente;
  const docente = documento.docente;
  const assinatura = isRecord(docente) ? docente.assinatura : null;
  const localData = documento.localData;
  const rotulos = documento.rotulos;
  if (
    value.status !== 'CONCLUIDO'
    || typeof value.planoId !== 'string'
    || typeof value.revisao !== 'number'
    || typeof value.templateRevision !== 'number'
    || typeof value.documentoFingerprint !== 'string'
    || typeof documento.arquivoNome !== 'string'
    || typeof documento.titulo !== 'string'
    || typeof documento.subtitulo !== 'string'
    || documento.orientacao !== 'A4_RETRATO'
    || typeof documento.templateRevision !== 'number'
    || (documento.template !== null && !isRecord(documento.template))
    || !isRecord(cabecalho)
    || !hasStringFields(cabecalho, ['titulo', 'subtitulo', 'instituicao'])
    || !hasNullableStringFields(cabecalho, ['logoUrl', 'logoDataUri'])
    || !isRecord(rotulos)
    || !hasStringFields(rotulos, [
      'curso',
      'turma',
      'componenteCurricular',
      'docente',
      'diasAulas',
      'objetivos',
      'objetivosDisciplina',
      'criteriosAvaliacao',
      'insumosRecursos',
      'conteudoProgramatico',
      'dataLocal',
      'assinaturaDocente',
    ])
    || typeof documento.instrucoesConteudo !== 'string'
    || !isRecord(instituicao)
    || !hasStringFields(instituicao, ['poloId', 'nome', 'razaoSocial', 'cnpj', 'endereco', 'cidade', 'uf'])
    || !hasNullableStringFields(instituicao, ['logoUrl', 'logoDataUri'])
    || !isRecord(marcaDagua)
    || typeof marcaDagua.exibir !== 'boolean'
    || typeof marcaDagua.texto !== 'string'
    || !hasNullableStringFields(marcaDagua, ['url', 'dataUri'])
    || typeof marcaDagua.opacidade !== 'number'
    || typeof marcaDagua.escala !== 'number'
    || typeof marcaDagua.rotacionar !== 'boolean'
    || !isRecord(componente)
    || !hasStringFields(componente, ['turmaId', 'turmaNome', 'turmaCodigo', 'cursoNome', 'disciplinaId', 'disciplinaNome'])
    || !isRecord(docente)
    || !hasStringFields(docente, ['id', 'nome'])
    || !isRecord(assinatura)
    || typeof assinatura.exibir !== 'boolean'
    || !hasNullableStringFields(assinatura, ['path', 'url'])
    || !isRecord(localData)
    || !hasStringFields(localData, ['cidade', 'uf', 'dataISO', 'dataExibicao', 'texto'])
    || !Array.isArray(documento.paginas)
    || documento.paginas.length === 0
    || !documento.paginas.every((pagina) => (
      isRecord(pagina)
      && typeof pagina.numero === 'number'
      && (pagina.tipo === 'IDENTIFICACAO' || pagina.tipo === 'CONTEUDO')
      && Array.isArray(pagina.encontros)
      && pagina.encontros.every(hasAulaFields)
    ))
    || !isStringArray(documento.objetivos)
    || !isStringArray(documento.criteriosAvaliacao)
    || !isStringArray(documento.insumosRecursos)
    || !isStringArray(documento.diasAulas)
    || typeof documento.totalDias !== 'number'
    || typeof documento.totalAulas !== 'number'
    || typeof documento.totalPaginas !== 'number'
    || typeof documento.emitidoEm !== 'string'
    || documento.templateRevision !== value.templateRevision
  ) {
    throw new Error('O payload do documento de Plano de Curso está incompleto.');
  }
  return value as unknown as PlanoCursoDocumentoResponse;
};

const unwrap = async <T>(
  request: PromiseLike<{ data: unknown; error: unknown }>,
  parser: (value: unknown) => T,
) => {
  const { data, error } = await request;
  if (error) throw error;
  return parser(data);
};

export const planoCursoService = {
  listProfessor(poloId: string) {
    return unwrap(
      supabase.rpc('listar_planos_curso_professor_secure', { p_polo_id: poloId }),
      requireProfessorList,
    );
  },

  getProfessorWorkspace(turmaId: string, disciplinaId: string) {
    return unwrap(
      supabase.rpc('obter_plano_curso_professor_secure', {
        p_turma_id: turmaId,
        p_disciplina_id: disciplinaId,
      }),
      requireWorkspace,
    );
  },

  saveProfessor(input: PlanoCursoSaveInput) {
    return unwrap(
      supabase.rpc('salvar_plano_curso_professor_secure', {
        p_turma_id: input.turmaId,
        p_disciplina_id: input.disciplinaId,
        p_expected_revision: input.expectedRevision,
        p_objetivos: input.objetivos,
        p_criterios_avaliacao: input.criteriosAvaliacao,
        p_insumos_recursos: input.insumosRecursos,
        p_conteudos_aulas: input.conteudosAulas,
      }),
      requireWorkspace,
    );
  },

  concludeProfessor(input: PlanoCursoConclusaoInput) {
    return unwrap(
      supabase.rpc('concluir_plano_curso_professor_secure', {
        p_plano_id: input.planoId,
        p_expected_revision: input.expectedRevision,
      }),
      requireWorkspace,
    );
  },

  listGestao(turmaId: string) {
    return unwrap(
      supabase.rpc('listar_planos_curso_gestao_secure', { p_turma_id: turmaId }),
      requireGestaoStatusList,
    );
  },

  getGestaoWorkspace(turmaId: string, disciplinaId: string, professorId?: string | null) {
    return unwrap(
      supabase.rpc('obter_plano_curso_gestao_secure', {
        p_turma_id: turmaId,
        p_disciplina_id: disciplinaId,
        p_professor_id: professorId || null,
      }),
      requireWorkspace,
    );
  },

  async getDocument(planoId: string) {
    const response = await unwrap(
      supabase.rpc('preparar_plano_curso_documento_secure', { p_plano_id: planoId }),
      requireDocument,
    );
    const signature = response.documento.docente.assinatura;
    if (!signature.exibir || signature.url?.trim() || !signature.path) return response;

    const signedUrl = await getSignatureSignedUrl(signature.path);
    return {
      ...response,
      documento: {
        ...response.documento,
        docente: {
          ...response.documento.docente,
          assinatura: { ...signature, url: signedUrl },
        },
      },
    };
  },
};
