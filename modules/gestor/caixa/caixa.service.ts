import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { orderCaixaPolosByCreation } from './caixa-polos';
import type { CaixaPolo } from './caixa-polos';

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
