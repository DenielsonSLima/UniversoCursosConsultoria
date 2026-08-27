export type RelatorioTurmasModalidade =
  | 'TECNICO'
  | 'LIVRE'
  | 'ESPECIALIZACAO'
  | 'EAD'
  | 'SUPERIOR';

export type RelatorioTurmasStatus =
  | 'PLANEJADA'
  | 'INSCRICOES_ABERTAS'
  | 'EM_ANDAMENTO'
  | 'FINALIZADA';

export type RelatorioTurmasEmptyReason = 'NO_ROWS' | 'FILTERS_EXCLUDE_ROWS' | null;

export interface RelatorioTurmasFilters {
  poloId?: string | null;
  modalidade?: RelatorioTurmasModalidade | null;
  status?: RelatorioTurmasStatus | null;
  busca?: string | null;
  limit?: number;
  offset?: number;
}

export interface RelatorioTurmasLinha {
  id: string;
  codigo: string;
  nome: string;
  status: RelatorioTurmasStatus;
  turno: string;
  dataInicio: string | null;
  dataPrevisaoTermino: string | null;
  cursoNome: string;
  modalidade: RelatorioTurmasModalidade;
  poloNome: string;
  alunosAtivos: number;
}

export interface RelatorioTurmasData {
  meta: { escopo: string; generatedAt: string };
  filtrosAplicados: {
    poloId: string | null;
    modalidade: RelatorioTurmasModalidade | null;
    status: RelatorioTurmasStatus | null;
    busca: string | null;
  };
  resumo: {
    totalTurmas: number;
    totalAlunosAtivos: number;
    porStatus: Array<{
      status: RelatorioTurmasStatus;
      quantidadeTurmas: number;
      quantidadeAlunosAtivos: number;
    }>;
  };
  linhas: RelatorioTurmasLinha[];
  pageInfo: {
    offset: number;
    limit: number;
    returned: number;
    total: number;
    hasMore: boolean;
  };
  emptyReason: RelatorioTurmasEmptyReason;
}

type RawRecord = Record<string, unknown>;

const asRecord = (value: unknown): RawRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as RawRecord : {}
);

const hasOwn = (record: RawRecord, field: string) => (
  Object.prototype.hasOwnProperty.call(record, field)
);

const requireRecord = (value: unknown, field: string): RawRecord => {
  const record = asRecord(value);
  if (!Object.keys(record).length) {
    throw new Error(`O relatório de turmas retornou ${field} inválido.`);
  }
  return record;
};

const requireFields = (record: RawRecord, field: string, fields: string[]) => {
  const missing = fields.filter((item) => !hasOwn(record, item));
  if (missing.length) {
    throw new Error(`O relatório de turmas retornou ${field} incompleto.`);
  }
};

const asArray = (value: unknown, field: string): RawRecord[] => {
  if (!Array.isArray(value)) {
    throw new Error(`O relatório de turmas retornou ${field} inválido.`);
  }
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`O relatório de turmas retornou ${field} inválido.`);
    }
    return item as RawRecord;
  });
};

const asString = (value: unknown) => String(value ?? '').trim();

const asNullableString = (value: unknown) => {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    throw new Error('O relatório de turmas retornou um texto opcional inválido.');
  }
  const normalized = asString(value);
  return normalized || null;
};

const asEmptyReason = (value: unknown): RelatorioTurmasEmptyReason => {
  const normalized = asNullableString(value);
  if (normalized === null) return null;
  if (normalized === 'NO_ROWS') return 'NO_ROWS';
  if (normalized === 'FILTERS_EXCLUDE_ROWS') return 'FILTERS_EXCLUDE_ROWS';

  throw new Error('O relatório de turmas retornou um motivo de vazio desconhecido.');
};

const asRequiredString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`O relatório de turmas retornou ${field} inválido.`);
  }
  return value.trim();
};

const asNonNegativeInteger = (value: unknown, field: string) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`O relatório de turmas retornou ${field} inválido.`);
  }
  return value;
};

const asPositiveInteger = (value: unknown, field: string) => {
  const normalized = asNonNegativeInteger(value, field);
  if (normalized === 0) {
    throw new Error(`O relatório de turmas retornou ${field} inválido.`);
  }
  return normalized;
};

const asBoolean = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') {
    throw new Error(`O relatório de turmas retornou ${field} inválido.`);
  }
  return value;
};

const asModalidade = (value: unknown): RelatorioTurmasModalidade => {
  const normalized = asString(value).toUpperCase();
  if (
    normalized === 'TECNICO'
    || normalized === 'LIVRE'
    || normalized === 'ESPECIALIZACAO'
    || normalized === 'EAD'
    || normalized === 'SUPERIOR'
  ) return normalized;
  throw new Error('O relatório de turmas retornou uma modalidade desconhecida.');
};

const asStatus = (value: unknown): RelatorioTurmasStatus => {
  const normalized = asString(value).toUpperCase();
  if (
    normalized === 'PLANEJADA'
    || normalized === 'INSCRICOES_ABERTAS'
    || normalized === 'EM_ANDAMENTO'
    || normalized === 'FINALIZADA'
  ) return normalized;
  throw new Error('O relatório de turmas retornou uma situação desconhecida.');
};

