import { supabase } from '../../../../lib/supabase';
import {
  dependencyBillingPreviewContractError,
  dependencyRulePercentage,
} from './dependencias-academicas.finance';
import type {
  DependenciaAcademica,
  DependenciaBoleto,
  DependenciaCheckoutResult,
  DependenciaConfirmacao,
  DependenciaConfirmacaoInput,
  DependenciaDisciplinaConfiguravel,
  DependenciaOferta,
  DependenciaPoliticaInput,
  DependenciaPoliticaRemocaoInput,
  DependenciaPrevia,
  DependenciaPreviaInput,
  DependenciaRegraFinanceira,
  DependenciasWorkspace,
} from './dependencias-academicas.types';

const text = (...values: unknown[]) => {
  const value = values.find((item) => typeof item === 'string' && item.trim());
  return typeof value === 'string' ? value : '';
};

const nullableText = (...values: unknown[]) => text(...values) || null;

const number = (...values: unknown[]) => {
  const value = values.find((item) => item !== null && item !== undefined && item !== '');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (...values: unknown[]) => {
  const value = values.find((item) => item !== null && item !== undefined && item !== '');
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const nullableBoolean = (...values: unknown[]) => {
  const value = values.find((item) => (
    typeof item === 'boolean'
    || item === 'true'
    || item === 'false'
  ));
  if (value === undefined) return null;
  return value === true || value === 'true';
};

const unwrap = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, any>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return { ...record, ...record.data };
  }
  return record;
};

const listFrom = (value: unknown, keys: string[]): any[] => {
  if (Array.isArray(value)) return value;
  const record = unwrap(value);
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [];
};

const normalizeBoleto = (row: Record<string, any>): DependenciaBoleto => {
  const boleto = unwrap(row.boleto || row.gateway_boleto || row);
  return {
    recebivelId: nullableText(
      row.recebivel_id,
      row.receivable_id,
      row.conta_receber_id,
      row.contaReceberId,
      row.cobrancaId,
      boleto.recebivel_id,
      boleto.receivableId,
    ),
    status: nullableText(row.cobranca_status, row.status_financeiro, boleto.status),
    linhaDigitavel: nullableText(
      row.gateway_boleto_linha_digitavel,
      row.linha_digitavel,
      boleto.linha_digitavel,
      boleto.digitableLine,
    ),
    codigoBarras: nullableText(
      row.gateway_boleto_codigo_barras,
      row.codigo_barras,
      boleto.codigo_barras,
      boleto.barcode,
    ),
    boletoUrl: nullableText(
      row.gateway_bank_slip_url,
      row.boleto_url,
      boleto.url,
      boleto.bankSlipUrl,
    ),
    nossoNumero: nullableText(
      row.gateway_boleto_nosso_numero,
      row.nosso_numero,
      boleto.nosso_numero,
      boleto.ourNumber,
    ),
  };
};

