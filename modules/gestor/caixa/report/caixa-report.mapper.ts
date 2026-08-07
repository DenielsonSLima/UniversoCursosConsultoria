import { mapCaixaStatement } from '../caixa.service';
import type {
  CaixaCompositionStatus,
  CaixaDetailedReport,
  CaixaReportCourseSummary,
  CaixaReportExpense,
  CaixaReportInstitution,
  CaixaReportReceipt,
  CaixaReportRecurringAnalysis,
  CaixaReportRecurringBreakdown,
  CaixaReportTotals,
} from './caixa-report.types';

type JsonRecord = Record<string, unknown>;

const record = (value: unknown, field: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return value as JsonRecord;
};

const array = (value: unknown, field: string): JsonRecord[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return value.map((item, index) => record(item, `${field}[${index}]`));
};

const string = (value: unknown, field: string, nullable = false) => {
  if (nullable && value === null) return '';
  if (typeof value !== 'string') {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return value;
};

const number = (value: unknown, field: string) => {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return value;
};

const requiredNumber = (value: unknown, field: string) => {
  const parsed = number(value, field);
  if (parsed === null) throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  return parsed;
};

const integer = (value: unknown, field: string) => {
  const parsed = requiredNumber(value, field);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return parsed;
};

const boolean = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return value;
};

const composition = (value: unknown): CaixaCompositionStatus => {
  if (
    value !== 'COMPOSICAO_EXPLICITA'
    && value !== 'SEM_DIFERENCA_FINANCEIRA'
    && value !== 'NAO_DISCRIMINADA'
    && value !== 'NAO_DISCRIMINADA_PELO_GATEWAY'
  ) {
    throw new Error('Contrato inválido do relatório do Caixa: composicao_status.');
  }
  return value;
};

const totals = (value: unknown, field: string): CaixaReportTotals => {
  const item = record(value, field);
  return {
    valorBase: requiredNumber(item.valor_base, `${field}.valor_base`),
    jurosIdentificados: requiredNumber(item.juros_identificados, `${field}.juros_identificados`),
    multaIdentificada: requiredNumber(item.multa_identificada, `${field}.multa_identificada`),
    acrescimoIdentificado: requiredNumber(item.acrescimo_identificado, `${field}.acrescimo_identificado`),
    descontoIdentificado: requiredNumber(item.desconto_identificado, `${field}.desconto_identificado`),
    diferencaNaoDiscriminada: requiredNumber(item.diferenca_nao_discriminada, `${field}.diferenca_nao_discriminada`),
    valorFinal: requiredNumber(item.valor_final, `${field}.valor_final`),
    quantidade: integer(item.quantidade, `${field}.quantidade`),
    quantidadeNaoDiscriminada: integer(
      item.quantidade_nao_discriminada,
      `${field}.quantidade_nao_discriminada`,
    ),
  };
};

const baseMovement = (item: JsonRecord, field: string) => ({
  id: string(item.id, `${field}.id`),
  dataPagamento: string(item.data_pagamento, `${field}.data_pagamento`),
  dataVencimento: string(item.data_vencimento, `${field}.data_vencimento`, true),
  descricao: string(item.descricao, `${field}.descricao`),
  polo: string(item.polo, `${field}.polo`),
  curso: string(item.curso, `${field}.curso`),
  turma: string(item.turma, `${field}.turma`),
  parcelaNumero: number(item.parcela_numero, `${field}.parcela_numero`),
  totalParcelas: number(item.total_parcelas, `${field}.total_parcelas`),
  formaPagamento: string(item.forma_pagamento, `${field}.forma_pagamento`),
  conta: string(item.conta, `${field}.conta`),
  valorBase: requiredNumber(item.valor_base, `${field}.valor_base`),
  juros: number(item.juros, `${field}.juros`),
  multa: number(item.multa, `${field}.multa`),
  acrescimo: number(item.acrescimo, `${field}.acrescimo`),
  desconto: number(item.desconto, `${field}.desconto`),
  diferencaNaoDiscriminada: requiredNumber(
    item.diferenca_nao_discriminada,
    `${field}.diferenca_nao_discriminada`,
  ),
  composicaoStatus: composition(item.composicao_status),
});

const receipt = (item: JsonRecord, index: number): CaixaReportReceipt => ({
  ...baseMovement(item, `recebimentos[${index}]`),
  pagador: string(item.pagador, `recebimentos[${index}].pagador`),
  modalidade: string(item.modalidade, `recebimentos[${index}].modalidade`),
  tipoLancamento: string(item.tipo_lancamento, `recebimentos[${index}].tipo_lancamento`),
  valorRecebido: requiredNumber(item.valor_recebido, `recebimentos[${index}].valor_recebido`),
});

