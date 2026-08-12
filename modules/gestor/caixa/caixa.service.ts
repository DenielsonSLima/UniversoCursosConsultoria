import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { orderCaixaPolosByCreation } from './caixa-polos';
import type { CaixaPolo } from './caixa-polos';
import {
  isCaixaCanonicalDecimalText,
  isCaixaSignedCanonicalDecimalText,
} from './caixa.formatters';

export type CaixaResultStatus = 'POSITIVO' | 'NEGATIVO' | 'NEUTRO';
export type CaixaScopeType = 'GLOBAL' | 'POLO';
export type CaixaAccountValueType = 'SALDO_CONTA' | 'POSICAO_POLO';

export interface CaixaMonthlyStatement {
  versao: number;
  meta: {
    competencia: string;
    periodoInicio: string;
    periodoFimExclusivo: string;
    geradoEm: string;
    escopoTipo: CaixaScopeType;
    poloId: string | null;
    escopoRotulo: string;
    fonteSaldo: 'CONTABIL_SISTEMA';
    extratoBancarioDisponivel: boolean;
  };
  saldosHoje: {
    registradoTotal: number;
    bancarioRegistrado: number;
    caixaLocal: number;
    compartilhadoTotal: number;
    posicaoCompartilhadaEscopo: number;
    naoAtribuido: number;
  };
  resumoCompetencia: {
    entradasRecebidasBrutas: number;
    tarifasBancariasConfirmadas: number;
    saidasPagas: number;
    resultado: number;
    resultadoStatus: CaixaResultStatus;
    quantidadeRecebimentos: number;
    quantidadePagamentos: number;
  };
  compromissos: {
    aReceber: number;
    receberVencido: number;
    aPagar: number;
    pagarVencido: number;
  };
  receitasPorModalidade: Array<{
    codigo: string;
    rotulo: string;
    valor: number;
    quantidade: number;
    percentual: number;
  }>;
  despesasPorCategoria: Array<{
    codigo: string;
    rotulo: string;
    valor: number;
    quantidade: number;
    percentual: number;
  }>;
  serieMensal: Array<{
    competencia: string;
    rotulo: string;
    entradas: number;
    saidas: number;
    resultado: number;
    resultadoStatus: CaixaResultStatus;
    entradasEscalaPercentual: number;
    saidasEscalaPercentual: number;
  }>;
  contas: Array<{
    id: string;
    banco: string;
    agencia: string;
    conta: string;
    titular: string;
    cidadeUf: string;
    natureza: 'BANCARIA' | 'CAIXA_INTERNO';
    compartilhada: boolean;
    unidadesUso: number;
    valorExibido: number;
    tipoValorExibido: CaixaAccountValueType;
    saldoTotalRegistrado: number;
    posicaoGerencialEscopo: number;
    ativo: boolean;
    codigoInterno: string;
  }>;
  classificacao: {
    quantidadeSemPolo: number;
    valorSemPolo: number;
  };
  conciliacao: {
    recebimentosConciliados: number;
    pagamentosConciliados: number;
    pendentes: number;
    ultimaAtualizacao: string | null;
  };
  qualidadeDados: {
    movimentosSemPolo: number;
    pagamentosSemConta: number;
    pagamentosSemData: number;
    receitasSemModalidade: number;
    tarifasEstimadasIgnoradas: number;
  };
}

/**
 * Leitura canônica do financiamento no Caixa.
 *
 * Os valores são calculados e devolvidos pela RPC. Esta camada não deriva
 * saldos, cobertura nem rateios no navegador.
 */
export interface CaixaFinanciamentoResumo {
  competencia: string;
  creditoLiberadoMatriz: number;
  obrigacaoRateada: number;
  principalRateado: number;
  encargosRateados: number;
  pagoRateado: number;
  observacao: string | null;
}

/**
 * Leitura econômica por polo. Diferente do extrato físico: distribui uma
 * conta rateada entre as unidades sem multiplicar banco, pagamento ou saldo.
 */
