import { supabase } from '../../../../../../../lib/supabase';
import type {
  AtivarFinanceiroMatriculaTecnicaInput,
  AtivarFinanceiroMatriculaTecnicaResult,
  AtivarFinanceiroMatriculasTecnicasLoteInput,
  AtivarFinanceiroMatriculasTecnicasLoteResult,
  AlterarOverrideFinanceiroTecnicoResult,
  MatriculaTecnicaFinanceiroRow,
  MatriculaTecnicaFinanceiroWorkspace,
  MatriculaTecnicaRegra,
  MatriculaTecnicaRegraIdentidade,
  MatriculaTecnicaTitulo,
  PreVinculoAlunoTecnicoContexto,
  PreVincularAlunoTecnicoInput,
  PreVincularAlunoTecnicoResult,
  PreverRegraFinanceiraTecnicaInput,
  RemoverOverrideFinanceiroTecnicoInput,
  SalvarOverrideFinanceiroTecnicoInput,
  SalvarRegraFinanceiraTecnicaInput,
  SalvarRegraFinanceiraTecnicaResult,
} from './matricula-tecnica-financeiro.types';
import {
  validateAtivacaoLoteInput,
  validateAtivacaoLoteResult,
} from './matricula-tecnica-financeiro.validation';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

export class FinanceiroContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinanceiroContractError';
  }
}

export const isFinanceiroContractError = (error: unknown) => (
  error instanceof FinanceiroContractError
);

export const isRegraFinanceiraConflict = (error: unknown) => (
  isRecord(error) && String(error.code || '') === '40001'
);

export const isFinanceiroDateRejected = (error: unknown) => (
  isRecord(error) && String(error.code || '') === '22023'
);

const requireTitulo = (value: unknown): MatriculaTecnicaTitulo | null => {
  if (value === null) return null;
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.status !== 'string'
    || typeof value.valor !== 'string'
    || typeof value.vencimento !== 'string'
  ) throw new Error('O servidor não retornou o título canônico da matrícula.');
  return value as unknown as MatriculaTecnicaTitulo;
};

const requireRegraIdentidade = (value: unknown): MatriculaTecnicaRegraIdentidade => {
  if (
    !isRecord(value)
    || !Number.isInteger(value.revisao)
    || Number(value.revisao) < 1
    || typeof value.fingerprint !== 'string'
    || value.fingerprint.trim().length === 0
    || typeof value.primeiroVencimentoSugerido !== 'string'
  ) throw new Error('O servidor não retornou a identidade da regra financeira.');
  return value as unknown as MatriculaTecnicaRegraIdentidade;
};

const isDecimalString = (value: unknown): value is string => (
  typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
);

const requireApplicationItem = (value: unknown) => {
  if (
    !isRecord(value)
    || typeof value.desconto !== 'boolean'
    || typeof value.multaJuros !== 'boolean'
  ) throw new Error('O servidor não retornou as flags canônicas da regra financeira.');
};