const expense = (item: JsonRecord, index: number): CaixaReportExpense => {
  const origem = string(item.origem, `despesas[${index}].origem`);
  if (origem !== 'CONTA_PAGAR' && origem !== 'DESPESA_LANCAMENTO') {
    throw new Error(`Contrato inválido do relatório do Caixa: despesas[${index}].origem.`);
  }
  return {
    ...baseMovement(item, `despesas[${index}]`),
    origem,
    fornecedor: string(item.fornecedor, `despesas[${index}].fornecedor`),
    categoria: string(item.categoria, `despesas[${index}].categoria`),
    valorPago: requiredNumber(item.valor_pago, `despesas[${index}].valor_pago`),
  };
};

const institution = (value: unknown): CaixaReportInstitution => {
  const item = record(value, 'institucional');
  return {
    id: item.id === null ? null : string(item.id, 'institucional.id'),
    nome: string(item.nome, 'institucional.nome', true),
    cnpj: string(item.cnpj, 'institucional.cnpj', true),
    cidade: string(item.cidade, 'institucional.cidade', true),
    estado: string(item.estado, 'institucional.estado', true),
    endereco: string(item.endereco, 'institucional.endereco', true),
    numero: string(item.numero, 'institucional.numero', true),
    bairro: string(item.bairro, 'institucional.bairro', true),
    cep: string(item.cep, 'institucional.cep', true),
    telefone: string(item.telefone, 'institucional.telefone', true),
    email: string(item.email, 'institucional.email', true),
    logo_url: item.logo_url === null ? null : string(item.logo_url, 'institucional.logo_url'),
    is_matriz: boolean(item.is_matriz, 'institucional.is_matriz'),
    watermark_url: item.watermark_url === null
      ? null
      : string(item.watermark_url, 'institucional.watermark_url'),
    watermark_opacity: requiredNumber(item.watermark_opacity, 'institucional.watermark_opacity'),
    watermark_scale: requiredNumber(item.watermark_scale, 'institucional.watermark_scale'),
    watermark_rotate: boolean(item.watermark_rotate, 'institucional.watermark_rotate'),
    landscape_watermark_url: item.landscape_watermark_url === null
      ? null
      : string(item.landscape_watermark_url, 'institucional.landscape_watermark_url'),
    landscape_watermark_opacity: requiredNumber(
      item.landscape_watermark_opacity,
      'institucional.landscape_watermark_opacity',
    ),
    landscape_watermark_scale: requiredNumber(
      item.landscape_watermark_scale,
      'institucional.landscape_watermark_scale',
    ),
    landscape_watermark_rotate: boolean(
      item.landscape_watermark_rotate,
      'institucional.landscape_watermark_rotate',
    ),
  };
};

const assertStrictStatementSummary = (value: unknown) => {
  const statement = record(value, 'resumo');
  const balances = record(statement.saldos_hoje, 'resumo.saldos_hoje');
  const month = record(statement.resumo_competencia, 'resumo.resumo_competencia');
  const commitments = record(statement.compromissos, 'resumo.compromissos');

  [
    'registrado_total',
    'bancario_registrado',
    'caixa_local',
    'compartilhado_total',
    'posicao_compartilhada_escopo',
    'nao_atribuido',
  ].forEach((field) => requiredNumber(balances[field], `resumo.saldos_hoje.${field}`));

  [
    'entradas_recebidas_brutas',
    'tarifas_bancarias_confirmadas',
    'saidas_pagas',
    'resultado',
  ].forEach((field) => requiredNumber(month[field], `resumo.resumo_competencia.${field}`));
  integer(
    month.quantidade_recebimentos,
    'resumo.resumo_competencia.quantidade_recebimentos',
  );
  integer(
    month.quantidade_pagamentos,
    'resumo.resumo_competencia.quantidade_pagamentos',
  );

  ['a_receber', 'receber_vencido', 'a_pagar', 'pagar_vencido'].forEach(
    (field) => requiredNumber(commitments[field], `resumo.compromissos.${field}`),
  );

  const modalities = array(
    statement.receitas_por_modalidade,
    'resumo.receitas_por_modalidade',
  );
  ['EAD', 'ESPECIALIZACAO', 'TECNICO', 'LIVRE'].forEach((code) => {
    const modality = modalities.find((item) => item.codigo === code);
    if (!modality) {
      throw new Error(`Contrato inválido do relatório do Caixa: modalidade ${code}.`);
    }
    requiredNumber(modality.valor, `resumo.receitas_por_modalidade.${code}.valor`);
    integer(modality.quantidade, `resumo.receitas_por_modalidade.${code}.quantidade`);
  });
};

