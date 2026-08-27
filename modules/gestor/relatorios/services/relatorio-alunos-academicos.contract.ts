export type RelatorioAlunosAcademicosModoBackend =
  | 'CURSANDO'
  | 'FINALIZADOS'
  | 'MATRICULA_INICIAL'
  | 'SITUACAO_ALUNO';

export type RelatorioAlunosAcademicosModalidade =
  | 'TECNICO'
  | 'LIVRE'
  | 'ESPECIALIZACAO'
  | 'EAD'
  | 'SUPERIOR';

export type RelatorioAlunosAcademicosStatus =
  | 'PENDENTE'
  | 'ATIVO'
  | 'TRANCADO'
  | 'CANCELADO'
  | 'CONCLUIDO'
  | 'REPROVADO'
  | 'EM_DEPENDENCIA'
  | 'DESISTENTE'
  | 'TRANSFERIDO';

export type RelatorioAlunosAcademicosEmptyReason =
  | 'NO_ROWS'
  | 'NO_ROWS_FOR_MODE'
  | 'FILTERS_EXCLUDE_ROWS'
  | null;

export interface RelatorioAlunosAcademicosFilters {
  modo: RelatorioAlunosAcademicosModoBackend;
  poloId?: string | null;
  modalidade?: RelatorioAlunosAcademicosModalidade | null;
  turmaId?: string | null;
  status?: RelatorioAlunosAcademicosStatus | null;
  busca?: string | null;
  limit?: number;
  offset?: number;
}

export interface RelatorioAlunosAcademicosTurma {
  id: string;
  nome: string;
  codigo: string;
  modalidade: RelatorioAlunosAcademicosModalidade;
}

export interface RelatorioAlunosAcademicosLinha {
  id: string;
  alunoId: string;
  alunoNome: string;
  alunoCpfMascarado: string;
  dataNascimento: string | null;
  pcd: boolean;
  pcdTipo: string | null;
  status: RelatorioAlunosAcademicosStatus;
  dataMatricula: string | null;
  cursoNome: string;
  modalidade: RelatorioAlunosAcademicosModalidade;
  cargaHoraria: number;
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string;
  turmaStatus: string;
  dataInicio: string | null;
  dataFim: string | null;
  poloNome: string;
  certificadoStatus: string | null;
}

export interface RelatorioAlunosAcademicosData {
  meta: {
    modo: RelatorioAlunosAcademicosModoBackend;
    escopo: string;
    generatedAt: string;
  };
  filtrosAplicados: {
    poloId: string | null;
    modalidade: RelatorioAlunosAcademicosModalidade | null;
    turmaId: string | null;
    status: RelatorioAlunosAcademicosStatus | null;
    busca: string | null;
  };
  resumo: {
    totalRegistros: number;
    totalAtivos: number;
    totalConcluidos: number;
    totalPendentes: number;
    totalTecnico: number;
    totalEad: number;
    totalCertificadosFinalizados: number;
    porStatus: Array<{ status: RelatorioAlunosAcademicosStatus; quantidade: number }>;
    porModalidade: Array<{ modalidade: RelatorioAlunosAcademicosModalidade; quantidade: number }>;
  };
  turmasDisponiveis: RelatorioAlunosAcademicosTurma[];
  linhas: RelatorioAlunosAcademicosLinha[];
  pageInfo: {
    offset: number;
    limit: number;
    returned: number;
    total: number;
    hasMore: boolean;
  };
  emptyReason: RelatorioAlunosAcademicosEmptyReason;
}

type RawRecord = Record<string, unknown>;

const hasOwn = (record: RawRecord, field: string) => (
  Object.prototype.hasOwnProperty.call(record, field)
);

const requireFields = (record: RawRecord, fields: string[], area: string) => {
  if (fields.some((field) => !hasOwn(record, field))) {
    throw new Error(`O relatório acadêmico retornou ${area} incompleto.`);
  }
};