const requireRegra = (value: unknown): MatriculaTecnicaRegra => {
  if (
    !isRecord(value)
    || !Number.isInteger(value.revisao)
    || typeof value.fingerprint !== 'string'
    || typeof value.primeiroVencimentoSugerido !== 'string'
    || !isDecimalString(value.valorMatricula)
    || !isDecimalString(value.valorMensalidade)
    || !isDecimalString(value.valorRematricula)
    || !Number.isInteger(value.mensalidadesPorCiclo)
    || !Number.isInteger(value.diaVencimento)
    || !isRecord(value.identidade)
    || !Number.isInteger(value.identidade.turmaRevisao)
    || Number(value.identidade.turmaRevisao) < 1
    || typeof value.identidade.turmaFingerprint !== 'string'
    || (value.identidade.overrideRevisao !== null
      && !Number.isInteger(value.identidade.overrideRevisao))
    || !isNullableString(value.identidade.overrideFingerprint)
    || typeof value.identidade.efetivaFingerprint !== 'string'
    || (value.identidade.preview !== undefined && typeof value.identidade.preview !== 'boolean')
    || !isRecord(value.cobranca)
    || !isRecord(value.cobranca.matricula)
    || typeof value.cobranca.matricula.habilitada !== 'boolean'
    || !isDecimalString(value.cobranca.matricula.valor)
    || !isRecord(value.cobranca.mensalidade)
    || value.cobranca.mensalidade.habilitada !== true
    || !Number.isInteger(value.cobranca.mensalidade.quantidade)
    || Number(value.cobranca.mensalidade.quantidade) < 1
    || Number(value.cobranca.mensalidade.quantidade) > 60
    || !isDecimalString(value.cobranca.mensalidade.valor)
    || !isRecord(value.cobranca.rematricula)
    || typeof value.cobranca.rematricula.habilitada !== 'boolean'
    || !isDecimalString(value.cobranca.rematricula.valor)
    || !isRecord(value.vencimento)
    || !Number.isInteger(value.vencimento.diaBase)
    || Number(value.vencimento.diaBase) < 1
    || Number(value.vencimento.diaBase) > 31
    || typeof value.vencimento.primeiroVencimentoSugerido !== 'string'
    || !isRecord(value.encargos)
    || !isDecimalString(value.encargos.descontoPontualidade)
    || !isDecimalString(value.encargos.jurosAtrasoPercentual)
    || !isDecimalString(value.encargos.multaAtrasoPercentual)
    || !isRecord(value.aplicacao)
    || !isRecord(value.boleto)
    || typeof value.boleto.instrucao !== 'string'
    || !Array.isArray(value.cronogramaCiclo)
    || !isRecord(value.continuidade)
    || typeof value.continuidade.recorrente !== 'boolean'
    || !['APOS_REMATRICULA', 'ENCERRA_APOS_MENSALIDADES'].includes(String(value.continuidade.proximoCiclo))
    || value.continuidade.mensalidadesPorCiclo !== value.cobranca.mensalidade.quantidade
    || !Number.isInteger(value.continuidade.maxCiclos)
    || !Number.isInteger(value.continuidade.encerraAposCiclo)
    || value.revisao !== value.identidade.turmaRevisao
    || value.fingerprint !== value.identidade.turmaFingerprint
    || value.primeiroVencimentoSugerido !== value.vencimento.primeiroVencimentoSugerido
    || value.valorMatricula !== value.cobranca.matricula.valor
    || value.valorMensalidade !== value.cobranca.mensalidade.valor
    || value.valorRematricula !== value.cobranca.rematricula.valor
    || value.mensalidadesPorCiclo !== value.cobranca.mensalidade.quantidade
    || value.diaVencimento !== value.vencimento.diaBase
  ) throw new Error('O servidor não retornou a regra financeira técnica canônica.');

  requireApplicationItem(value.aplicacao.matricula);
  requireApplicationItem(value.aplicacao.mensalidade);
  requireApplicationItem(value.aplicacao.rematricula);

  const cronograma = value.cronogramaCiclo as unknown[];
  if (!cronograma.every((item) => (
    isRecord(item)
    && typeof item.id === 'string'
    && ['MATRICULA', 'MENSALIDADE', 'REMATRICULA'].includes(String(item.tipo))
    && (item.numero === null || Number.isInteger(item.numero))
    && item.ciclo === 1
    && typeof item.label === 'string'
    && isDecimalString(item.valor)
    && typeof item.dataVencimento === 'string'
    && isRecord(item.simulacao)
    && isDecimalString(item.simulacao.descontoAplicado)
    && isDecimalString(item.simulacao.jurosMensal)
    && isDecimalString(item.simulacao.jurosPercentualDia)
    && isDecimalString(item.simulacao.jurosValorDia)
    && isDecimalString(item.simulacao.multa)
    && isDecimalString(item.simulacao.valorComDesconto)
    && isDecimalString(item.simulacao.valorComAtraso)
  ))) throw new Error('O servidor não retornou o cronograma financeiro canônico.');

  const matriculas = cronograma.filter((item) => isRecord(item) && item.tipo === 'MATRICULA').length;
  const mensalidades = cronograma.filter((item) => isRecord(item) && item.tipo === 'MENSALIDADE').length;
  const rematriculas = cronograma.filter((item) => isRecord(item) && item.tipo === 'REMATRICULA').length;
  if (
    matriculas !== (value.cobranca.matricula.habilitada ? 1 : 0)
    || mensalidades !== value.cobranca.mensalidade.quantidade
    || rematriculas !== (value.cobranca.rematricula.habilitada ? 1 : 0)
    || value.continuidade.recorrente !== false
    || value.continuidade.proximoCiclo !== (
      value.cobranca.rematricula.habilitada
        ? 'APOS_REMATRICULA'
        : 'ENCERRA_APOS_MENSALIDADES'
    )
    || value.continuidade.maxCiclos !== (value.cobranca.rematricula.habilitada ? 2 : 1)
    || value.continuidade.encerraAposCiclo !== value.continuidade.maxCiclos
  ) throw new Error('O cronograma não corresponde à cobrança canônica retornada.');

  return value as unknown as MatriculaTecnicaRegra;
};