const normalizeDependencia = (raw: unknown): DependenciaAcademica => {
  const row = unwrap(raw);
  const aluno = unwrap(row.aluno);
  const disciplina = unwrap(row.disciplina);
  const origem = unwrap(row.origem);
  const destino = unwrap(row.destino || row.oferta);
  const financeiro = unwrap(row.financeiro || row.cobranca);
  const matriculaId = text(
    row.matriculaId,
    row.matricula_id,
    row.matricula_origem_id,
    origem.matricula_id,
  );
  const disciplinaId = text(row.disciplinaId, row.disciplina_id, disciplina.id);
  const rawStatus = text(
    row.tentativaStatus,
    row.tentativa_status,
    row.componenteStatus,
    row.componente_status,
    row.status,
  );
  const statusMap: Record<string, string> = {
    DIARIO_EM_ABERTO: 'DIARIO_EM_ABERTO',
    PENDENTE_DEPENDENCIA: 'PENDENTE_ENCAMINHAMENTO',
    DEPENDENCIA_AGENDADA: 'AGUARDANDO_PAGAMENTO',
    LIBERADA: 'PROGRAMADA',
    EM_CURSO: 'EM_CURSO',
    APROVADA: 'CONCLUIDA_APROVADA',
    APROVADO: 'CONCLUIDA_APROVADA',
    REPROVADA: 'CONCLUIDA_REPROVADA',
    APROVEITADO: 'DISPENSADA',
    ENCERRADO: 'DISPENSADA',
    CANCELADA: 'CANCELADA',
  };
  const status = statusMap[rawStatus] || rawStatus || 'PENDENTE_ENCAMINHAMENTO';
  const diarioBloqueio = nullableText(row.diarioBloqueio, row.diario_bloqueio);
  const diarioFechadoEm = nullableText(row.diarioFechadoEm, row.diario_fechado_em);
  const resultadoConsolidado = nullableBoolean(
    row.resultadoConsolidado,
    row.resultado_consolidado,
  ) ?? status !== 'DIARIO_EM_ABERTO';
  const acionavel = nullableBoolean(row.acionavel, row.actionable)
    ?? resultadoConsolidado;
  return {
    id: text(row.id, row.dependencia_id, row.vinculo_id) || `${matriculaId}:${disciplinaId}`,
    tentativaId: nullableText(row.tentativaId, row.tentativa_id, row.current_attempt_id),
    tentativaNumero: Math.max(1, number(row.tentativaNumero, row.tentativa_numero, row.numero_tentativa, 1)),
    matriculaId,
    alunoId: text(row.alunoId, row.aluno_id, aluno.id),
    alunoNome: text(row.alunoNome, row.aluno_nome, aluno.nome) || 'Aluno sem nome',
    alunoCpf: nullableText(row.aluno_cpf, aluno.cpf, aluno.cpf_cnpj),
    modalidade: text(
      row.modalidade,
      row.cursoModalidade,
      row.curso_modalidade,
      origem.modalidade,
    ) || 'TECNICO',
    cursoNome: text(row.cursoNome, row.curso_nome, origem.curso_nome) || 'Curso técnico',
    turmaOrigemId: text(
      row.turmaOrigemId,
      row.turma_origem_id,
      origem.turma_id,
    ),
    turmaOrigemNome: text(row.turmaOrigemNome, row.turma_origem_nome, origem.turma_nome) || 'Turma de origem',
    turmaOrigemCodigo: nullableText(row.turmaOrigemCodigo, row.turma_origem_codigo, origem.turma_codigo),
    disciplinaId,
    disciplinaNome: text(row.disciplinaNome, row.disciplina_nome, disciplina.nome) || 'Disciplina',
    cargaHoraria: number(row.cargaHoraria, row.carga_horaria, disciplina.carga_horaria),
    motivoReprovacao: text(
      row.motivo_reprovacao,
      row.motivo,
      row.resultadoOriginal,
      row.resultadoFinal,
      row.resultado_original,
    ) || 'Reprovação acadêmica',
    resultadoOriginal: text(row.resultadoOriginal, row.resultadoFinal, row.resultado_original, origem.resultado) || 'REPROVADO',
    notaOriginal: nullableNumber(row.notaOriginal, row.mediaFinal, row.nota_original, origem.nota_final),
    frequenciaOriginal: nullableNumber(
      row.frequenciaOriginal,
      row.frequenciaPercent,
      row.frequencia_original,
      origem.frequencia_percent,
    ),
    resultadoConsolidado,
    acionavel,
    diarioBloqueio,
    diarioFechadoEm,
    diarioObservacao: nullableText(
      row.diarioObservacao,
      row.diario_observacao,
    ),
    status,
    turmaDestinoId: nullableText(row.turmaDestinoId, row.turma_destino_id, destino.turma_id),
    turmaDestinoNome: nullableText(row.turma_destino_nome, destino.turma_nome),
    turmaDestinoCodigo: nullableText(row.turma_destino_codigo, destino.turma_codigo),
    professorNome: nullableText(row.professor_nome, destino.professor_nome),
    dataInicio: nullableText(row.data_inicio, destino.data_inicio),
    proximaAula: nullableText(row.proxima_aula, destino.proxima_aula),
    dataEncerramento: nullableText(row.data_encerramento, row.encerrado_em),
    notaFinal: nullableNumber(row.nota_final, row.media_final),
    frequenciaFinal: nullableNumber(row.frequencia_final, row.frequencia_percent),
    cobrancaId: nullableText(row.cobrancaId, row.cobranca_id, financeiro.id),
    cobrancaStatus: nullableText(
      row.cobranca_status,
      row.status_financeiro,
      financeiro.status,
    ),
    valor: nullableNumber(row.valorCobrado, row.valor, row.valor_cobranca, financeiro.valor),
    dataVencimento: nullableText(
      row.data_vencimento,
      financeiro.data_vencimento,
      financeiro.dueDate,
    ),
    boleto: normalizeBoleto({ ...row, ...financeiro }),
  };
};

