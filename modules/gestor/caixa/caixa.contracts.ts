import type {
  CaixaResultStatus,
  CaixaMonthlyStatement,
  CaixaFinanciamentoResumo,
  CaixaCustosOperacionais,
  CaixaPatrimonioResumo,
  CaixaPosicaoLiquidaResumo,
  CaixaPosicaoTotalResumo
} from './caixa.types';
import {
  isCaixaCanonicalDecimalText,
  isCaixaSignedCanonicalDecimalText,
} from './caixa.formatters';

type RawItem = Record<string, unknown>;

export const isRecord = (value: unknown): value is RawItem => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const asRecord = (value: unknown): RawItem => (
  isRecord(value)
    ? value as RawItem
    : {}
);

export const asArray = (value: unknown): RawItem[] => (
  Array.isArray(value) ? value.map(asRecord) : []
);

export const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const asString = (value: unknown) => (
  typeof value === 'string' ? value : ''
);

export const asResultStatus = (value: unknown): CaixaResultStatus => {
  if (value === 'POSITIVO' || value === 'NEGATIVO') return value;
  return 'NEUTRO';
};

export const isNumericValue = (value: unknown) => (
  value !== null
  && value !== ''
  && Number.isFinite(Number(value))
);

export const isNonNegativeSafeInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0;
};

export const isCaixaDate = (value: unknown): value is string => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
);

const isMonthlySeriesItem = (item: unknown): boolean => {
  if (!isRecord(item)) return false;
  const percentages = [
    item.entradas_escala_percentual, item.saidas_escala_percentual,
    item.inadimplencia_escala_percentual, item.resultado_posicao_percentual,
    item.inadimplencia_posicao_percentual, item.grafico_zero_posicao_percentual,
  ];
  return isCaixaDate(item.competencia)
    && isNumericValue(item.inadimplencia) && Number(item.inadimplencia) >= 0
    && isNumericValue(item.inadimplencia_quantidade_em_conferencia)
    && isNonNegativeSafeInteger(item.inadimplencia_quantidade_em_conferencia)
    && typeof item.inadimplencia_completo === 'boolean'
    && percentages.every(value => isNumericValue(value) && Number(value) >= 0 && Number(value) <= 100);
};

export const assertStatementPayload = (payload: RawItem) => {
  const meta = payload.meta;
  const saldos = payload.saldos_hoje;
  const resumo = payload.resumo_competencia;
  const compromissos = payload.compromissos;
  const mensal = isRecord(compromissos) ? compromissos.inadimplencia_mensal : undefined;

  const hasRequiredArrays = [
    payload.receitas_por_modalidade,
    payload.despesas_por_categoria,
    payload.serie_mensal,
    payload.contas,
  ].every(Array.isArray);

  const requiredNumbers = [
    isRecord(saldos) ? saldos.registrado_total : undefined,
    isRecord(saldos) ? saldos.bancario_registrado : undefined,
    isRecord(saldos) ? saldos.caixa_local : undefined,
    isRecord(resumo) ? resumo.entradas_recebidas_brutas : undefined,
    isRecord(resumo) ? resumo.saidas_pagas : undefined,
    isRecord(resumo) ? resumo.resultado : undefined,
    isRecord(compromissos) ? compromissos.a_receber : undefined,
    isRecord(compromissos) ? compromissos.receber_vencido : undefined,
    isRecord(compromissos) ? compromissos.margem_inadimplencia : undefined,
    isRecord(compromissos) ? compromissos.a_pagar : undefined,
  ];

  if (
    asNumber(payload.versao) !== 2
    || !isRecord(meta)
    || typeof meta.competencia !== 'string'
    || !isRecord(saldos)
    || !isRecord(resumo)
    || !isRecord(compromissos)
    || !hasRequiredArrays
    || !Array.isArray(payload.serie_mensal)
    || !payload.serie_mensal.every(isMonthlySeriesItem)
    || !requiredNumbers.every(isNumericValue)
    || !isRecord(mensal)
    || !isCaixaDate(mensal.periodo_inicio)
    || !isCaixaDate(mensal.periodo_fim_exclusivo)
    || !isCaixaDate(mensal.data_corte)
    || mensal.periodo_inicio !== meta.periodo_inicio
    || mensal.periodo_fim_exclusivo !== meta.periodo_fim_exclusivo
    || !isNumericValue(mensal.base_elegivel)
    || Number(mensal.base_elegivel) < 0
    || !isNumericValue(mensal.valor_nominal_em_conferencia)
    || Number(mensal.valor_nominal_em_conferencia) < 0
    || !isNumericValue(mensal.quantidade_elegiveis)
    || !isNonNegativeSafeInteger(mensal.quantidade_elegiveis)
    || !isNumericValue(mensal.quantidade_em_conferencia)
    || !isNonNegativeSafeInteger(mensal.quantidade_em_conferencia)
    || typeof mensal.completo !== 'boolean'
    || mensal.criterio !== 'VENCIMENTO_MENSAL_POSICAO_NO_CORTE'
  ) {
    throw new Error('Contrato inválido da prestação mensal do Caixa.');
  }
};

