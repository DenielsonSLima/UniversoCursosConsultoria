import { supabase } from '../../../../../lib/supabase';
import type {
  CalendarioAulasCabecalhoInstitucional,
  CalendarioAulasCabecalhosTabela,
  CalendarioAulasDocumento,
  CalendarioAulasTurmaModulo,
  CalendarioAulasExportacaoPayload,
  CalendarioAulasExportacaoStatus,
  CalendarioAulasLinha,
  CalendarioAulasModalidade,
  CalendarioAulasTurma,
  PrepararCalendarioAulasExportacaoInput,
} from '../types';

const MODALIDADES = new Set<CalendarioAulasModalidade>([
  'TECNICO',
  'LIVRE',
  'SUPERIOR',
  'EAD',
]);

const STATUS_VALIDOS = new Set<CalendarioAulasExportacaoStatus>([
  'PRONTO',
  'SEM_GRADE',
  'EAD_SEM_GRADE',
]);

const parseJsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const asRecord = (value: unknown, context: string): Record<string, unknown> => {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`A resposta canônica de ${context} não possui o formato esperado.`);
  }
  return parsed as Record<string, unknown>;
};

const asRows = (value: unknown, context: string): Record<string, unknown>[] => {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) {
    throw new Error(`A lista canônica de ${context} não possui o formato esperado.`);
  }
  return parsed.map((row, index) => asRecord(row, `${context} (${index + 1})`));
};

const requiredString = (record: Record<string, unknown>, key: string, context: string) => {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`A resposta canônica de ${context} não informou “${key}”.`);
  }
  return value;
};

const optionalString = (record: Record<string, unknown>, key: string) => (
  typeof record[key] === 'string' && record[key]?.trim() ? record[key] as string : null
);

const optionalNumber = (record: Record<string, unknown>, key: string) => (
  typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] as number : null
);

const optionalBoolean = (record: Record<string, unknown>, key: string) => (
  typeof record[key] === 'boolean' ? record[key] as boolean : null
);

const toMonthReference = (mesReferencia: string): string | null => {
  const [yearText, monthText] = mesReferencia.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};