const requireNullableBoolean = (value: unknown) => (
  value === null || typeof value === 'boolean'
);

const requireNullableDecimal = (value: unknown) => (
  value === null || isDecimalString(value)
);

const requireOverride = (value: unknown) => {
  if (
    !isRecord(value)
    || typeof value.ativo !== 'boolean'
    || !isRecord(value.identidade)
    || !Number.isInteger(value.identidade.revisao)
    || typeof value.identidade.fingerprint !== 'string'
    || !isRecord(value.cobranca)
    || !isRecord(value.cobranca.matricula)
    || !requireNullableBoolean(value.cobranca.matricula.habilitada)
    || !requireNullableDecimal(value.cobranca.matricula.valor)
    || !isRecord(value.cobranca.mensalidade)
    || (value.cobranca.mensalidade.quantidade !== null
      && !Number.isInteger(value.cobranca.mensalidade.quantidade))
    || !requireNullableDecimal(value.cobranca.mensalidade.valor)
    || !isRecord(value.cobranca.rematricula)
    || !requireNullableBoolean(value.cobranca.rematricula.habilitada)
    || !requireNullableDecimal(value.cobranca.rematricula.valor)
    || !isRecord(value.vencimento)
    || (value.vencimento.diaBase !== null && !Number.isInteger(value.vencimento.diaBase))
    || !isRecord(value.encargos)
    || !requireNullableDecimal(value.encargos.descontoPontualidade)
    || !requireNullableDecimal(value.encargos.jurosAtrasoPercentual)
    || !requireNullableDecimal(value.encargos.multaAtrasoPercentual)
    || !isRecord(value.aplicacao)
    || !isRecord(value.boleto)
    || !isNullableString(value.boleto.instrucao)
  ) throw new Error('O servidor não retornou o override financeiro canônico.');
  for (const key of ['matricula', 'mensalidade', 'rematricula']) {
    const item = value.aplicacao[key];
    if (
      !isRecord(item)
      || !requireNullableBoolean(item.desconto)
      || !requireNullableBoolean(item.multaJuros)
    ) throw new Error('O servidor não retornou as flags do override financeiro.');
  }
};

const requirePreVinculoContexto = (value: unknown): PreVinculoAlunoTecnicoContexto => {
  if (
    !isRecord(value)
    || !isRecord(value.turma)
    || typeof value.turma.turmaId !== 'string'
    || typeof value.turma.codigo !== 'string'
    || typeof value.turma.nome !== 'string'
    || typeof value.turma.poloId !== 'string'
    || typeof value.turma.status !== 'string'
    || !isRecord(value.aluno)
    || typeof value.aluno.alunoId !== 'string'
    || typeof value.aluno.nome !== 'string'
  ) throw new Error('O servidor não retornou o contexto mínimo do pré-vínculo.');
  requireRegraIdentidade(value.regra);
  return value as unknown as PreVinculoAlunoTecnicoContexto;
};