const asRecord = (value: unknown): RawRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as RawRecord : {}
);

const asArray = (value: unknown): RawRecord[] => (
  Array.isArray(value) ? value.map(asRecord) : []
);

const asString = (value: unknown, field: string) => {
  if (typeof value !== 'string') {
    throw new Error(`O relatório acadêmico retornou ${field} inválido.`);
  }
  return value.trim();
};

const asNullableString = (value: unknown, field: string) => {
  if (value === null) return null;
  const normalized = asString(value, field);
  return normalized || null;
};

const asNumber = (value: unknown, field: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`O relatório acadêmico retornou ${field} inválido.`);
  }
  return value;
};

const asNonNegativeInteger = (value: unknown, field: string) => {
  const normalized = asNumber(value, field);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error(`O relatório acadêmico retornou ${field} inválido.`);
  }
  return normalized;
};

const asBoolean = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') {
    throw new Error(`O relatório acadêmico retornou ${field} inválido.`);
  }
  return value;
};

const asModo = (value: unknown): RelatorioAlunosAcademicosModoBackend => {
  const normalized = asString(value, 'meta.modo').toUpperCase();
  if (
    normalized === 'CURSANDO'
    || normalized === 'FINALIZADOS'
    || normalized === 'MATRICULA_INICIAL'
    || normalized === 'SITUACAO_ALUNO'
  ) return normalized;
  throw new Error('O relatório acadêmico retornou um modo desconhecido.');
};

const asModalidade = (value: unknown): RelatorioAlunosAcademicosModalidade => {
  const normalized = asString(value, 'modalidade').toUpperCase();
  if (
    normalized === 'TECNICO'
    || normalized === 'LIVRE'
    || normalized === 'ESPECIALIZACAO'
    || normalized === 'EAD'
    || normalized === 'SUPERIOR'
  ) return normalized;
  throw new Error('O relatório acadêmico retornou uma modalidade desconhecida.');
};

const asStatus = (value: unknown): RelatorioAlunosAcademicosStatus => {
  const normalized = asString(value, 'status').toUpperCase();
  if (
    normalized === 'PENDENTE'
    || normalized === 'ATIVO'
    || normalized === 'TRANCADO'
    || normalized === 'CANCELADO'
    || normalized === 'CONCLUIDO'
    || normalized === 'REPROVADO'
    || normalized === 'EM_DEPENDENCIA'
    || normalized === 'DESISTENTE'
    || normalized === 'TRANSFERIDO'
  ) return normalized;
  throw new Error('O relatório acadêmico retornou uma situação desconhecida.');
};

const asMaskedCpf = (value: unknown) => {
  const normalized = asString(value, 'linhas.aluno_cpf_mascarado');
  if (
    normalized === '—'
    || normalized === '***'
    || /^\*\*\*\.\d{3}\.\d{3}-\*\*$/.test(normalized)
  ) return normalized;
  throw new Error('O relatório acadêmico retornou um CPF sem mascaramento canônico.');
};

const parsePayload = (value: unknown): RawRecord => {
  let payload = Array.isArray(value) ? value[0] : value;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      throw new Error('O relatório acadêmico retornou um contrato inválido.');
    }
  }
  const record = asRecord(payload);
  if (!Object.keys(record).length) {
    throw new Error('O relatório acadêmico retornou um contrato vazio.');
  }
  return record;
};

const rowFields = [
  'id', 'aluno_id', 'aluno_nome', 'aluno_cpf_mascarado', 'data_nascimento',
  'pcd', 'pcd_tipo', 'status', 'data_matricula', 'curso_nome',
  'modalidade', 'carga_horaria', 'turma_id', 'turma_nome', 'turma_codigo',
  'turma_status', 'data_inicio', 'data_fim', 'polo_nome', 'certificado_status',
];