const courseSummary = (value: unknown): CaixaReportCourseSummary => {
  const summary = record(value, 'resumo_cursos');
  const summaryTotals = record(summary.totais, 'resumo_cursos.totais');
  return {
    itens: array(summary.itens, 'resumo_cursos.itens').map((item, index) => ({
      cursoId: string(item.curso_id, `resumo_cursos.itens[${index}].curso_id`),
      curso: string(item.curso, `resumo_cursos.itens[${index}].curso`),
      modalidade: string(item.modalidade, `resumo_cursos.itens[${index}].modalidade`),
      previstoNoMes: requiredNumber(
        item.previsto_no_mes,
        `resumo_cursos.itens[${index}].previsto_no_mes`,
      ),
      recebidoNoMes: requiredNumber(
        item.recebido_no_mes,
        `resumo_cursos.itens[${index}].recebido_no_mes`,
      ),
      emAtraso: requiredNumber(
        item.em_atraso,
        `resumo_cursos.itens[${index}].em_atraso`,
      ),
      quantidadeParcelas: integer(
        item.quantidade_parcelas,
        `resumo_cursos.itens[${index}].quantidade_parcelas`,
      ),
      quantidadeRecebidas: integer(
        item.quantidade_recebidas,
        `resumo_cursos.itens[${index}].quantidade_recebidas`,
      ),
      quantidadeEmAtraso: integer(
        item.quantidade_em_atraso,
        `resumo_cursos.itens[${index}].quantidade_em_atraso`,
      ),
      quantidadeTurmas: integer(
        item.quantidade_turmas,
        `resumo_cursos.itens[${index}].quantidade_turmas`,
      ),
      quantidadeAlunos: integer(
        item.quantidade_alunos,
        `resumo_cursos.itens[${index}].quantidade_alunos`,
      ),
    })),
    quantidadeCursos: integer(
      summary.quantidade_cursos,
      'resumo_cursos.quantidade_cursos',
    ),
    quantidadeOmitidas: integer(
      summary.quantidade_omitidas,
      'resumo_cursos.quantidade_omitidas',
    ),
    totais: {
      previstoNoMes: requiredNumber(
        summaryTotals.previsto_no_mes,
        'resumo_cursos.totais.previsto_no_mes',
      ),
      recebidoNoMes: requiredNumber(
        summaryTotals.recebido_no_mes,
        'resumo_cursos.totais.recebido_no_mes',
      ),
      emAtraso: requiredNumber(
        summaryTotals.em_atraso,
        'resumo_cursos.totais.em_atraso',
      ),
      quantidadeTurmas: integer(
        summaryTotals.quantidade_turmas,
        'resumo_cursos.totais.quantidade_turmas',
      ),
      quantidadeAlunos: integer(
        summaryTotals.quantidade_alunos,
        'resumo_cursos.totais.quantidade_alunos',
      ),
    },
  };
};

const recurringBreakdown = (
  item: JsonRecord,
  field: string,
): CaixaReportRecurringBreakdown => ({
  previstoNoMes: requiredNumber(item.previsto_no_mes, `${field}.previsto_no_mes`),
  recebidoNoMes: requiredNumber(item.recebido_no_mes, `${field}.recebido_no_mes`),
  emAtraso: requiredNumber(item.em_atraso, `${field}.em_atraso`),
  valorBaseRecebido: requiredNumber(
    item.valor_base_recebido,
    `${field}.valor_base_recebido`,
  ),
  juros: requiredNumber(item.juros, `${field}.juros`),
  multa: requiredNumber(item.multa, `${field}.multa`),
  acrescimo: requiredNumber(item.acrescimo, `${field}.acrescimo`),
  desconto: requiredNumber(item.desconto, `${field}.desconto`),
  diferencaNaoDiscriminada: requiredNumber(
    item.diferenca_nao_discriminada,
    `${field}.diferenca_nao_discriminada`,
  ),
  quantidadeParcelas: integer(item.quantidade_parcelas, `${field}.quantidade_parcelas`),
  quantidadeRecebidas: integer(item.quantidade_recebidas, `${field}.quantidade_recebidas`),
  quantidadeEmAtraso: integer(
    item.quantidade_em_atraso,
    `${field}.quantidade_em_atraso`,
  ),
  quantidadeCursos: integer(item.quantidade_cursos, `${field}.quantidade_cursos`),
  quantidadeTurmas: integer(item.quantidade_turmas, `${field}.quantidade_turmas`),
  quantidadeAlunos: integer(item.quantidade_alunos, `${field}.quantidade_alunos`),
});