export interface CaixaCustosOperacionais {
  competencia: string;
  poloId: string | null;
  custoCompetencia: number;
  pagoCompetencia: number;
  aPagar: number;
  vencido: number;
  custoRateadoCompetencia: number;
  rateadoAPagar: number;
  lancamentosCompetencia: number;
  rateiosCompetencia: number;
  pontoEquilibrioStatus: 'PENDENTE_DE_MARGEM';
  observacao: string;
}

/**
 * Posição patrimonial canônica por competência. Os valores monetários
 * permanecem como texto decimal para preservar os centavos devolvidos pela
 * RPC mesmo acima do limite seguro de `number` no JavaScript.
 */
export interface CaixaPatrimonioResumo {
  versao: 1;
  competencia: string;
  escopoTipo: CaixaScopeType;
  poloId: string | null;
  posicaoFechamento: {
    registrosAtivos: number;
    unidadesAtivas: number;
    valorAtivoCusto: string;
  };
  aquisicoesCompetencia: {
    registros: number;
    unidades: number;
    valorCusto: string;
  };
  perdasCompetencia: {
    movimentos: number;
    unidades: number;
    valorCusto: string;
  };
  observacao: string;
}

/**
 * Resultado canônico de patrimônio a custo menos saldo de empréstimos ainda
 * devido no fechamento. Valores monetários são texto decimal para manter os
 * centavos exatos, inclusive quando o resultado é negativo.
 */
export interface CaixaPosicaoLiquidaResumo {
  versao: 1;
  competencia: string;
  escopoTipo: CaixaScopeType;
  poloId: string | null;
  valorPatrimonialCusto: string;
  saldoEmprestimosAPagar: string;
  valorLiquido: string;
  observacao: string;
}

/**
 * A posição total registrada combina três posições canônicas no mesmo corte:
 * caixa, patrimônio a custo e empréstimos a pagar. Os valores continuam como
 * texto decimal, pois esse contrato nunca deve ser recomposto pelo cliente.
 */
export interface CaixaPosicaoTotalDados {
  saldoCaixaRegistrado: string;
  valorPatrimonialCusto: string;
  saldoEmprestimosAPagar: string;
  valorTotalLiquido: string;
  observacao: string;
}

interface CaixaPosicaoTotalResumoBase {
  versao: 1;
  competencia: string;
  dataCorte: string;
  escopoTipo: CaixaScopeType;
  poloId: string | null;
}

export type CaixaPosicaoTotalResumo =
  | (CaixaPosicaoTotalResumoBase & {
    disponivel: true;
    dados: CaixaPosicaoTotalDados;
  })
  | (CaixaPosicaoTotalResumoBase & {
    disponivel: false;
    motivo: 'ACESSO_RESTRITO' | 'HISTORICO_INSUFICIENTE';
    observacao: string;
  });

type RawItem = Record<string, unknown>;

const isRecord = (value: unknown): value is RawItem => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const asRecord = (value: unknown): RawItem => (
  isRecord(value)
    ? value as RawItem
    : {}
);

const asArray = (value: unknown): RawItem[] => (
  Array.isArray(value) ? value.map(asRecord) : []
);

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asString = (value: unknown) => (
  typeof value === 'string' ? value : ''
);

const asResultStatus = (value: unknown): CaixaResultStatus => {
  if (value === 'POSITIVO' || value === 'NEGATIVO') return value;
  return 'NEUTRO';
};

const isNumericValue = (value: unknown) => (
  value !== null
  && value !== ''
  && Number.isFinite(Number(value))
);

const isNonNegativeSafeInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0;
};

const isCaixaDate = (value: unknown): value is string => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
);

const assertStatementPayload = (payload: RawItem) => {
  const meta = payload.meta;
  const saldos = payload.saldos_hoje;
  const resumo = payload.resumo_competencia;
  const compromissos = payload.compromissos;

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
    || !requiredNumbers.every(isNumericValue)
  ) {
    throw new Error('Contrato inválido da prestação mensal do Caixa.');
  }
};