const mapRow = (item: RawRecord): RelatorioAlunosAcademicosLinha => {
  requireFields(item, rowFields, 'uma linha');
  return {
    id: asString(item.id, 'linhas.id'),
    alunoId: asString(item.aluno_id, 'linhas.aluno_id'),
    alunoNome: asString(item.aluno_nome, 'linhas.aluno_nome'),
    alunoCpfMascarado: asMaskedCpf(item.aluno_cpf_mascarado),
    dataNascimento: asNullableString(item.data_nascimento, 'linhas.data_nascimento'),
    pcd: asBoolean(item.pcd, 'linhas.pcd'),
    pcdTipo: asNullableString(item.pcd_tipo, 'linhas.pcd_tipo'),
    status: asStatus(item.status),
    dataMatricula: asNullableString(item.data_matricula, 'linhas.data_matricula'),
    cursoNome: asString(item.curso_nome, 'linhas.curso_nome'),
    modalidade: asModalidade(item.modalidade),
    cargaHoraria: asNonNegativeInteger(item.carga_horaria, 'linhas.carga_horaria'),
    turmaId: asString(item.turma_id, 'linhas.turma_id'),
    turmaNome: asString(item.turma_nome, 'linhas.turma_nome'),
    turmaCodigo: asString(item.turma_codigo, 'linhas.turma_codigo'),
    turmaStatus: asString(item.turma_status, 'linhas.turma_status'),
    dataInicio: asNullableString(item.data_inicio, 'linhas.data_inicio'),
    dataFim: asNullableString(item.data_fim, 'linhas.data_fim'),
    poloNome: asString(item.polo_nome, 'linhas.polo_nome'),
    certificadoStatus: asNullableString(item.certificado_status, 'linhas.certificado_status'),
  };
};