const recurringAnalysis = (value: unknown): CaixaReportRecurringAnalysis => {
  const analysis = record(value, 'analise_recorrente');
  return {
    modalidades: array(analysis.modalidades, 'analise_recorrente.modalidades').map(
      (item, index) => ({
        ...recurringBreakdown(item, `analise_recorrente.modalidades[${index}]`),
        modalidade: string(
          item.modalidade,
          `analise_recorrente.modalidades[${index}].modalidade`,
        ),
        rotulo: string(item.rotulo, `analise_recorrente.modalidades[${index}].rotulo`),
      }),
    ),
    turmas: array(analysis.turmas, 'analise_recorrente.turmas').map((item, index) => ({
      ...recurringBreakdown(item, `analise_recorrente.turmas[${index}]`),
      turmaId: string(item.turma_id, `analise_recorrente.turmas[${index}].turma_id`),
      turma: string(item.turma, `analise_recorrente.turmas[${index}].turma`),
      cursoId: string(item.curso_id, `analise_recorrente.turmas[${index}].curso_id`),
      curso: string(item.curso, `analise_recorrente.turmas[${index}].curso`),
      modalidade: string(
        item.modalidade,
        `analise_recorrente.turmas[${index}].modalidade`,
      ),
    })),
    totais: recurringBreakdown(
      record(analysis.totais, 'analise_recorrente.totais'),
      'analise_recorrente.totais',
    ),
  };
};

const assertUnique = (keys: string[], field: string) => {
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field} possui IDs duplicados.`);
  }
};

export const mapCaixaDetailedReport = (value: unknown): CaixaDetailedReport => {
  const payload = record(Array.isArray(value) ? value[0] : value, 'payload');
  if (requiredNumber(payload.versao, 'versao') !== 3 || payload.completo !== true) {
    throw new Error('O relatório detalhado do Caixa está incompleto ou possui versão incompatível.');
  }

  assertStrictStatementSummary(payload.resumo);
  const limitePorTabela = integer(payload.limite_por_tabela, 'limite_por_tabela');
  const limiteTotal = integer(payload.limite_total, 'limite_total');
  const totaisRecebimentos = totals(payload.totais_recebimentos, 'totais_recebimentos');
  const totaisDespesas = totals(payload.totais_despesas, 'totais_despesas');
  const resumoCursos = courseSummary(payload.resumo_cursos);
  const analiseRecorrente = recurringAnalysis(payload.analise_recorrente);
  const recebimentos = array(payload.recebimentos, 'recebimentos').map(receipt);
  const despesas = array(payload.despesas, 'despesas').map(expense);

  if (
    recebimentos.length !== totaisRecebimentos.quantidade
    || despesas.length !== totaisDespesas.quantidade
    || recebimentos.length > limitePorTabela
    || despesas.length > limitePorTabela
    || recebimentos.length + despesas.length > limiteTotal
  ) {
    throw new Error('O relatório detalhado do Caixa está truncado ou excede o limite seguro.');
  }
  assertUnique(recebimentos.map((item) => item.id), 'recebimentos');
  assertUnique(despesas.map((item) => `${item.origem}:${item.id}`), 'despesas');
  assertUnique(resumoCursos.itens.map((item) => item.cursoId), 'resumo_cursos');
  assertUnique(
    analiseRecorrente.modalidades.map((item) => item.modalidade),
    'analise_recorrente.modalidades',
  );
  assertUnique(
    analiseRecorrente.turmas.map((item) => item.turmaId),
    'analise_recorrente.turmas',
  );

  return {
    versao: 3,
    geradoEm: string(payload.gerado_em, 'gerado_em'),
    completo: true,
    confidencial: boolean(payload.confidencial, 'confidencial'),
    limitePorTabela,
    limiteTotal,
    institucional: institution(payload.institucional),
    resumo: mapCaixaStatement(payload.resumo),
    totaisRecebimentos,
    totaisDespesas,
    resumoCursos,
    analiseRecorrente,
    recebimentos,
    despesas,
  };
};