const parsePayload = (value: unknown): RawRecord => {
  let payload = Array.isArray(value) ? value[0] : value;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      throw new Error('O relatório de turmas retornou um contrato inválido.');
    }
  }
  const record = asRecord(payload);
  if (!Object.keys(record).length) {
    throw new Error('O relatório de turmas retornou um contrato vazio.');
  }
  return record;
};

export const mapRelatorioTurmas = (value: unknown): RelatorioTurmasData => {
  const record = parsePayload(value);
  requireFields(record, 'o contrato', [
    'meta',
    'filtros_aplicados',
    'resumo',
    'linhas',
    'page_info',
    'empty_reason',
  ]);
  const meta = requireRecord(record.meta, 'meta');
  const filters = requireRecord(record.filtros_aplicados, 'filtros_aplicados');
  const summary = requireRecord(record.resumo, 'resumo');
  const pageInfo = requireRecord(record.page_info, 'page_info');
  requireFields(meta, 'meta', ['escopo', 'generated_at']);
  requireFields(filters, 'filtros_aplicados', ['polo_id', 'modalidade', 'status', 'busca']);
  requireFields(summary, 'resumo', ['total_turmas', 'total_alunos_ativos', 'por_status']);
  requireFields(pageInfo, 'page_info', ['offset', 'limit', 'returned', 'total', 'has_more']);

  const emptyReason = asEmptyReason(record.empty_reason);

  const rows = asArray(record.linhas, 'linhas').map((item) => {
    requireFields(item, 'uma linha', [
      'id',
      'codigo',
      'nome',
      'status',
      'turno',
      'data_inicio',
      'data_previsao_termino',
      'curso_nome',
      'modalidade',
      'polo_nome',
      'alunos_ativos',
    ]);
    return {
      id: asRequiredString(item.id, 'linhas.id'),
      codigo: asRequiredString(item.codigo, 'linhas.codigo'),
      nome: asRequiredString(item.nome, 'linhas.nome'),
      status: asStatus(item.status),
      turno: asRequiredString(item.turno, 'linhas.turno'),
      dataInicio: asNullableString(item.data_inicio),
      dataPrevisaoTermino: asNullableString(item.data_previsao_termino),
      cursoNome: asRequiredString(item.curso_nome, 'linhas.curso_nome'),
      modalidade: asModalidade(item.modalidade),
      poloNome: asRequiredString(item.polo_nome, 'linhas.polo_nome'),
      alunosAtivos: asNonNegativeInteger(item.alunos_ativos, 'linhas.alunos_ativos'),
    };
  });

  const statusCounts = asArray(summary.por_status, 'resumo.por_status').map((item) => {
    requireFields(item, 'resumo.por_status', [
      'status',
      'quantidade_turmas',
      'quantidade_alunos_ativos',
    ]);
    return {
      status: asStatus(item.status),
      quantidadeTurmas: asNonNegativeInteger(
        item.quantidade_turmas,
        'resumo.por_status.quantidade_turmas',
      ),
      quantidadeAlunosAtivos: asNonNegativeInteger(
        item.quantidade_alunos_ativos,
        'resumo.por_status.quantidade_alunos_ativos',
      ),
    };
  });
  const totalTurmas = asNonNegativeInteger(summary.total_turmas, 'resumo.total_turmas');
  const totalAlunosAtivos = asNonNegativeInteger(
    summary.total_alunos_ativos,
    'resumo.total_alunos_ativos',
  );
  const offset = asNonNegativeInteger(pageInfo.offset, 'page_info.offset');
  const limit = asPositiveInteger(pageInfo.limit, 'page_info.limit');
  const returned = asNonNegativeInteger(pageInfo.returned, 'page_info.returned');
  const pageTotal = asNonNegativeInteger(pageInfo.total, 'page_info.total');
  const hasMore = asBoolean(pageInfo.has_more, 'page_info.has_more');

  if (
    returned !== rows.length
    || pageTotal !== totalTurmas
    || hasMore !== (offset + returned < pageTotal)
    || statusCounts.reduce((total, item) => total + item.quantidadeTurmas, 0) !== totalTurmas
    || statusCounts.reduce((total, item) => total + item.quantidadeAlunosAtivos, 0) !== totalAlunosAtivos
    || (totalTurmas === 0) !== (emptyReason !== null)
  ) {
    throw new Error('O relatório de turmas retornou totais ou paginação inconsistentes.');
  }

  return {
    meta: {
      escopo: asRequiredString(meta.escopo, 'meta.escopo'),
      generatedAt: asRequiredString(meta.generated_at, 'meta.generated_at'),
    },
    filtrosAplicados: {
      poloId: asNullableString(filters.polo_id),
      modalidade: filters.modalidade === null || filters.modalidade === undefined
        ? null
        : asModalidade(filters.modalidade),
      status: filters.status === null || filters.status === undefined
        ? null
        : asStatus(filters.status),
      busca: asNullableString(filters.busca),
    },
    resumo: {
      totalTurmas,
      totalAlunosAtivos,
      porStatus: statusCounts,
    },
    linhas: rows,
    pageInfo: {
      offset,
      limit,
      returned,
      total: pageTotal,
      hasMore,
    },
    emptyReason,
  };
};