const assertInvariants = (result: RelatorioAlunosAcademicosData) => {
  const { resumo, pageInfo, linhas, meta, filtrosAplicados, emptyReason } = result;
  const statusTotal = resumo.porStatus.reduce((sum, item) => sum + item.quantidade, 0);
  const modalidadeTotal = resumo.porModalidade.reduce((sum, item) => sum + item.quantidade, 0);
  const statusCount = (status: RelatorioAlunosAcademicosStatus) => (
    resumo.porStatus.find((item) => item.status === status)?.quantidade || 0
  );
  const modalidadeCount = (modalidade: RelatorioAlunosAcademicosModalidade) => (
    resumo.porModalidade.find((item) => item.modalidade === modalidade)?.quantidade || 0
  );

  if (
    new Set(resumo.porStatus.map((item) => item.status)).size !== resumo.porStatus.length
    || new Set(resumo.porModalidade.map((item) => item.modalidade)).size !== resumo.porModalidade.length
  ) {
    throw new Error('O relatório acadêmico retornou categorias agregadas repetidas.');
  }

  if (!meta.escopo || !meta.generatedAt) throw new Error('O relatório acadêmico retornou metadados incompletos.');
  if (pageInfo.returned !== linhas.length || pageInfo.total !== resumo.totalRegistros) {
    throw new Error('O relatório acadêmico retornou paginação divergente do conteúdo.');
  }
  if (pageInfo.limit < 1 || pageInfo.returned > pageInfo.limit || pageInfo.returned > pageInfo.total) {
    throw new Error('O relatório acadêmico retornou limites de paginação inválidos.');
  }
  if (pageInfo.hasMore !== (pageInfo.offset + pageInfo.returned < pageInfo.total)) {
    throw new Error('O relatório acadêmico retornou indicador de continuação inválido.');
  }
  if (statusTotal !== resumo.totalRegistros || modalidadeTotal !== resumo.totalRegistros) {
    throw new Error('O relatório acadêmico retornou agregações divergentes do total.');
  }
  if (
    resumo.totalAtivos !== statusCount('ATIVO')
    || resumo.totalConcluidos !== statusCount('CONCLUIDO')
    || resumo.totalPendentes !== statusCount('PENDENTE')
    || resumo.totalTecnico !== modalidadeCount('TECNICO')
    || resumo.totalEad !== modalidadeCount('EAD')
    || resumo.totalCertificadosFinalizados > resumo.totalRegistros
  ) throw new Error('O relatório acadêmico retornou KPIs divergentes das agregações.');
  if (linhas.some((item) => statusCount(item.status) === 0 || modalidadeCount(item.modalidade) === 0)) {
    throw new Error('O relatório acadêmico retornou linhas divergentes das agregações.');
  }
  if (
    (filtrosAplicados.status !== null
      && linhas.some((item) => item.status !== filtrosAplicados.status))
    || (filtrosAplicados.modalidade !== null
      && linhas.some((item) => item.modalidade !== filtrosAplicados.modalidade))
    || (filtrosAplicados.turmaId !== null
      && linhas.some((item) => item.turmaId !== filtrosAplicados.turmaId))
  ) {
    throw new Error('O relatório acadêmico retornou linhas fora dos filtros aplicados.');
  }
  if ((resumo.totalRegistros === 0) !== (emptyReason !== null)) {
    throw new Error('O relatório acadêmico retornou motivo de vazio inconsistente.');
  }
  if (
    meta.modo !== 'MATRICULA_INICIAL'
    && linhas.some((item) => item.dataNascimento !== null || item.pcd || item.pcdTipo !== null)
  ) {
    throw new Error('O relatório acadêmico retornou dados cadastrais excessivos para este modo.');
  }
  if (meta.modo === 'CURSANDO') {
    if (filtrosAplicados.status !== 'ATIVO' || resumo.totalAtivos !== resumo.totalRegistros) {
      throw new Error('O relatório de alunos cursando não está restrito a ATIVO.');
    }
    if (linhas.some((item) => item.status !== 'ATIVO')) {
      throw new Error('O relatório de alunos cursando retornou situação não ativa.');
    }
  }
  if (meta.modo === 'FINALIZADOS') {
    if (filtrosAplicados.status !== 'CONCLUIDO' || resumo.totalConcluidos !== resumo.totalRegistros) {
      throw new Error('O relatório de alunos finalizados não está restrito a CONCLUIDO.');
    }
    if (linhas.some((item) => item.status !== 'CONCLUIDO')) {
      throw new Error('O relatório de alunos finalizados retornou situação não concluída.');
    }
  }
};