const shiftMonthReference = (mesReferencia: string, delta: number) => {
  const base = toMonthReference(mesReferencia);
  if (!base) return mesReferencia;

  const [yearText, monthText] = base.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const firstDay = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${firstDay.getUTCFullYear()}-${String(firstDay.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

const parseDataExibicaoDate = (dataExibicao: string): Date | null => {
  const [dayText, monthText, yearText] = dataExibicao.trim().split('/');
  const day = Number(dayText);
  const month = Number(monthText);
  let year = Number(yearText);

  if (
    !Number.isInteger(day)
    || !Number.isInteger(month)
    || !Number.isInteger(year)
    || day < 1
    || day > 31
    || month < 1
    || month > 12
  ) {
    return null;
  }

  if (yearText && year < 100) {
    year += 2000;
  }

  if (year < 1 || year > 9999) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime()) ? date : null;
};

const lineDateMillis = (dataExibicao: string) => {
  const date = parseDataExibicaoDate(dataExibicao);
  return date ? date.getTime() : Number.NEGATIVE_INFINITY;
};

const lineMonthReference = (dataExibicao: string) => {
  const date = parseDataExibicaoDate(dataExibicao);
  if (!date) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const mergeAndSortLinhas = (linhas: CalendarioAulasLinha[]) => {
  const merged = dedupeLinhas(linhas);
  return merged.sort((left, right) => {
    const leftDate = lineDateMillis(left.dataExibicao);
    const rightDate = lineDateMillis(right.dataExibicao);
    if (leftDate !== rightDate) return leftDate - rightDate;

    const componenteDiff = left.componenteCurricular.localeCompare(
      right.componenteCurricular,
      'pt-BR',
    );
    if (componenteDiff !== 0) return componenteDiff;

    return left.horarioExibicao.localeCompare(right.horarioExibicao);
  });
};

const dedupeLinhas = (linhas: CalendarioAulasLinha[]) => {
  const unique = new Map<string, CalendarioAulasLinha>();
  for (const linha of linhas) {
    const key = [
      linha.componenteCurricular,
      linha.dataExibicao,
      linha.horarioExibicao,
      linha.professoresObservacao,
    ].join('|');
    if (!unique.has(key)) unique.set(key, linha);
  }

  return [...unique.values()];
};

type PostgrestErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  status?: unknown;
};

const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isPostgrestFunctionUnavailable = (error: unknown) => {
  const parsed = error && typeof error === 'object'
    ? error as PostgrestErrorLike
    : {};
  const code = asText(parsed.code);
  const message = asText(parsed.message).toLowerCase();
  const details = asText(parsed.details).toLowerCase();
  const status = Number(parsed.status);

  return (
    code === '42883'
    || status === 404
    || message.includes('could not find the function')
    || message.includes('does not exist')
    || details.includes('could not find the function')
    || details.includes('does not exist')
  );
};

const requiredBoolean = (record: Record<string, unknown>, key: string, context: string) => {
  if (typeof record[key] !== 'boolean') {
    throw new Error(`A resposta canônica de ${context} não informou “${key}”.`);
  }
  return record[key] as boolean;
};

const mapTurma = (row: Record<string, unknown>): CalendarioAulasTurma => {
  const modalidade = requiredString(row, 'modalidade', 'turma elegível');
  if (!MODALIDADES.has(modalidade as CalendarioAulasModalidade)) {
    throw new Error('A turma elegível retornou uma modalidade inválida.');
  }

  return {
    turmaId: requiredString(row, 'turma_id', 'turma elegível'),
    turmaNome: requiredString(row, 'turma_nome', 'turma elegível'),
    turmaCodigo: optionalString(row, 'turma_codigo'),
    cursoNome: optionalString(row, 'curso_nome'),
    modalidade: modalidade as CalendarioAulasModalidade,
  };
};

const mapTurmaModulo = (row: Record<string, unknown>): CalendarioAulasTurmaModulo => ({
  moduloId: requiredString(row, 'modulo_id', 'módulo da turma'),
  moduloNome: requiredString(row, 'modulo_nome', 'módulo da turma'),
  moduloOrdem: optionalNumber(row, 'modulo_ordem'),
});

const mapTurmaModuloFromFallback = (row: any): CalendarioAulasTurmaModulo | null => {
  const modulo = row?.disciplinas?.modulos;
  if (!modulo || typeof modulo !== 'object') return null;
  const moduloId = modulo.id;
  const moduloNome = modulo.nome;
  if (typeof moduloId !== 'string' || typeof moduloNome !== 'string') return null;
  const moduloOrdem = typeof modulo.ordem === 'number' && Number.isFinite(modulo.ordem)
    ? modulo.ordem
    : null;

  return {
    moduloId,
    moduloNome: moduloNome.trim() || 'Módulo',
    moduloOrdem,
  };
};

const listTurmaModulosFallback = async (turmaId: string) => {
  const { data, error } = await supabase
    .from('turmas_disciplinas')
    .select('disciplinas!inner(modulos!inner(id, nome, ordem))')
    .eq('turma_id', turmaId);

  if (error) throw error;

  const moduloMap = new Map<string, CalendarioAulasTurmaModulo>();
  for (const row of data || []) {
    const modulo = mapTurmaModuloFromFallback(row);
    if (!modulo) continue;
    if (!moduloMap.has(modulo.moduloId)) moduloMap.set(modulo.moduloId, modulo);
  }

  return [...moduloMap.values()].sort((a, b) => {
    if (a.moduloOrdem !== b.moduloOrdem) {
      return (a.moduloOrdem ?? Number.MAX_SAFE_INTEGER) - (b.moduloOrdem ?? Number.MAX_SAFE_INTEGER);
    }
    return a.moduloNome.localeCompare(b.moduloNome, 'pt-BR');
  });
};

const mapCabecalhoInstitucional = (
  value: unknown,
  documento: Record<string, unknown>,
): CalendarioAulasCabecalhoInstitucional => {
  if (!value) {
    // Compatibilidade transitória com uma RPC anterior à projeção completa.
    // A exportação continua legível, mas a migração canônica passa a entregar
    // os demais campos antes do PDF ser aberto.
    return {
      nome: requiredString(documento, 'instituicao', 'documento do calendário'),
      cnpj: null,
      contato: null,
      email: null,
      endereco: null,
      numero: null,
      bairro: null,
      cidade: null,
      estado: null,
      cep: null,
      isMatriz: false,
      logoUrl: optionalString(documento, 'logo_data_uri'),
    };
  }

  const row = asRecord(value, 'cabeçalho institucional do calendário');
  return {
    nome: requiredString(row, 'nome', 'cabeçalho institucional do calendário'),
    cnpj: optionalString(row, 'cnpj'),
    contato: optionalString(row, 'contato'),
    email: optionalString(row, 'email'),
    endereco: optionalString(row, 'endereco'),
    numero: optionalString(row, 'numero'),
    bairro: optionalString(row, 'bairro'),
    cidade: optionalString(row, 'cidade'),
    estado: optionalString(row, 'estado'),
    cep: optionalString(row, 'cep'),
    isMatriz: optionalBoolean(row, 'is_matriz') === true,
    logoUrl: optionalString(row, 'logo_url'),
  };
};

const mapDocumento = (value: unknown): CalendarioAulasDocumento => {
  const row = asRecord(value, 'documento do calendário');
  const cabecalhos = asRecord(row.cabecalhos_tabela, 'cabeçalhos do calendário');
  const cabecalhosTabela: CalendarioAulasCabecalhosTabela = {
    componente: requiredString(cabecalhos, 'componente', 'cabeçalhos do calendário'),
    data: requiredString(cabecalhos, 'data', 'cabeçalhos do calendário'),
    horario: requiredString(cabecalhos, 'horario', 'cabeçalhos do calendário'),
    professorObservacao: requiredString(
      cabecalhos,
      'professor_observacao',
      'cabeçalhos do calendário',
    ),
  };

  return {
    titulo: requiredString(row, 'titulo', 'documento do calendário'),
    subtitulo: requiredString(row, 'subtitulo', 'documento do calendário'),
    rodape: requiredString(row, 'rodape', 'documento do calendário'),
    instituicao: requiredString(row, 'instituicao', 'documento do calendário'),
    polo: requiredString(row, 'polo', 'documento do calendário'),
    curso: requiredString(row, 'curso', 'documento do calendário'),
    turma: requiredString(row, 'turma', 'documento do calendário'),
    modulo: optionalString(row, 'modulo'),
    exibirMarcaDagua: requiredBoolean(row, 'exibir_marca_dagua', 'documento do calendário'),
    exibirModulo: requiredBoolean(row, 'exibir_modulo', 'documento do calendário'),
    cabecalhosTabela,
    marcaDaguaTexto: optionalString(row, 'marca_dagua_texto'),
    marcaDaguaDataUri: optionalString(row, 'marca_dagua_data_uri'),
    marcaDaguaUrl: optionalString(row, 'marca_dagua_url'),
    marcaDaguaOpacidade: optionalNumber(row, 'marca_dagua_opacidade'),
    marcaDaguaEscala: optionalNumber(row, 'marca_dagua_escala'),
    marcaDaguaRotacionar: optionalBoolean(row, 'marca_dagua_rotacionar'),
    logoDataUri: optionalString(row, 'logo_data_uri'),
    cabecalhoInstitucional: mapCabecalhoInstitucional(
      row.cabecalho_institucional,
      row,
    ),
    arquivoNome: requiredString(row, 'arquivo_nome', 'documento do calendário'),
    emitidoEm: optionalString(row, 'emitido_em'),
  };
};

const mapLinha = (row: Record<string, unknown>): CalendarioAulasLinha => ({
  componenteCurricular: requiredString(row, 'componente_curricular', 'linha do calendário'),
  dataExibicao: requiredString(row, 'data_exibicao', 'linha do calendário'),
  horarioExibicao: requiredString(row, 'horario_exibicao', 'linha do calendário'),
  professoresObservacao: requiredString(row, 'professores_observacao', 'linha do calendário'),
});

export const mapCalendarioAulasExportacaoPayload = (
  value: unknown,
): CalendarioAulasExportacaoPayload => {
  const row = asRecord(value, 'exportação de calendário');
  const status = requiredString(row, 'status', 'exportação de calendário');
  if (!STATUS_VALIDOS.has(status as CalendarioAulasExportacaoStatus)) {
    throw new Error('A exportação de calendário retornou um status inválido.');
  }

  const normalizedStatus = status as CalendarioAulasExportacaoStatus;
  if (normalizedStatus !== 'PRONTO') {
    return {
      status: normalizedStatus,
      mensagem: optionalString(row, 'mensagem'),
      documento: null,
      linhas: [],
    };
  }

  const linhas = asRows(row.linhas, 'linhas do calendário').map(mapLinha);
  if (!linhas.length) {
    throw new Error('A exportação foi marcada como pronta, mas não contém aulas para imprimir.');
  }

  return {
    status: normalizedStatus,
    mensagem: optionalString(row, 'mensagem'),
    documento: mapDocumento(row.documento),
    linhas,
  };
};

export const calendarioAulasExportacaoService = {
  async listarTurmas(
    poloId: string,
    modalidade: CalendarioAulasModalidade,
  ): Promise<CalendarioAulasTurma[]> {
    const { data, error } = await supabase.rpc(
      'listar_turmas_calendario_aulas_secure',
      {
        p_polo_id: poloId,
        p_modalidade: modalidade,
      },
    );

    if (error) throw error;
    return asRows(data, 'turmas elegíveis').map(mapTurma);
  },

  async listarModulos(
    poloId: string,
    turmaId: string,
  ): Promise<CalendarioAulasTurmaModulo[]> {
    const { data, error } = await supabase.rpc(
      'listar_modulos_calendario_aulas_secure',
      {
        p_polo_id: poloId,
        p_turma_id: turmaId,
      },
    );

    if (error) {
      // Em algumas bases antigas, a função pode ainda não existir; para não
      // travar a exportação, devolvemos lista vazia.
      if (isPostgrestFunctionUnavailable(error)) {
        return listTurmaModulosFallback(turmaId);
      }

      throw error;
    }
    return asRows(data, 'módulos da turma').map(mapTurmaModulo);
  },

  async preparar(
    input: PrepararCalendarioAulasExportacaoInput,
  ): Promise<CalendarioAulasExportacaoPayload> {
    const moduloId = input.moduloId?.trim() || null;

    const callWithModulo = async (
      moduloFilter: string | null,
      mesReferencia: string,
    ) => supabase.rpc(
      'preparar_calendario_aulas_exportacao_secure',
      {
        p_polo_id: input.poloId,
        p_modalidade: input.modalidade,
        p_turma_id: input.turmaId,
        p_mes_referencia: mesReferencia,
        p_modulo_id: moduloFilter || null,
      },
    );

    const { data, error } = await callWithModulo(moduloId, input.mesReferencia);

    if (error && isPostgrestFunctionUnavailable(error)) {
      if (moduloId) {
        throw new Error(
          'Função de exportação por módulo ainda não está atualizada no ambiente. '
          + 'Aplique a migration mais recente de calendário de aulas antes de exportar por módulo técnico.',
        );
      }

      const fallback = await supabase.rpc(
        'preparar_calendario_aulas_exportacao_secure',
        {
          p_polo_id: input.poloId,
          p_modalidade: input.modalidade,
          p_turma_id: input.turmaId,
          p_mes_referencia: input.mesReferencia,
        },
      );

      if (fallback.error) throw fallback.error;
      return mapCalendarioAulasExportacaoPayload(fallback.data);
    }

    if (error) throw error;

    const prepared = mapCalendarioAulasExportacaoPayload(data);
    if (
      prepared.status !== 'PRONTO'
      || input.modalidade !== 'TECNICO'
      || !moduloId
    ) {
      return prepared;
    }

    const selectedMonth = toMonthReference(input.mesReferencia);
    if (!selectedMonth) {
      return prepared;
    }

    const onlySelectedMonth = prepared.linhas.every((
      linha,
    ) => lineMonthReference(linha.dataExibicao) === selectedMonth);

    if (!onlySelectedMonth) {
      return prepared;
    }

    const mergedByMonths = dedupeLinhas(prepared.linhas);
    const offsets = [
      1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6,
      7, -7, 8, -8, 9, -9, 10, -10, 11, -11, 12, -12,
    ];

    for (const offset of offsets) {
      const monthReference = shiftMonthReference(input.mesReferencia, offset);
      const response = await callWithModulo(moduloId, monthReference);
      if (response.error) continue;

      const payloadByMonth = mapCalendarioAulasExportacaoPayload(response.data);
      if (payloadByMonth.status !== 'PRONTO') continue;
      mergedByMonths.push(...payloadByMonth.linhas);
    }

    const merged = mergeAndSortLinhas(mergedByMonths);
    return {
      ...prepared,
      linhas: merged,
    };
  },
};