const assertFinanciamentoResumoPayload = (payload: RawItem) => {
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

const assertCustosOperacionaisPayload = (payload: RawItem) => {
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

const assertPatrimonioResumoPayload = (payload: RawItem) => {
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

const assertPosicaoLiquidaResumoPayload = (payload: RawItem) => {
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

const assertPosicaoTotalResumoPayload = (payload: RawItem) => {
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

const getCaixaScopeKey = (poloId: string | null | undefined) => (
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

export const mapCaixaStatement = (value: unknown): CaixaMonthlyStatement => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertStatementPayload(payload);
  const meta = asRecord(payload.meta);
  const saldos = asRecord(payload.saldos_hoje);
  const resumo = asRecord(payload.resumo_competencia);
  const compromissos = asRecord(payload.compromissos);
  const classificacao = asRecord(payload.classificacao);
  const conciliacao = asRecord(payload.conciliacao);
  const qualidade = asRecord(payload.qualidade_dados);

  return {
    versao: asNumber(payload.versao),
    meta: {
      competencia: asString(meta.competencia),
      periodoInicio: asString(meta.periodo_inicio),
      periodoFimExclusivo: asString(meta.periodo_fim_exclusivo),
      geradoEm: asString(meta.gerado_em),
      escopoTipo: meta.escopo_tipo === 'POLO' ? 'POLO' : 'GLOBAL',
      poloId: typeof meta.polo_id === 'string' ? meta.polo_id : null,
      escopoRotulo: asString(meta.escopo_rotulo),
      fonteSaldo: 'CONTABIL_SISTEMA',
      extratoBancarioDisponivel: meta.extrato_bancario_disponivel === true,
    },
    saldosHoje: {
      registradoTotal: asNumber(saldos.registrado_total),
      bancarioRegistrado: asNumber(saldos.bancario_registrado),
      caixaLocal: asNumber(saldos.caixa_local),
      compartilhadoTotal: asNumber(saldos.compartilhado_total),
      posicaoCompartilhadaEscopo: asNumber(saldos.posicao_compartilhada_escopo),
      naoAtribuido: asNumber(saldos.nao_atribuido),
    },
    resumoCompetencia: {
      entradasRecebidasBrutas: asNumber(resumo.entradas_recebidas_brutas),
      tarifasBancariasConfirmadas: asNumber(resumo.tarifas_bancarias_confirmadas),
      saidasPagas: asNumber(resumo.saidas_pagas),
      resultado: asNumber(resumo.resultado),
      resultadoStatus: asResultStatus(resumo.resultado_status),
      quantidadeRecebimentos: asNumber(resumo.quantidade_recebimentos),
      quantidadePagamentos: asNumber(resumo.quantidade_pagamentos),
    },
    compromissos: {
      aReceber: asNumber(compromissos.a_receber),
      receberVencido: asNumber(compromissos.receber_vencido),
      aPagar: asNumber(compromissos.a_pagar),
      pagarVencido: asNumber(compromissos.pagar_vencido),
    },
    receitasPorModalidade: asArray(payload.receitas_por_modalidade).map((item) => ({
      codigo: asString(item.codigo),
      rotulo: asString(item.rotulo),
      valor: asNumber(item.valor),
      quantidade: asNumber(item.quantidade),
      percentual: asNumber(item.percentual),
    })),
    despesasPorCategoria: asArray(payload.despesas_por_categoria).map((item) => ({
      codigo: asString(item.codigo),
      rotulo: asString(item.rotulo),
      valor: asNumber(item.valor),
      quantidade: asNumber(item.quantidade),
      percentual: asNumber(item.percentual),
    })),
    serieMensal: asArray(payload.serie_mensal).map((item) => ({
      competencia: asString(item.competencia),
      rotulo: asString(item.rotulo),
      entradas: asNumber(item.entradas),
      saidas: asNumber(item.saidas),
      resultado: asNumber(item.resultado),
      resultadoStatus: asResultStatus(item.resultado_status),
      entradasEscalaPercentual: asNumber(item.entradas_escala_percentual),
      saidasEscalaPercentual: asNumber(item.saidas_escala_percentual),
    })),
    contas: asArray(payload.contas).map((item) => ({
      id: asString(item.id),
      banco: asString(item.banco),
      agencia: asString(item.agencia),
      conta: asString(item.conta),
      titular: asString(item.titular),
      cidadeUf: asString(item.cidade_uf),
      natureza: item.natureza === 'CAIXA_INTERNO' ? 'CAIXA_INTERNO' : 'BANCARIA',
      compartilhada: item.compartilhada === true,
      unidadesUso: asNumber(item.unidades_uso),
      valorExibido: asNumber(item.valor_exibido),
      tipoValorExibido: item.tipo_valor_exibido === 'POSICAO_POLO'
        ? 'POSICAO_POLO'
        : 'SALDO_CONTA',
      saldoTotalRegistrado: asNumber(item.saldo_total_registrado),
      posicaoGerencialEscopo: asNumber(item.posicao_gerencial_escopo),
      ativo: item.ativo !== false,
      codigoInterno: asString(item.codigo_interno),
    })),
    classificacao: {
      quantidadeSemPolo: asNumber(classificacao.quantidade_sem_polo),
      valorSemPolo: asNumber(classificacao.valor_sem_polo),
    },
    conciliacao: {
      recebimentosConciliados: asNumber(conciliacao.recebimentos_conciliados),
      pagamentosConciliados: asNumber(conciliacao.pagamentos_conciliados),
      pendentes: asNumber(conciliacao.pendentes),
      ultimaAtualizacao: typeof conciliacao.ultima_atualizacao === 'string'
        ? conciliacao.ultima_atualizacao
        : null,
    },
    qualidadeDados: {
      movimentosSemPolo: asNumber(qualidade.movimentos_sem_polo),
      pagamentosSemConta: asNumber(qualidade.pagamentos_sem_conta),
      pagamentosSemData: asNumber(qualidade.pagamentos_sem_data),
      receitasSemModalidade: asNumber(qualidade.receitas_sem_modalidade),
      tarifasEstimadasIgnoradas: asNumber(qualidade.tarifas_estimadas_ignoradas),
    },
  };
};

export const mapCaixaFinanciamentoResumo = (value: unknown): CaixaFinanciamentoResumo => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertFinanciamentoResumoPayload(payload);

  return {
    competencia: asString(payload.competencia),
    creditoLiberadoMatriz: asNumber(payload.credito_liberado_matriz),
    obrigacaoRateada: asNumber(payload.obrigacao_rateada),
    principalRateado: asNumber(payload.principal_rateado),
    encargosRateados: asNumber(payload.encargos_rateados),
    pagoRateado: asNumber(payload.pago_rateado),
    observacao: typeof payload.observacao === 'string' ? payload.observacao : null,
  };
};

export const mapCaixaCustosOperacionais = (value: unknown): CaixaCustosOperacionais => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertCustosOperacionaisPayload(payload);

  return {
    competencia: asString(payload.competencia),
    poloId: typeof payload.polo_id === 'string' ? payload.polo_id : null,
    custoCompetencia: asNumber(payload.custo_competencia),
    pagoCompetencia: asNumber(payload.pago_competencia),
    aPagar: asNumber(payload.a_pagar),
    vencido: asNumber(payload.vencido),
    custoRateadoCompetencia: asNumber(payload.custo_rateado_competencia),
    rateadoAPagar: asNumber(payload.rateado_a_pagar),
    lancamentosCompetencia: asNumber(payload.lancamentos_competencia),
    rateiosCompetencia: asNumber(payload.rateios_competencia),
    pontoEquilibrioStatus: 'PENDENTE_DE_MARGEM',
    observacao: asString(payload.observacao),
  };
};

export const mapCaixaPatrimonioResumo = (value: unknown): CaixaPatrimonioResumo => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertPatrimonioResumoPayload(payload);
  const posicao = asRecord(payload.posicao_fechamento);
  const aquisicoes = asRecord(payload.aquisicoes_competencia);
  const perdas = asRecord(payload.perdas_competencia);

  return {
    versao: 1,
    competencia: asString(payload.competencia),
    escopoTipo: payload.escopo_tipo === 'GLOBAL' ? 'GLOBAL' : 'POLO',
    poloId: typeof payload.polo_id === 'string' ? payload.polo_id : null,
    posicaoFechamento: {
      registrosAtivos: asNumber(posicao.registros_ativos),
      unidadesAtivas: asNumber(posicao.unidades_ativas),
      valorAtivoCusto: asString(posicao.valor_ativo_custo),
    },
    aquisicoesCompetencia: {
      registros: asNumber(aquisicoes.registros),
      unidades: asNumber(aquisicoes.unidades),
      valorCusto: asString(aquisicoes.valor_custo),
    },
    perdasCompetencia: {
      movimentos: asNumber(perdas.movimentos),
      unidades: asNumber(perdas.unidades),
      valorCusto: asString(perdas.valor_custo),
    },
    observacao: asString(payload.observacao),
  };
};

export const mapCaixaPosicaoLiquidaResumo = (value: unknown): CaixaPosicaoLiquidaResumo => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertPosicaoLiquidaResumoPayload(payload);

  return {
    versao: 1,
    competencia: asString(payload.competencia),
    escopoTipo: payload.escopo_tipo === 'GLOBAL' ? 'GLOBAL' : 'POLO',
    poloId: typeof payload.polo_id === 'string' ? payload.polo_id : null,
    valorPatrimonialCusto: asString(payload.valor_patrimonial_custo),
    saldoEmprestimosAPagar: asString(payload.saldo_emprestimos_a_pagar),
    valorLiquido: asString(payload.valor_liquido),
    observacao: asString(payload.observacao),
  };
};

export const mapCaixaPosicaoTotalResumo = (value: unknown): CaixaPosicaoTotalResumo => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertPosicaoTotalResumoPayload(payload);
  const base = {
    versao: 1 as const,
    competencia: asString(payload.competencia),
    dataCorte: asString(payload.data_corte),
    escopoTipo: payload.escopo_tipo === 'GLOBAL' ? 'GLOBAL' as const : 'POLO' as const,
    poloId: typeof payload.polo_id === 'string' ? payload.polo_id : null,
  };

  if (payload.disponivel === true) {
    const dados = asRecord(payload.dados);
    return {
      ...base,
      disponivel: true,
      dados: {
        saldoCaixaRegistrado: asString(dados.saldo_caixa_registrado),
        valorPatrimonialCusto: asString(dados.valor_patrimonial_custo),
        saldoEmprestimosAPagar: asString(dados.saldo_emprestimos_a_pagar),
        valorTotalLiquido: asString(dados.valor_total_liquido),
        observacao: asString(dados.observacao),
      },
    };
  }

  return {
    ...base,
    disponivel: false,
    motivo: payload.motivo === 'ACESSO_RESTRITO'
      ? 'ACESSO_RESTRITO'
      : 'HISTORICO_INSUFICIENTE',
    observacao: asString(payload.observacao),
  };
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

export const caixaService = {
  async getPolos(): Promise<CaixaPolo[]> {
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, cidade, estado, is_matriz, created_at')
      .eq('status', 'ativo')
      .order('created_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (error) {
      console.error('Erro ao buscar os polos do Caixa:', error);
      throw error;
    }

    return orderCaixaPolosByCreation((data || []) as CaixaPolo[]);
  },

  async getMonthlyStatement(
    poloId: string | null | undefined,
    competencia: string,
  ): Promise<CaixaMonthlyStatement> {
    const normalizedPoloId = normalizeCaixaPoloId(poloId);
    const { data, error } = await supabase.rpc('get_caixa_prestacao_mensal_secure', {
      p_polo_id: normalizedPoloId,
      p_competencia: competencia,
      p_meses_historico: 6,
    });

    if (error) {
      console.error('Erro ao buscar a prestação mensal do Caixa:', error);
      throw error;
    }

    const statement = mapCaixaStatement(data);
    assertCaixaStatementRequest(statement, normalizedPoloId, competencia);
    return statement;
  },

  async getFinanciamentoResumo(
    poloId: string | null | undefined,
    competencia: string,
  ): Promise<CaixaFinanciamentoResumo> {
    const { data, error } = await supabase.rpc('get_caixa_financiamento_resumo_secure', {
      p_polo_id: normalizeCaixaPoloId(poloId),
      p_competencia: competencia,
    });

    if (error) {
      console.error('Erro ao buscar o resumo de financiamento do Caixa:', error);
      throw error;
    }

    const resumo = mapCaixaFinanciamentoResumo(data);
    assertCaixaFinanciamentoResumoRequest(resumo, competencia);
    return resumo;
  },

  async getCustosOperacionais(
    poloId: string | null | undefined,
    competencia: string,
  ): Promise<CaixaCustosOperacionais> {
    const normalizedPoloId = normalizeCaixaPoloId(poloId);
    const { data, error } = await supabase.rpc('get_caixa_custos_operacionais_secure', {
      p_polo_id: normalizedPoloId,
      p_competencia: competencia,
    });

    if (error) {
      console.error('Erro ao buscar os custos operacionais do Caixa:', error);
      throw error;
    }

    const resumo = mapCaixaCustosOperacionais(data);
    assertCaixaCustosOperacionaisRequest(resumo, normalizedPoloId, competencia);
    return resumo;
  },

  async getPatrimonioResumo(
    poloId: string | null | undefined,
    competencia: string,
  ): Promise<CaixaPatrimonioResumo> {
    const normalizedPoloId = normalizeCaixaPoloId(poloId);
    const { data, error } = await supabase.rpc('get_caixa_patrimonio_resumo_secure', {
      p_polo_id: normalizedPoloId,
      p_competencia: competencia,
    });

    if (error) {
      console.error('Erro ao buscar o resumo patrimonial do Caixa:', error);
      throw error;
    }

    const resumo = mapCaixaPatrimonioResumo(data);
    assertCaixaPatrimonioResumoRequest(resumo, normalizedPoloId, competencia);
    return resumo;
  },

  async getPosicaoLiquidaResumo(
    poloId: string | null | undefined,
    competencia: string,
  ): Promise<CaixaPosicaoLiquidaResumo> {
    const normalizedPoloId = normalizeCaixaPoloId(poloId);
    const { data, error } = await supabase.rpc('get_caixa_posicao_liquida_resumo_secure', {
      p_polo_id: normalizedPoloId,
      p_competencia: competencia,
    });

    if (error) {
      console.error('Erro ao buscar a posição líquida do Caixa:', error);
      throw error;
    }

    const resumo = mapCaixaPosicaoLiquidaResumo(data);
    assertCaixaPosicaoLiquidaResumoRequest(resumo, normalizedPoloId, competencia);
    return resumo;
  },

  async getPosicaoTotalResumo(
    poloId: string | null | undefined,
    competencia: string,
  ): Promise<CaixaPosicaoTotalResumo> {
    const normalizedPoloId = normalizeCaixaPoloId(poloId);
    const { data, error } = await supabase.rpc('get_caixa_posicao_total_resumo_secure', {
      p_polo_id: normalizedPoloId,
      p_competencia: competencia,
    });

    if (error) {
      console.error('Erro ao buscar a posição total do Caixa:', error);
      throw error;
    }

    const resumo = mapCaixaPosicaoTotalResumo(data);
    assertCaixaPosicaoTotalResumoRequest(resumo, normalizedPoloId, competencia);
    return resumo;
  },
};

export const caixaQueryKeys = {
  root: ['caixa'] as const,
  polos: ['caixa', 'polos'] as const,
  statements: ['caixa', 'statement'] as const,
  statementsForPolo: (poloId: string | null | undefined) => [
    'caixa',
    'statement',
    getCaixaScopeKey(poloId),
  ] as const,
  statement: (poloId: string | null | undefined, competencia: string) => [
    ...caixaQueryKeys.statementsForPolo(poloId),
    competencia,
  ] as const,
  // Alias mantido para as invalidações dos formulários financeiros existentes.
  dashboards: ['caixa', 'statement'] as const,
  dashboard: (poloId: string | null | undefined, competencia = getCurrentCaixaCompetencia()) => [
    ...caixaQueryKeys.statementsForPolo(poloId),
    competencia,
  ] as const,
  financiamentoResumos: ['caixa', 'financiamento-resumo'] as const,
  financiamentoResumosForPolo: (poloId: string | null | undefined) => [
    'caixa',
    'financiamento-resumo',
    getCaixaScopeKey(poloId),
  ] as const,
  financiamentoResumo: (poloId: string | null | undefined, competencia: string) => [
    ...caixaQueryKeys.financiamentoResumosForPolo(poloId),
    competencia,
  ] as const,
  custosOperacionais: ['caixa', 'custos-operacionais'] as const,
  custosOperacionaisForPolo: (poloId: string | null | undefined) => [
    'caixa',
    'custos-operacionais',
    getCaixaScopeKey(poloId),
  ] as const,
  custosOperacionaisResumo: (poloId: string | null | undefined, competencia: string) => [
    ...caixaQueryKeys.custosOperacionaisForPolo(poloId),
    competencia,
  ] as const,
  patrimonioResumos: ['caixa', 'patrimonio-resumo'] as const,
  patrimonioResumosForPolo: (poloId: string | null | undefined) => [
    'caixa',
    'patrimonio-resumo',
    getCaixaScopeKey(poloId),
  ] as const,
  patrimonioResumo: (poloId: string | null | undefined, competencia: string) => [
    ...caixaQueryKeys.patrimonioResumosForPolo(poloId),
    competencia,
  ] as const,
  posicoesLiquidas: ['caixa', 'posicao-liquida'] as const,
  posicoesLiquidasForPolo: (poloId: string | null | undefined) => [
    'caixa',
    'posicao-liquida',
    getCaixaScopeKey(poloId),
  ] as const,
  posicaoLiquida: (poloId: string | null | undefined, competencia: string) => [
    ...caixaQueryKeys.posicoesLiquidasForPolo(poloId),
    competencia,
  ] as const,
  posicoesTotais: ['caixa', 'posicao-total'] as const,
  posicoesTotaisForPolo: (poloId: string | null | undefined) => [
    'caixa',
    'posicao-total',
    getCaixaScopeKey(poloId),
  ] as const,
  posicaoTotal: (poloId: string | null | undefined, competencia: string) => [
    ...caixaQueryKeys.posicoesTotaisForPolo(poloId),
    competencia,
  ] as const,
};

export const caixaPolosQueryOptions = () => queryOptions({
  queryKey: caixaQueryKeys.polos,
  queryFn: caixaService.getPolos,
  staleTime: 0,
  gcTime: 60 * 60_000,
  refetchOnMount: 'always' as const,
});

export const caixaDashboardQueryOptions = (
  poloId?: string | null,
  competencia = getCurrentCaixaCompetencia(),
) => queryOptions({
  queryKey: caixaQueryKeys.statement(poloId, competencia),
  queryFn: () => caixaService.getMonthlyStatement(poloId, competencia),
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: true,
});

export const caixaFinanciamentoResumoQueryOptions = (
  poloId?: string | null,
  competencia = getCurrentCaixaCompetencia(),
) => queryOptions({
  queryKey: caixaQueryKeys.financiamentoResumo(poloId, competencia),
  queryFn: () => caixaService.getFinanciamentoResumo(poloId, competencia),
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: true,
});

export const caixaCustosOperacionaisQueryOptions = (
  poloId?: string | null,
  competencia = getCurrentCaixaCompetencia(),
) => queryOptions({
  queryKey: caixaQueryKeys.custosOperacionaisResumo(poloId, competencia),
  queryFn: () => caixaService.getCustosOperacionais(poloId, competencia),
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: true,
});

export const caixaPatrimonioResumoQueryOptions = (
  poloId?: string | null,
  competencia = getCurrentCaixaCompetencia(),
) => queryOptions({
  queryKey: caixaQueryKeys.patrimonioResumo(poloId, competencia),
  queryFn: () => caixaService.getPatrimonioResumo(poloId, competencia),
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: true,
});

export const caixaPosicaoLiquidaResumoQueryOptions = (
  poloId?: string | null,
  competencia = getCurrentCaixaCompetencia(),
) => queryOptions({
  queryKey: caixaQueryKeys.posicaoLiquida(poloId, competencia),
  queryFn: () => caixaService.getPosicaoLiquidaResumo(poloId, competencia),
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: true,
});

export const caixaPosicaoTotalResumoQueryOptions = (
  poloId?: string | null,
  competencia = getCurrentCaixaCompetencia(),
) => queryOptions({
  queryKey: caixaQueryKeys.posicaoTotal(poloId, competencia),
  queryFn: () => caixaService.getPosicaoTotalResumo(poloId, competencia),
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: true,
});