export const mapRelatorioAlunosAcademicos = (value: unknown): RelatorioAlunosAcademicosData => {
  const record = parsePayload(value);
  requireFields(
    record,
    ['meta', 'filtros_aplicados', 'resumo', 'turmas_disponiveis', 'linhas', 'page_info', 'empty_reason'],
    'a raiz do contrato',
  );
  const meta = asRecord(record.meta);
  const filters = asRecord(record.filtros_aplicados);
  const summary = asRecord(record.resumo);
  const pageInfo = asRecord(record.page_info);

  requireFields(meta, ['modo', 'escopo', 'generated_at'], 'metadados');
  requireFields(filters, ['polo_id', 'modalidade', 'turma_id', 'status', 'busca'], 'filtros');
  requireFields(summary, [
    'total_registros', 'total_ativos', 'total_concluidos', 'total_pendentes',
    'total_tecnico', 'total_ead', 'total_certificados_finalizados',
    'por_status', 'por_modalidade',
  ], 'resumo');
  requireFields(pageInfo, ['offset', 'limit', 'returned', 'total', 'has_more'], 'paginação');

  if (
    !Object.keys(meta).length
    || !Object.keys(summary).length
    || !Object.keys(pageInfo).length
    || !Array.isArray(summary.por_status)
    || !Array.isArray(summary.por_modalidade)
    || !Array.isArray(record.turmas_disponiveis)
    || !Array.isArray(record.linhas)
  ) {
    throw new Error('O relatório acadêmico retornou um contrato incompleto.');
  }

  const emptyReason = record.empty_reason === null
    ? null
    : asString(record.empty_reason, 'empty_reason');
  if (
    emptyReason !== null
    && emptyReason !== 'NO_ROWS'
    && emptyReason !== 'NO_ROWS_FOR_MODE'
    && emptyReason !== 'FILTERS_EXCLUDE_ROWS'
  ) throw new Error('O relatório acadêmico retornou um motivo de vazio desconhecido.');

  const rows = asArray(record.linhas).map(mapRow);
  if (rows.some((item) => !item.id || !item.alunoId || !item.alunoNome || !item.turmaId)) {
    throw new Error('O relatório acadêmico retornou uma linha incompleta.');
  }

  const result: RelatorioAlunosAcademicosData = {
    meta: {
      modo: asModo(meta.modo),
      escopo: asString(meta.escopo, 'meta.escopo'),
      generatedAt: asString(meta.generated_at, 'meta.generated_at'),
    },
    filtrosAplicados: {
      poloId: asNullableString(filters.polo_id, 'filtros.polo_id'),
      modalidade: filters.modalidade == null ? null : asModalidade(filters.modalidade),
      turmaId: asNullableString(filters.turma_id, 'filtros.turma_id'),
      status: filters.status == null ? null : asStatus(filters.status),
      busca: asNullableString(filters.busca, 'filtros.busca'),
    },
    resumo: {
      totalRegistros: asNonNegativeInteger(summary.total_registros, 'resumo.total_registros'),
      totalAtivos: asNonNegativeInteger(summary.total_ativos, 'resumo.total_ativos'),
      totalConcluidos: asNonNegativeInteger(summary.total_concluidos, 'resumo.total_concluidos'),
      totalPendentes: asNonNegativeInteger(summary.total_pendentes, 'resumo.total_pendentes'),
      totalTecnico: asNonNegativeInteger(summary.total_tecnico, 'resumo.total_tecnico'),
      totalEad: asNonNegativeInteger(summary.total_ead, 'resumo.total_ead'),
      totalCertificadosFinalizados: asNonNegativeInteger(
        summary.total_certificados_finalizados,
        'resumo.total_certificados_finalizados',
      ),
      porStatus: asArray(summary.por_status).map((item) => ({
        status: asStatus(item.status),
        quantidade: asNonNegativeInteger(item.quantidade, 'resumo.por_status.quantidade'),
      })),
      porModalidade: asArray(summary.por_modalidade).map((item) => ({
        modalidade: asModalidade(item.modalidade),
        quantidade: asNonNegativeInteger(item.quantidade, 'resumo.por_modalidade.quantidade'),
      })),
    },
    turmasDisponiveis: asArray(record.turmas_disponiveis).map((item) => ({
      id: asString(item.id, 'turmas_disponiveis.id'),
      nome: asString(item.nome, 'turmas_disponiveis.nome'),
      codigo: asString(item.codigo, 'turmas_disponiveis.codigo'),
      modalidade: asModalidade(item.modalidade),
    })),
    linhas: rows,
    pageInfo: {
      offset: asNonNegativeInteger(pageInfo.offset, 'page_info.offset'),
      limit: asNonNegativeInteger(pageInfo.limit, 'page_info.limit'),
      returned: asNonNegativeInteger(pageInfo.returned, 'page_info.returned'),
      total: asNonNegativeInteger(pageInfo.total, 'page_info.total'),
      hasMore: asBoolean(pageInfo.has_more, 'page_info.has_more'),
    },
    emptyReason: emptyReason as RelatorioAlunosAcademicosEmptyReason,
  };

  if (result.turmasDisponiveis.some((item) => !item.id || !item.nome)) {
    throw new Error('O relatório acadêmico retornou uma turma incompleta.');
  }
  if (new Set(result.turmasDisponiveis.map((item) => item.id)).size !== result.turmasDisponiveis.length) {
    throw new Error('O relatório acadêmico retornou turmas repetidas.');
  }
  assertInvariants(result);
  return result;
};