const requireMatricula = (value: unknown): MatriculaTecnicaFinanceiroRow => {
  if (!isRecord(value) || !isRecord(value.financeiro)) {
    throw new Error('O servidor não retornou a matrícula técnica canônica.');
  }
  const financeiro = value.financeiro;
  if (
    typeof value.matriculaId !== 'string'
    || typeof value.alunoId !== 'string'
    || typeof value.alunoNome !== 'string'
    || typeof value.matriculaExibicao !== 'string'
    || typeof value.statusAcademico !== 'string'
    || !requireNullableDecimal(value.valorMatriculaEfetivo)
    || !requireNullableDecimal(value.valorMensalidadeEfetivo)
    || !Number.isInteger(value.parcelasPagas)
    || !Number.isInteger(value.totalParcelas)
    || !isDecimalString(value.progressoPercentual)
    || ![
      'SEM_CONFIGURACAO',
      'PENDENTE',
      'AGENDADA',
      'ATIVA',
      'GERADA',
      'INADIMPLENTE',
      'EM_DIA',
    ].includes(String(value.situacaoFinanceira))
    || typeof value.overrideAtivo !== 'boolean'
    || !isRecord(value.totais)
    || !isDecimalString(value.totais.total)
    || !isDecimalString(value.totais.recebido)
    || !isDecimalString(value.totais.inadimplencia)
    || !['NAO_CONFIGURADO', 'PENDENTE', 'AGENDADA', 'ATIVADA', 'GERADA'].includes(String(financeiro.status))
    || !isNullableString(financeiro.primeiroVencimento)
    || !isNullableString(financeiro.ativarEm)
    || (financeiro.regraRevisao !== null && typeof financeiro.regraRevisao !== 'number')
    || !isNullableString(financeiro.regraFingerprint)
    || !isNullableString(financeiro.regraEfetivaFingerprint)
    || typeof financeiro.regraDesatualizada !== 'boolean'
    || !isNullableString(financeiro.updatedAt)
  ) throw new Error('O servidor retornou uma matrícula financeira incompleta.');
  if (value.override !== null) requireOverride(value.override);
  if (value.regraEfetiva !== null) requireRegra(value.regraEfetiva);
  requireTitulo(financeiro.titulo);
  return value as unknown as MatriculaTecnicaFinanceiroRow;
};

const requireWorkspace = (value: unknown): MatriculaTecnicaFinanceiroWorkspace => {
  if (!isRecord(value) || !isRecord(value.turma)) {
    throw new Error('O servidor não retornou o workspace financeiro da turma.');
  }
  const turma = value.turma;
  if (
    typeof turma.turmaId !== 'string'
    || typeof turma.codigo !== 'string'
    || typeof turma.nome !== 'string'
    || typeof turma.poloId !== 'string'
    || typeof turma.status !== 'string'
    || (value.aluno !== null && (
      !isRecord(value.aluno)
      || typeof value.aluno.alunoId !== 'string'
      || typeof value.aluno.nome !== 'string'
    ))
    || !Array.isArray(value.matriculas)
    || !isRecord(value.resumo)
    || !isDecimalString(value.resumo.total)
    || !isDecimalString(value.resumo.recebido)
    || !isDecimalString(value.resumo.inadimplencia)
    || !isDecimalString(value.resumo.inadimplenciaPercentual)
    || !isDecimalString(value.resumo.recebidoPercentual)
  ) throw new Error('O workspace financeiro retornado está incompleto.');
  requireRegra(value.regra);
  value.matriculas.forEach(requireMatricula);
  return value as unknown as MatriculaTecnicaFinanceiroWorkspace;
};

const requirePreVinculo = (value: unknown): PreVincularAlunoTecnicoResult => {
  if (
    !isRecord(value)
    || value.operacao !== 'PRE_VINCULO'
    || typeof value.requestId !== 'string'
    || typeof value.replayed !== 'boolean'
    || value.cobrancaGerada !== false
  ) throw new Error('O servidor não confirmou o pré-vínculo técnico.');
  requireMatricula(value.matricula);
  requireRegraIdentidade(value.regraAplicada);
  return value as unknown as PreVincularAlunoTecnicoResult;
};

const requireAtivacao = (value: unknown): AtivarFinanceiroMatriculaTecnicaResult => {
  if (
    !isRecord(value)
    || value.operacao !== 'ATIVACAO_INDIVIDUAL_FLEXIVEL'
    || (value.modo !== 'AGORA' && value.modo !== 'AGENDADA')
    || typeof value.requestId !== 'string'
    || typeof value.replayed !== 'boolean'
  ) throw new Error('O servidor não confirmou a ativação financeira individual.');
  requireMatricula(value.matricula);
  requireRegra(value.regraAplicada);
  requireWorkspace(value.workspace);
  return value as unknown as AtivarFinanceiroMatriculaTecnicaResult;
};

