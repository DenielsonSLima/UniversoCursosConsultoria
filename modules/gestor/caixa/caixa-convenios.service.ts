import { queryOptions } from '@tanstack/react-query';
import { retryDatabaseRead } from '../../../lib/database-query-retry';
import { supabase } from '../../../lib/supabase';
import { normalizeCaixaPoloId } from './caixa.service';

export type CaixaConvenioStatus = 'ABERTO' | 'FINALIZADO';

export interface CaixaConvenioResumoItem {
  convenioId: string;
  nome: string;
  competencia: string;
  status: CaixaConvenioStatus;
  saldoInicial: number;
  creditosRecebidos: number;
  despesasPagas: number;
  comprometidoAberto: number;
  saldoDisponivel: number;
  saldoProjetado: number;
}

export interface CaixaConveniosResumo {
  versao: 1;
  competencia: string;
  escopoTipo: 'GLOBAL' | 'POLO';
  poloId: string | null;
  quantidadeConvenios: number;
  saldoInicial: number;
  creditosRecebidos: number;
  despesasPagas: number;
  comprometidoAberto: number;
  saldoDisponivel: number;
  saldoProjetado: number;
  itens: CaixaConvenioResumoItem[];
}

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown, field: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Contrato inválido do resumo de convênios: ${field}.`);
  }
  return value as JsonRecord;
};

const asString = (value: unknown, field: string) => {
  if (typeof value !== 'string') {
    throw new Error(`Contrato inválido do resumo de convênios: ${field}.`);
  }
  return value;
};

const asNumber = (value: unknown, field: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Contrato inválido do resumo de convênios: ${field}.`);
  }
  return value;
};

const asInteger = (value: unknown, field: string) => {
  const parsed = asNumber(value, field);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Contrato inválido do resumo de convênios: ${field}.`);
  }
  return parsed;
};

export const mapCaixaConveniosResumo = (value: unknown): CaixaConveniosResumo => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value, 'payload');
  const versao = asNumber(payload.versao, 'versao');
  const escopoTipo = asString(payload.escopo_tipo, 'escopo_tipo');
  if (versao !== 1 || (escopoTipo !== 'GLOBAL' && escopoTipo !== 'POLO')) {
    throw new Error('Contrato incompatível do resumo de convênios do Caixa.');
  }
  const rawItems = payload.itens;
  if (!Array.isArray(rawItems)) {
    throw new Error('Contrato inválido do resumo de convênios: itens.');
  }
  const itens = rawItems.map((rawItem, index): CaixaConvenioResumoItem => {
    const item = asRecord(rawItem, `itens[${index}]`);
    const status = asString(item.status, `itens[${index}].status`);
    if (status !== 'ABERTO' && status !== 'FINALIZADO') {
      throw new Error(`Contrato inválido do resumo de convênios: itens[${index}].status.`);
    }
    return {
      convenioId: asString(item.convenio_id, `itens[${index}].convenio_id`),
      nome: asString(item.nome, `itens[${index}].nome`),
      competencia: asString(item.competencia, `itens[${index}].competencia`),
      status,
      saldoInicial: asNumber(item.saldo_inicial, `itens[${index}].saldo_inicial`),
      creditosRecebidos: asNumber(item.creditos_recebidos, `itens[${index}].creditos_recebidos`),
      despesasPagas: asNumber(item.despesas_pagas, `itens[${index}].despesas_pagas`),
      comprometidoAberto: asNumber(item.comprometido_aberto, `itens[${index}].comprometido_aberto`),
      saldoDisponivel: asNumber(item.saldo_disponivel, `itens[${index}].saldo_disponivel`),
      saldoProjetado: asNumber(item.saldo_projetado, `itens[${index}].saldo_projetado`),
    };
  });
  const poloId = payload.polo_id === null ? null : asString(payload.polo_id, 'polo_id');
  const resumo: CaixaConveniosResumo = {
    versao: 1,
    competencia: asString(payload.competencia, 'competencia'),
    escopoTipo,
    poloId,
    quantidadeConvenios: asInteger(payload.quantidade_convenios, 'quantidade_convenios'),
    saldoInicial: asNumber(payload.saldo_inicial, 'saldo_inicial'),
    creditosRecebidos: asNumber(payload.creditos_recebidos, 'creditos_recebidos'),
    despesasPagas: asNumber(payload.despesas_pagas, 'despesas_pagas'),
    comprometidoAberto: asNumber(payload.comprometido_aberto, 'comprometido_aberto'),
    saldoDisponivel: asNumber(payload.saldo_disponivel, 'saldo_disponivel'),
    saldoProjetado: asNumber(payload.saldo_projetado, 'saldo_projetado'),
    itens,
  };
  if (resumo.quantidadeConvenios !== itens.length) {
    throw new Error('Contrato inválido do resumo de convênios: quantidade divergente.');
  }
  return resumo;
};

export const assertCaixaConveniosResumoRequest = (
  resumo: CaixaConveniosResumo,
  poloId: string | null | undefined,
  competencia: string,
) => {
  const normalizedPoloId = normalizeCaixaPoloId(poloId);
  if (resumo.competencia !== competencia) {
    throw new Error('O resumo de convênios retornou uma competência diferente da solicitada.');
  }
  if (resumo.poloId !== normalizedPoloId) {
    throw new Error('O resumo de convênios retornou um escopo diferente do solicitado.');
  }
};

export const caixaConveniosQueryKeys = {
  root: ['caixa', 'convenios-resumo'] as const,
  forPolo: (poloId: string | null | undefined) => [
    'caixa',
    'convenios-resumo',
    normalizeCaixaPoloId(poloId) || 'todos',
  ] as const,
  detail: (poloId: string | null | undefined, competencia: string) => [
    ...caixaConveniosQueryKeys.forPolo(poloId),
    competencia,
  ] as const,
};

export const caixaConveniosService = {
  async getResumo(
    poloId: string | null | undefined,
    competencia: string,
    signal?: AbortSignal,
  ): Promise<CaixaConveniosResumo> {
    const normalizedPoloId = normalizeCaixaPoloId(poloId);
    const request = supabase.rpc('get_caixa_convenios_resumo_secure', {
      p_polo_id: normalizedPoloId,
      p_competencia: competencia,
    });
    if (signal) request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    const resumo = mapCaixaConveniosResumo(data);
    assertCaixaConveniosResumoRequest(resumo, normalizedPoloId, competencia);
    return resumo;
  },
};

export const caixaConveniosResumoQueryOptions = (
  poloId: string | null | undefined,
  competencia: string,
) => queryOptions({
  queryKey: caixaConveniosQueryKeys.detail(poloId, competencia),
  queryFn: ({ signal }) => caixaConveniosService.getResumo(poloId, competencia, signal),
  retry: retryDatabaseRead,
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: true,
});