const normalizeOferta = (raw: unknown): DependenciaOferta => {
  const row = unwrap(raw);
  return {
    id: text(row.turmaId, row.turma_id, row.id),
    turmaId: text(row.turmaId, row.turma_id),
    turmaNome: text(row.turmaNome, row.turma_nome, row.nome_turma) || 'Turma',
    turmaCodigo: nullableText(row.turmaCodigo, row.turma_codigo, row.codigo_turma),
    disciplinaId: text(row.disciplinaId, row.disciplina_id),
    disciplinaNome: text(row.disciplinaNome, row.disciplina_nome) || 'Disciplina',
    professorNome: nullableText(row.professorNome, row.professor_nome),
    dataInicio: nullableText(row.dataInicio, row.data_inicio, row.periodo_data_inicio),
    dataFim: nullableText(row.dataPrevisaoTermino, row.data_fim, row.periodo_data_fim),
    periodoNome: nullableText(row.periodoNome, row.periodo_nome, row.modulo_nome),
    vagasDisponiveis: nullableNumber(row.vagas_disponiveis),
    compativel: row.compativel !== false && row.elegivel !== false && !row.impedimento,
    impedimento: nullableText(row.impedimento, row.motivo_bloqueio),
  };
};

const normalizeRegra = (raw: unknown, index: number): DependenciaRegraFinanceira => {
  const row = unwrap(raw);
  const cargaHoraria = nullableNumber(row.carga_horaria, row.carga_horaria_limite);
  const percentual = dependencyRulePercentage(row);
  return {
    id: text(row.id) || `regra-${index}`,
    disciplinaId: nullableText(row.disciplina_id),
    disciplinaNome: text(row.disciplina_nome) || 'Regra geral',
    cargaHoraria,
    faixa: text(row.faixa, row.descricao) || (
      cargaHoraria !== null && cargaHoraria <= 40 ? 'Até 40h' : 'Acima de 40h'
    ),
    percentual,
    descontoPontualidade: number(
      row.descontoPontualidade,
      row.desconto_pontualidade,
    ),
    jurosAtrasoPercentual: number(
      row.jurosAtrasoPercentual,
      row.juros_atraso_percentual,
    ),
    multaAtrasoPercentual: number(
      row.multaAtrasoPercentual,
      row.multa_atraso_percentual,
    ),
    valorReferencia: nullableNumber(row.valor_referencia, row.valor_base),
    vigenciaInicio: nullableText(row.vigencia_inicio, row.created_at),
    origem: (() => {
      const origin = text(row.origem, row.tipo_regra);
      const labels: Record<string, string> = {
        DEPENDENCIA_ATE_40H: 'Faixa institucional · Até 40h',
        DEPENDENCIA_ACIMA_40H: 'Faixa institucional · Acima de 40h',
        DEPENDENCIA_DISCIPLINA: 'Personalização por disciplina',
      };
      return labels[origin] || origin.replaceAll('_', ' ') || 'Regra institucional';
    })(),
    atualizadoEm: nullableText(row.updated_at, row.atualizado_em),
  };
};

const normalizeDisciplinaConfiguravel = (
  raw: unknown,
): DependenciaDisciplinaConfiguravel => {
  const row = unwrap(raw);
  return {
    id: text(row.id, row.disciplina_id),
    nome: text(row.nome, row.disciplina_nome) || 'Disciplina',
    cargaHoraria: nullableNumber(row.cargaHoraria, row.carga_horaria),
    cursoId: nullableText(row.cursoId, row.curso_id),
    cursoNome: nullableText(row.cursoNome, row.curso_nome),
  };
};