const requireSalvarRegra = (value: unknown): SalvarRegraFinanceiraTecnicaResult => {
  if (
    !isRecord(value)
    || value.operacao !== 'SALVAR_REGRA_TURMA'
    || typeof value.requestId !== 'string'
    || typeof value.replayed !== 'boolean'
  ) throw new Error('O servidor não confirmou a regra financeira da turma.');
  requireRegra(value.regra);
  requireWorkspace(value.workspace);
  return value as unknown as SalvarRegraFinanceiraTecnicaResult;
};

const requireAlterarOverride = (value: unknown): AlterarOverrideFinanceiroTecnicoResult => {
  if (
    !isRecord(value)
    || !['SALVAR_OVERRIDE_MATRICULA', 'REMOVER_OVERRIDE_MATRICULA'].includes(String(value.operacao))
    || typeof value.requestId !== 'string'
    || typeof value.replayed !== 'boolean'
    || typeof value.matriculaId !== 'string'
  ) throw new Error('O servidor não confirmou o override financeiro da matrícula.');
  requireMatricula(value.matricula);
  requireWorkspace(value.workspace);
  return value as unknown as AlterarOverrideFinanceiroTecnicoResult;
};

const requireAlterarOverrideAutorizado = (value: unknown): AlterarOverrideFinanceiroTecnicoResult => {
  if (isRecord(value) && value.operacao === 'AUTORIZACAO_NEGADA') {
    const authorization = isRecord(value.autorizacao) ? value.autorizacao : null;
    const reason = String(authorization?.motivo || 'INVALIDO');
    const remaining = authorization?.tentativasRestantes;
    if (reason === 'BLOQUEADO') {
      throw new Error('Muitas tentativas de autorização. Aguarde o período de bloqueio.');
    }
    if (reason === 'NAO_CONFIGURADO') {
      throw new Error('A turma não possui código de autorização configurado.');
    }
    throw new Error(`Código de autorização não aceito.${remaining == null ? '' : ` Restam ${Number(remaining)} tentativa(s).`}`);
  }
  return requireAlterarOverride(value);
};

const requireAtivacaoLote = (value: unknown): AtivarFinanceiroMatriculasTecnicasLoteResult => {
  if (
    !isRecord(value)
    || value.operacao !== 'ATIVACAO_LOTE_FLEXIVEL'
    || (value.modo !== 'AGORA' && value.modo !== 'AGENDADA')
    || typeof value.requestId !== 'string'
    || typeof value.replayed !== 'boolean'
    || typeof value.turmaId !== 'string'
    || typeof value.total !== 'number'
    || !Array.isArray(value.resultados)
    || value.total !== value.resultados.length
    || !value.resultados.every((item) => (
      isRecord(item)
      && typeof item.matriculaId === 'string'
      && ['PENDENTE', 'AGENDADA', 'ATIVADA', 'GERADA'].includes(String(item.status))
      && [
        'SEM_CONFIGURACAO', 'PENDENTE', 'AGENDADA', 'ATIVA', 'GERADA', 'INADIMPLENTE', 'EM_DIA',
      ].includes(String(item.situacaoFinanceira))
      && (item.titulo === null || isRecord(item.titulo))
    ))
  ) throw new Error('O servidor não confirmou a ativação financeira em lote.');
  value.resultados.forEach((item) => requireTitulo((item as Record<string, unknown>).titulo));
  requireWorkspace(value.workspace);
  return value as unknown as AtivarFinanceiroMatriculasTecnicasLoteResult;
};

const unwrap = async <T>(
  request: PromiseLike<{ data: unknown; error: unknown }>,
  parser: (value: unknown) => T,
) => {
  const { data, error } = await request;
  if (error) throw error;
  try {
    return parser(data);
  } catch (parseError) {
    throw new FinanceiroContractError(
      parseError instanceof Error
        ? parseError.message
        : 'O servidor retornou uma resposta financeira incompatível.',
    );
  }
};