export const assertFinanciamentoResumoPayload = (payload: RawItem) => {
  const requiredNumbers = [
    payload.credito_liberado_matriz,
    payload.obrigacao_rateada,
    payload.principal_rateado,
    payload.encargos_rateados,
    payload.pago_rateado,
  ];

  if (
    typeof payload.competencia !== 'string'
    || payload.competencia.trim() === ''
    || !requiredNumbers.every(isNumericValue)
    || (typeof payload.observacao !== 'string' && payload.observacao !== null)
  ) {
    throw new Error('Contrato inválido do resumo de financiamento do Caixa.');
  }
};

export const assertCustosOperacionaisPayload = (payload: RawItem) => {
  const requiredNumbers = [
    payload.custo_competencia,
    payload.pago_competencia,
    payload.a_pagar,
    payload.vencido,
    payload.custo_rateado_competencia,
    payload.rateado_a_pagar,
    payload.lancamentos_competencia,
    payload.rateios_competencia,
  ];

  if (
    typeof payload.competencia !== 'string'
    || payload.competencia.trim() === ''
    || !requiredNumbers.every(isNumericValue)
    || payload.ponto_equilibrio_status !== 'PENDENTE_DE_MARGEM'
    || typeof payload.observacao !== 'string'
  ) {
    throw new Error('Contrato inválido do resumo de custos operacionais do Caixa.');
  }
};

export const assertPatrimonioResumoPayload = (payload: RawItem) => {
  const posicao = payload.posicao_fechamento;
  const aquisicoes = payload.aquisicoes_competencia;
  const perdas = payload.perdas_competencia;

  if (
    payload.versao !== 1
    || typeof payload.competencia !== 'string'
    || payload.competencia.trim() === ''
    || (payload.escopo_tipo !== 'GLOBAL' && payload.escopo_tipo !== 'POLO')
    || (typeof payload.polo_id !== 'string' && payload.polo_id !== null)
    || !isRecord(posicao)
    || !isNonNegativeSafeInteger(posicao.registros_ativos)
    || !isNonNegativeSafeInteger(posicao.unidades_ativas)
    || !isCaixaCanonicalDecimalText(posicao.valor_ativo_custo)
    || !isRecord(aquisicoes)
    || !isNonNegativeSafeInteger(aquisicoes.registros)
    || !isNonNegativeSafeInteger(aquisicoes.unidades)
    || !isCaixaCanonicalDecimalText(aquisicoes.valor_custo)
    || !isRecord(perdas)
    || !isNonNegativeSafeInteger(perdas.movimentos)
    || !isNonNegativeSafeInteger(perdas.unidades)
    || !isCaixaCanonicalDecimalText(perdas.valor_custo)
    || typeof payload.observacao !== 'string'
  ) {
    throw new Error('Contrato inválido do resumo patrimonial do Caixa.');
  }
};

export const assertPosicaoLiquidaResumoPayload = (payload: RawItem) => {
  if (
    payload.versao !== 1
    || typeof payload.competencia !== 'string'
    || payload.competencia.trim() === ''
    || (payload.escopo_tipo !== 'GLOBAL' && payload.escopo_tipo !== 'POLO')
    || (typeof payload.polo_id !== 'string' && payload.polo_id !== null)
    || !isCaixaCanonicalDecimalText(payload.valor_patrimonial_custo)
    || !isCaixaCanonicalDecimalText(payload.saldo_emprestimos_a_pagar)
    || !isCaixaSignedCanonicalDecimalText(payload.valor_liquido)
    || typeof payload.observacao !== 'string'
  ) {
    throw new Error('Contrato inválido da posição líquida do Caixa.');
  }
};