const normalizePrevia = (
  raw: unknown,
  input: DependenciaPreviaInput,
): DependenciaPrevia => {
  const row = unwrap(raw);
  const financeira = unwrap(row.financeiro || row.preview || row.previa);
  const descricaoCobranca = nullableText(
    row.descricaoCobranca,
    row.descricao_cobranca,
    financeira.descricaoCobranca,
    financeira.descricao,
  );
  const descontoPontualidade = nullableNumber(
    row.descontoPontualidade,
    row.desconto_pontualidade,
    financeira.descontoPontualidade,
    financeira.desconto_pontualidade,
  );
  const jurosAtrasoPercentual = nullableNumber(
    row.jurosAtrasoPercentual,
    row.juros_atraso_percentual,
    financeira.jurosAtrasoPercentual,
    financeira.juros_atraso_percentual,
  );
  const multaAtrasoPercentual = nullableNumber(
    row.multaAtrasoPercentual,
    row.multa_atraso_percentual,
    financeira.multaAtrasoPercentual,
    financeira.multa_atraso_percentual,
  );
  const diasBaixaDevolucao = nullableNumber(
    row.diasBaixaDevolucao,
    row.dias_baixa_devolucao,
    financeira.diasBaixaDevolucao,
    financeira.dias_baixa_devolucao,
  );
  const instrucaoBoleto = nullableText(
    row.instrucaoBoleto,
    row.instrucao_boleto,
    financeira.instrucaoBoleto,
    financeira.instrucao_boleto,
  );
  const contratoBloqueio = dependencyBillingPreviewContractError({
    origin: text(financeira.origem, row.origem_financeira),
    description: descricaoCobranca,
    discount: descontoPontualidade,
    monthlyInterest: jurosAtrasoPercentual,
    penalty: multaAtrasoPercentual,
    writeOffDays: diasBaixaDevolucao,
    instruction: instrucaoBoleto,
  });
  const bloqueio = nullableText(
    row.bloqueio,
    row.motivo_bloqueio,
    financeira.bloqueio,
    contratoBloqueio,
  );
  return {
    turmaDestinoId: text(row.turmaDestinoId, row.turma_destino_id, row.turma_id, input.turmaDestinoId),
    disciplinaNome: text(row.disciplinaNome, row.disciplina_nome) || 'Disciplina',
    turmaDestinoNome: text(row.turmaDestinoNome, row.turma_destino_nome, row.turma_nome) || 'Turma selecionada',
    cargaHoraria: number(row.cargaHoraria, row.carga_horaria),
    percentualAplicado: number(
      row.percentual_aplicado,
      financeira.percentual_aplicado,
      financeira.percentual,
      number(row.multiplicador, financeira.multiplicador) * 100,
    ),
    valorBase: number(row.valorParcelaBase, row.valor_base, financeira.valor_base),
    valorCobrar: number(
      row.valorCobrado,
      row.valor_cobrar,
      row.valor_cobranca,
      financeira.valor,
      financeira.valor_cobrar,
    ),
    descontoPontualidade: descontoPontualidade ?? 0,
    jurosAtrasoPercentual: jurosAtrasoPercentual ?? 0,
    multaAtrasoPercentual: multaAtrasoPercentual ?? 0,
    diasBaixaDevolucao: diasBaixaDevolucao ?? 0,
    instrucaoBoleto: instrucaoBoleto || '',
    dataVencimento: text(
      row.data_vencimento,
      financeira.data_vencimento,
      input.dataVencimento,
    ),
    descricaoCobranca: descricaoCobranca || 'Disciplina',
    regraResumo: text(row.regra, row.regra_resumo, financeira.regra_resumo) || 'Regra calculada pelo backend',
    podeConfirmar: row.pode_confirmar !== false && !bloqueio,
    bloqueio,
  };
};

const normalizeConfirmacao = (
  raw: unknown,
  input: DependenciaConfirmacaoInput,
): DependenciaConfirmacao => {
  const row = unwrap(raw);
  return {
    tentativaId: text(row.tentativaId, row.tentativa_id, row.id),
    cobrancaId: nullableText(row.cobrancaId, row.cobranca_id),
    recebivelId: nullableText(row.contaReceberId, row.recebivel_id, row.conta_receber_id),
    turmaId: nullableText(row.turmaDestinoId, row.turma_id, row.turma_destino_id),
    disciplinaId: nullableText(row.disciplinaId, row.disciplina_id, input.disciplinaId),
    status: text(row.tentativaStatus, row.contaReceberStatus, row.status) || 'AGUARDANDO_PAGAMENTO',
  };
};

const functionErrorMessage = async (error: unknown, fallback: string) => {
  const context = (error as {
    context?: { json?: () => Promise<Record<string, unknown>> };
  })?.context;
  const body = context?.json ? await context.json().catch(() => null) : null;
  return text(body?.error, body?.message, error instanceof Error ? error.message : null) || fallback;
};