export const matriculaTecnicaFinanceiroService = {
  getPreVinculoContexto(turmaId: string, alunoId: string) {
    return unwrap(
      supabase.rpc('obter_pre_vinculo_aluno_tecnico_contexto_secure', {
        p_turma_id: turmaId,
        p_aluno_id: alunoId,
      }),
      requirePreVinculoContexto,
    );
  },

  getWorkspace(turmaId: string, alunoId?: string | null) {
    return unwrap(
      supabase.rpc('obter_financeiro_matricula_tecnica_workspace_secure', {
        p_turma_id: turmaId,
        p_aluno_id: alunoId || null,
      }),
      requireWorkspace,
    );
  },

  previewRegra(input: PreverRegraFinanceiraTecnicaInput) {
    return unwrap(
      supabase.rpc('prever_regra_financeira_turma_tecnica_secure', {
        p_turma_id: input.turmaId,
        p_regra: input.regra,
      }),
      requireRegra,
    );
  },

  async salvarRegra(input: SalvarRegraFinanceiraTecnicaInput) {
    const result = await unwrap(
      supabase.rpc('salvar_regra_financeira_turma_tecnica_secure', {
        p_turma_id: input.turmaId,
        p_request_id: input.requestId,
        p_expected_revisao: input.expectedRevisao,
        p_expected_fingerprint: input.expectedFingerprint,
        p_regra: input.regra,
      }),
      requireSalvarRegra,
    );
    if (
      result.requestId !== input.requestId
      || result.workspace.turma.turmaId !== input.turmaId
      || result.regra.identidade.turmaFingerprint
        !== result.workspace.regra.identidade.turmaFingerprint
    ) throw new Error('O servidor não reconciliou a regra financeira salva.');
    return result;
  },

  async salvarOverride(input: SalvarOverrideFinanceiroTecnicoInput) {
    const result = await unwrap(
      supabase.rpc('salvar_override_financeiro_matricula_tecnica_autorizado_secure', {
        p_matricula_id: input.matriculaId,
        p_request_id: input.requestId,
        p_expected_turma_revisao: input.expectedTurmaRevisao,
        p_expected_turma_fingerprint: input.expectedTurmaFingerprint,
        p_expected_override_revisao: input.expectedOverrideRevisao,
        p_expected_override_fingerprint: input.expectedOverrideFingerprint,
        p_override: input.override,
        p_codigo: input.codigoAutorizacao,
        p_motivo: input.motivo,
        p_justificativa: input.justificativa || null,
      }),
      requireAlterarOverrideAutorizado,
    );
    if (
      result.operacao !== 'SALVAR_OVERRIDE_MATRICULA'
      || result.requestId !== input.requestId
      || result.matriculaId !== input.matriculaId
      || result.matricula.matriculaId !== input.matriculaId
      || result.workspace.turma.turmaId !== input.turmaId
    ) throw new Error('O servidor não reconciliou o override financeiro salvo.');
    return result;
  },

  async removerOverride(input: RemoverOverrideFinanceiroTecnicoInput) {
    const result = await unwrap(
      supabase.rpc('remover_override_financeiro_matricula_tecnica_autorizado_secure', {
        p_matricula_id: input.matriculaId,
        p_request_id: input.requestId,
        p_expected_turma_revisao: input.expectedTurmaRevisao,
        p_expected_turma_fingerprint: input.expectedTurmaFingerprint,
        p_expected_override_revisao: input.expectedOverrideRevisao,
        p_expected_override_fingerprint: input.expectedOverrideFingerprint,
        p_codigo: input.codigoAutorizacao,
        p_motivo: input.motivo,
        p_justificativa: input.justificativa || null,
      }),
      requireAlterarOverrideAutorizado,
    );
    if (
      result.operacao !== 'REMOVER_OVERRIDE_MATRICULA'
      || result.requestId !== input.requestId
      || result.matriculaId !== input.matriculaId
      || result.matricula.matriculaId !== input.matriculaId
      || result.workspace.turma.turmaId !== input.turmaId
    ) throw new Error('O servidor não reconciliou a remoção do override financeiro.');
    return result;
  },

  async preVincular(input: PreVincularAlunoTecnicoInput) {
    const result = await unwrap(
      supabase.rpc('pre_vincular_aluno_tecnico_secure', {
        p_turma_id: input.turmaId,
        p_aluno_id: input.alunoId,
        p_request_id: input.requestId,
        p_expected_regra_revisao: input.expectedRegraRevisao,
        p_expected_regra_fingerprint: input.expectedRegraFingerprint,
        p_primeiro_vencimento: input.primeiroVencimento || null,
      }),
      requirePreVinculo,
    );
    if (
      result.requestId !== input.requestId
      || result.matricula.alunoId !== input.alunoId
      || result.matricula.financeiro.status !== 'PENDENTE'
      || result.matricula.financeiro.titulo !== null
      || result.regraAplicada.revisao !== input.expectedRegraRevisao
      || result.regraAplicada.fingerprint !== input.expectedRegraFingerprint
    ) throw new Error('O servidor não reconciliou o pré-vínculo solicitado.');
    return result;
  },

  async ativarIndividual(input: AtivarFinanceiroMatriculaTecnicaInput) {
    const result = await unwrap(
      supabase.rpc('ativar_financeiro_matricula_tecnica_flexivel_secure', {
        p_matricula_id: input.matriculaId,
        p_modo: input.modo,
        p_request_id: input.requestId,
        p_ativar_em: input.ativarEm || null,
        p_expected_turma_revisao: input.expectedTurmaRevisao,
        p_expected_turma_fingerprint: input.expectedTurmaFingerprint,
        p_expected_override_revisao: input.expectedOverrideRevisao,
        p_expected_override_fingerprint: input.expectedOverrideFingerprint,
        p_expected_efetiva_fingerprint: input.expectedEfetivaFingerprint,
      }),
      requireAtivacao,
    );
    const expectedStatus = input.modo === 'AGORA' ? 'GERADA' : 'AGENDADA';
    if (
      result.requestId !== input.requestId
      || result.modo !== input.modo
      || result.matricula.matriculaId !== input.matriculaId
      || !(
        result.matricula.financeiro.status === expectedStatus
        || (input.modo === 'AGORA' && result.matricula.financeiro.status === 'ATIVADA')
      )
      || result.regraAplicada.identidade.turmaRevisao !== input.expectedTurmaRevisao
      || result.regraAplicada.identidade.turmaFingerprint !== input.expectedTurmaFingerprint
      || result.regraAplicada.identidade.efetivaFingerprint !== input.expectedEfetivaFingerprint
      || result.matricula.override?.identidade.revisao !== input.expectedOverrideRevisao
      || result.matricula.override?.identidade.fingerprint !== input.expectedOverrideFingerprint
      || (
        input.modo === 'AGORA'
        && result.matricula.financeiro.status === 'GERADA'
        && result.matricula.financeiro.titulo === null
      )
      || (
        input.modo === 'AGORA'
        && result.matricula.financeiro.status === 'ATIVADA'
        && result.matricula.financeiro.titulo !== null
      )
      || (input.modo === 'AGENDADA' && result.matricula.financeiro.titulo !== null)
      || result.workspace.turma.turmaId !== input.turmaId
    ) throw new Error('O servidor não reconciliou a ativação financeira solicitada.');
    return result;
  },

  async ativarLote(input: AtivarFinanceiroMatriculasTecnicasLoteInput) {
    validateAtivacaoLoteInput(input);
    const result = await unwrap(
      supabase.rpc('ativar_financeiro_matriculas_tecnicas_flexivel_lote_secure', {
        p_turma_id: input.turmaId,
        p_matricula_ids: input.matriculaIds,
        p_modo: input.modo,
        p_request_id: input.requestId,
        p_ativar_em: input.ativarEm || null,
        p_expected_turma_revisao: input.expectedTurmaRevisao,
        p_expected_turma_fingerprint: input.expectedTurmaFingerprint,
        p_expected_regras: input.expectedRegras,
      }),
      requireAtivacaoLote,
    );
    validateAtivacaoLoteResult(input, result);
    return result;
  },
};