export const assertPosicaoTotalResumoPayload = (payload: RawItem) => {
  const hasBaseContract = (
    payload.versao === 1
    && isCaixaDate(payload.competencia)
    && isCaixaDate(payload.data_corte)
    && (payload.escopo_tipo === 'GLOBAL' || payload.escopo_tipo === 'POLO')
    && (typeof payload.polo_id === 'string' || payload.polo_id === null)
  );

  if (!hasBaseContract) {
    throw new Error('Contrato inválido da posição total do Caixa.');
  }

  if (payload.disponivel === true) {
    const dados = payload.dados;
    if (
      !isRecord(dados)
      || !isCaixaSignedCanonicalDecimalText(dados.saldo_caixa_registrado)
      || !isCaixaCanonicalDecimalText(dados.valor_patrimonial_custo)
      || !isCaixaCanonicalDecimalText(dados.saldo_emprestimos_a_pagar)
      || !isCaixaSignedCanonicalDecimalText(dados.valor_total_liquido)
      || typeof dados.observacao !== 'string'
    ) {
      throw new Error('Contrato inválido da posição total do Caixa.');
    }
    return;
  }

  if (
    payload.disponivel !== false
    || (payload.motivo !== 'ACESSO_RESTRITO' && payload.motivo !== 'HISTORICO_INSUFICIENTE')
    || typeof payload.observacao !== 'string'
  ) {
    throw new Error('Contrato inválido da posição total do Caixa.');
  }
};

export const getCurrentCaixaCompetencia = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

export const normalizeCaixaPoloId = (poloId: string | null | undefined) => (
  poloId && poloId !== 'todos' ? poloId : null
);

export const getCaixaScopeKey = (poloId: string | null | undefined) => (
  normalizeCaixaPoloId(poloId) || 'todos'
);

export const assertCaixaStatementRequest = (
  statement: CaixaMonthlyStatement,
  poloId: string | null | undefined,
  competencia: string,
) => {
  const expectedPoloId = normalizeCaixaPoloId(poloId);
  const hasExpectedScope = expectedPoloId
    ? statement.meta.escopoTipo === 'POLO' && statement.meta.poloId === expectedPoloId
    : statement.meta.escopoTipo === 'GLOBAL' && statement.meta.poloId === null;

  if (!hasExpectedScope || statement.meta.competencia !== competencia) {
    throw new Error('A prestação mensal do Caixa retornou um escopo diferente do solicitado.');
  }
};

export const shiftCaixaCompetencia = (competencia: string, months: number) => {
  const [yearValue, monthValue] = competencia.split('-').map(Number);
  const shifted = new Date(yearValue, monthValue - 1 + months, 1, 12);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-01`;
};

export const assertCaixaFinanciamentoResumoRequest = (
  resumo: CaixaFinanciamentoResumo,
  competencia: string,
) => {
  if (resumo.competencia !== competencia) {
    throw new Error('O resumo de financiamento retornou uma competência diferente da solicitada.');
  }
};

export const assertCaixaCustosOperacionaisRequest = (
  resumo: CaixaCustosOperacionais,
  poloId: string | null | undefined,
  competencia: string,
) => {
  if (
    resumo.competencia !== competencia
    || resumo.poloId !== normalizeCaixaPoloId(poloId)
  ) {
    throw new Error('O resumo de custos operacionais retornou um escopo diferente do solicitado.');
  }
};

export const assertCaixaPatrimonioResumoRequest = (
  resumo: CaixaPatrimonioResumo,
  poloId: string | null | undefined,
  competencia: string,
) => {
  const expectedPoloId = normalizeCaixaPoloId(poloId);
  const hasExpectedScope = expectedPoloId
    ? resumo.escopoTipo === 'POLO' && resumo.poloId === expectedPoloId
    : resumo.escopoTipo === 'GLOBAL' && resumo.poloId === null;

  if (!hasExpectedScope || resumo.competencia !== competencia) {
    throw new Error('O resumo patrimonial retornou um escopo diferente do solicitado.');
  }
};

export const assertCaixaPosicaoLiquidaResumoRequest = (
  resumo: CaixaPosicaoLiquidaResumo,
  poloId: string | null | undefined,
  competencia: string,
) => {
  const expectedPoloId = normalizeCaixaPoloId(poloId);
  const hasExpectedScope = expectedPoloId
    ? resumo.escopoTipo === 'POLO' && resumo.poloId === expectedPoloId
    : resumo.escopoTipo === 'GLOBAL' && resumo.poloId === null;

  if (!hasExpectedScope || resumo.competencia !== competencia) {
    throw new Error('A posição líquida retornou um escopo diferente do solicitado.');
  }
};

export const assertCaixaPosicaoTotalResumoRequest = (
  resumo: CaixaPosicaoTotalResumo,
  poloId: string | null | undefined,
  competencia: string,
) => {
  const expectedPoloId = normalizeCaixaPoloId(poloId);
  const hasExpectedScope = expectedPoloId
    ? resumo.escopoTipo === 'POLO' && resumo.poloId === expectedPoloId
    : resumo.escopoTipo === 'GLOBAL' && resumo.poloId === null;

  if (!hasExpectedScope || resumo.competencia !== competencia) {
    throw new Error('A posição total retornou um escopo diferente do solicitado.');
  }
};