export const dependenciasAcademicasService = {
  async getWorkspace(poloId: string): Promise<DependenciasWorkspace> {
    const { data, error } = await supabase.rpc(
      'get_secretaria_dependencias_workspace_secure',
      { p_polo_id: poloId, p_search: null },
    );
    if (error) throw error;
    const record = unwrap(data);
    const dependencias = listFrom(data, ['dependencias', 'items', 'rows'])
      .map(normalizeDependencia)
      .filter((item) => item.id);
    const regras = listFrom(record, [
      'regras_financeiras',
      'financial_rules',
      'regras',
    ]).map(normalizeRegra);
    const disciplinasById = new Map<string, DependenciaDisciplinaConfiguravel>();
    listFrom(record, [
      'disciplinas_configuraveis',
      'configurable_disciplines',
      'disciplinas',
    ])
      .map(normalizeDisciplinaConfiguravel)
      .filter((item) => item.id)
      .forEach((item) => {
        const existing = disciplinasById.get(item.id);
        if (!existing) {
          disciplinasById.set(item.id, item);
          return;
        }
        if (
          item.cursoNome
          && existing.cursoNome
          && !existing.cursoNome.split(' • ').includes(item.cursoNome)
        ) {
          disciplinasById.set(item.id, {
            ...existing,
            cursoId: null,
            cursoNome: `${existing.cursoNome} • ${item.cursoNome}`,
          });
        }
      });
    return {
      dependencias,
      regrasFinanceiras: regras,
      disciplinasConfiguraveis: [...disciplinasById.values()]
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      atualizadoEm: nullableText(record.atualizado_em, record.generated_at),
    };
  },

  async getOfertas(
    matriculaId: string,
    disciplinaId: string,
  ): Promise<DependenciaOferta[]> {
    const { data, error } = await supabase.rpc('get_dependencia_ofertas_secure', {
      p_matricula_id: matriculaId,
      p_disciplina_id: disciplinaId,
    });
    if (error) throw error;
    return listFrom(data, ['ofertas', 'items', 'rows'])
      .map(normalizeOferta)
      .filter((item) => item.turmaId);
  },

  async prever(input: DependenciaPreviaInput): Promise<DependenciaPrevia> {
    const { data, error } = await supabase.rpc('prever_dependencia_reoferta_secure', {
      p_matricula_id: input.matriculaId,
      p_disciplina_id: input.disciplinaId,
      p_turma_destino_id: input.turmaDestinoId,
    });
    if (error) throw error;
    return normalizePrevia(data, input);
  },

  async confirmar(input: DependenciaConfirmacaoInput): Promise<DependenciaConfirmacao> {
    const { data, error } = await supabase.rpc('confirmar_dependencia_reoferta_secure', {
      p_matricula_id: input.matriculaId,
      p_disciplina_id: input.disciplinaId,
      p_turma_destino_id: input.turmaDestinoId,
      p_data_vencimento: input.dataVencimento,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    return normalizeConfirmacao(data, input);
  },

  async configurarPoliticaDisciplina(
    input: DependenciaPoliticaInput,
  ): Promise<void> {
    const { error } = await supabase.rpc(
      'configurar_politica_dependencia_disciplina_financeira_secure',
      {
        p_polo_id: input.poloId,
        p_disciplina_id: input.disciplinaId,
        p_multiplicador_parcela: input.multiplicadorParcela,
        p_desconto_pontualidade: input.descontoPontualidade,
        p_juros_atraso_percentual: input.jurosAtrasoPercentual,
        p_multa_atraso_percentual: input.multaAtrasoPercentual,
        p_idempotency_key: input.idempotencyKey,
      },
    );
    if (error) throw error;
  },

  async removerPoliticaDisciplina(
    input: DependenciaPoliticaRemocaoInput,
  ): Promise<void> {
    const { error } = await supabase.rpc(
      'remover_politica_dependencia_disciplina_secure',
      {
        p_polo_id: input.poloId,
        p_politica_id: input.politicaId,
      },
    );
    if (error) throw error;
  },

  async checkoutBanese(
    confirmation: DependenciaConfirmacao,
  ): Promise<DependenciaCheckoutResult> {
    if (!confirmation.recebivelId) {
      throw new Error('A confirmação não retornou o recebível necessário para registrar o boleto Banese.');
    }
    const { data, error } = await supabase.functions.invoke(
      'dependencia-banese-checkout',
      {
        body: { receivableId: confirmation.recebivelId },
      },
    );
    if (error) {
      throw new Error(await functionErrorMessage(
        error,
        'A dependência foi confirmada, mas o boleto Banese não pôde ser registrado.',
      ));
    }
    const row = unwrap(data);
    if (row.error) throw new Error(text(row.error) || 'Falha ao registrar boleto Banese.');
    const receivable = unwrap(row.receivable);
    return {
      ...confirmation,
      cobrancaId: nullableText(row.cobranca_id, row.chargeId, confirmation.cobrancaId),
      recebivelId: nullableText(
        row.recebivel_id,
        row.receivableId,
        receivable.id,
        confirmation.recebivelId,
      ),
      status: text(receivable.status, row.status, confirmation.status),
      boleto: normalizeBoleto({
        ...row,
        ...unwrap(row.boleto),
        recebivel_id: receivable.id,
        cobranca_status: receivable.status,
      }),
    };
  },
};
