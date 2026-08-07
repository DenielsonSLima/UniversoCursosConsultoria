import { supabase } from '../../../../../lib/supabase';
import type {
  CalendarioAulasCabecalhoInstitucional,
  CalendarioAulasCabecalhosTabela,
  CalendarioAulasDocumento,
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

  async preparar(
    input: PrepararCalendarioAulasExportacaoInput,
  ): Promise<CalendarioAulasExportacaoPayload> {
    const { data, error } = await supabase.rpc(
      'preparar_calendario_aulas_exportacao_secure',
      {
        p_polo_id: input.poloId,
        p_modalidade: input.modalidade,
        p_turma_id: input.turmaId,
        p_mes_referencia: input.mesReferencia,
      },
    );

    if (error) throw error;
    return mapCalendarioAulasExportacaoPayload(data);
  },
};
