import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { orderCaixaPolosByCreation } from './caixa-polos';
import type { CaixaPolo } from './caixa-polos';
import type {
  CaixaMonthlyStatement,
  CaixaFinanciamentoResumo,
  CaixaCustosOperacionais,
  CaixaPatrimonioResumo,
  CaixaPosicaoLiquidaResumo,
  CaixaPosicaoTotalResumo
} from './caixa.types';
import {
  getCurrentCaixaCompetencia,
  normalizeCaixaPoloId,
  getCaixaScopeKey,
  assertCaixaStatementRequest,
  assertCaixaFinanciamentoResumoRequest,
  assertCaixaCustosOperacionaisRequest,
  assertCaixaPatrimonioResumoRequest,
  assertCaixaPosicaoLiquidaResumoRequest,
  assertCaixaPosicaoTotalResumoRequest
} from './caixa.contracts';
import {
  mapCaixaStatement,
  mapCaixaFinanciamentoResumo,
  mapCaixaCustosOperacionais,
  mapCaixaPatrimonioResumo,
  mapCaixaPosicaoLiquidaResumo,
  mapCaixaPosicaoTotalResumo
} from './caixa.mappers';

export type * from './caixa.types';
export * from './caixa.mappers';
export {
  getCurrentCaixaCompetencia,
  normalizeCaixaPoloId,
  assertCaixaStatementRequest,
  assertCaixaFinanciamentoResumoRequest,
  assertCaixaCustosOperacionaisRequest,
  assertCaixaPatrimonioResumoRequest,
  assertCaixaPosicaoLiquidaResumoRequest,
  assertCaixaPosicaoTotalResumoRequest,
  shiftCaixaCompetencia
} from './caixa.contracts';

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
