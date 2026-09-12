import { supabase } from '../../../../lib/supabase';
import type { GatewayEnvironment } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import {
  BANESE_PENDING_STATUSES,
  BANESE_RECONCILIATION_STATUSES,
} from './conciliacao-bancaria.filters';
import {
  BaneseSyncSummary,
  type CanalBaixaConciliacao,
  EMPTY_API_SYNC_SUMMARY,
  getMaceioDateKey,
} from './conciliacao-bancaria.utils';
import { fetchFinancialReceipts } from './conciliacao-recebimentos.fetch';

export type { CanalBaixaConciliacao } from './conciliacao-bancaria.utils';

export type SourceSystemConciliacao = 'ALL' | 'PROESC' | 'BANESE';

export interface BaneseReceivable {
  id: string;
  descricao: string;
  status: string;
  sourceSystem?: string;
  sourceLabel?: string;
  statusLabel?: string;
  sourceVerification?: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  valorPago?: number;
  gatewaySyncedAt?: string;
  gatewayLastError?: string;
  gatewayStatus?: string;
  nossoNumero?: string;
  canalBaixa?: CanalBaixaConciliacao;
  empresaId?: string;
  empresaNome?: string;
  poloId?: string;
  poloNome?: string;
  clienteNome?: string;
  clienteDocumentoMascarado?: string;
  baixaRegistradaEm?: string;
  baixaTempoProveniencia?: string;
  cursoNome?: string;
  turmaNome?: string;
  matriculaCodigo?: string;
  parcelaLabel?: string;
  jurosAplicados?: number | null;
  multaAplicada?: number | null;
  acrescimoAplicado?: number | null;
  descontoAplicado?: number | null;
  diferencaNaoDiscriminada?: number | null;
  composicaoStatus?: string;
  composicaoProveniencia?: string;
  formaPagamento?: string;
  origemRecebimento?: string;
  operadorNome?: string;
  contaRecebedoraNome?: string;
  comprovanteUrl?: string;
}

export interface BaneseTransaction {
  id: string;
  receivableId: string;
  remotePaymentId: string;
  remoteStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConciliacaoSummary {
  totalPendentes: number;
  valorPendentes: number | null;
  totalPagoHoje: number;
  totalComErro: number;
  apiSync: BaneseSyncSummary;
  cnab240Sync: BaneseSyncSummary;
}

export interface FetchConciliacaoParams {
  environment: GatewayEnvironment;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  canal?: CanalBaixaConciliacao | 'TODOS';
  sourceSystem?: SourceSystemConciliacao;
  poloId?: string | null;
  companyId?: string | null;
  settlementStartDate?: string;
  settlementEndDate?: string;
}

export interface ConciliacaoChannelCounts {
  totalCount: number;
  pendenteCount: number;
  apiCount: number;
  cnabCount: number;
  caixaCount: number;
  historicoCount: number;
  proescCount: number;
  mpCount: number;
  outroCount: number;
}

export interface ConciliacaoListDataResponse {
  receivables: BaneseReceivable[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  receiptChannelCounts?: ConciliacaoChannelCounts;
}

export interface ConciliacaoOverviewDataResponse {
  summary: ConciliacaoSummary;
  channelCounts: ConciliacaoChannelCounts;
}

export interface ConciliacaoDiagnosticsDataResponse {
  transactions: BaneseTransaction[];
  apiSync: BaneseSyncSummary;
  cnab240Sync: BaneseSyncSummary;
  transactionsError: string | null;
  syncError: string | null;
  error: string | null;
}

export interface ConciliacaoDataResponse
  extends ConciliacaoListDataResponse, ConciliacaoOverviewDataResponse {
  transactions: BaneseTransaction[];
  diagnosticsError: string | null;
}

const toSafeText = (value: unknown) => (value === null || value === undefined ? '' : String(value));

const normalizeString = (value: unknown) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') {
    try {
      const obj = value as Record<string, any>;
      const message = obj.message || obj.error || obj.msg || obj.detail || JSON.stringify(obj);
      if (typeof message === 'string' && message !== '[object Object]') return message.trim();
    } catch {
      return '-';
    }
  }
  const str = String(value).trim();
  if (str === '[object Object]' || str === '{}') return '-';
  return str || '-';
};

const createReceivableCountQuery = (environment: GatewayEnvironment) => supabase
  .from('contas_receber')
  .select('id', { count: 'exact', head: true })
  .eq('gateway_provider', 'banese_card')
  .eq('gateway_environment', environment)
  .eq('gateway_payment_method', 'BOLETO');

export const fetchConciliacaoListData = async (
  input: GatewayEnvironment | FetchConciliacaoParams,
): Promise<ConciliacaoListDataResponse> => {
  const params: FetchConciliacaoParams = typeof input === 'string'
    ? { environment: input }
    : input;
  return fetchFinancialReceipts(params);
};

export const fetchConciliacaoOverviewData = async (
  environment: GatewayEnvironment,
): Promise<ConciliacaoOverviewDataResponse> => {

  const totalCountQuery = createReceivableCountQuery(environment)
    .in('status', [...BANESE_RECONCILIATION_STATUSES]);

  const pendingCountQuery = createReceivableCountQuery(environment)
    .in('status', [...BANESE_PENDING_STATUSES]);

  const paidTodayCountQuery = createReceivableCountQuery(environment)
    .eq('status', 'PAGO')
    .eq('data_pagamento', getMaceioDateKey());

  const errorCountQuery = createReceivableCountQuery(environment)
    .in('status', [...BANESE_PENDING_STATUSES])
    .not('gateway_last_error', 'is', null)
    .neq('gateway_last_error', '')
    .neq('gateway_last_error', '-');

  const apiCountQuery = createReceivableCountQuery(environment)
    .eq('status', 'PAGO')
    .eq('gateway_provider', 'banese_card')
    .in('gateway_status', ['PAID', 'PAGO', 'RECEIVED', 'CONFIRMED', 'LIQUIDATED'])
    .neq('origem_pagamento', 'PRESENCIAL')
    .is('manual_settlement_id', null);

  const cnabCountQuery = createReceivableCountQuery(environment)
    .eq('status', 'PAGO')
    .eq('gateway_submission_channel', 'CNAB');

  const mpCountQuery = createReceivableCountQuery(environment)
    .eq('status', 'PAGO')
    .or('gateway_provider.eq.mercado_pago,gateway_payment_method.eq.CREDIT_CARD');

  const caixaCountQuery = createReceivableCountQuery(environment)
    .eq('status', 'PAGO')
    .or('origem_pagamento.eq.PRESENCIAL,manual_settlement_id.not.is.null');

  const [
    totalCountResult,
    pendingCountResult,
    paidTodayCountResult,
    errorCountResult,
    apiCountResult,
    cnabCountResult,
    mpCountResult,
    caixaCountResult,
  ] = await Promise.all([
    totalCountQuery,
    pendingCountQuery,
    paidTodayCountQuery,
    errorCountQuery,
    apiCountQuery,
    cnabCountQuery,
    mpCountQuery,
    caixaCountQuery,
  ]);

  if (totalCountResult.error) throw totalCountResult.error;
  if (pendingCountResult.error) throw pendingCountResult.error;
  if (paidTodayCountResult.error) throw paidTodayCountResult.error;
  if (errorCountResult.error) throw errorCountResult.error;
  if (apiCountResult.error) throw apiCountResult.error;
  if (cnabCountResult.error) throw cnabCountResult.error;
  if (mpCountResult.error) throw mpCountResult.error;
  if (caixaCountResult.error) throw caixaCountResult.error;

  const summary: ConciliacaoSummary = {
    totalPendentes: Number(pendingCountResult.count || 0),
    valorPendentes: null,
    totalPagoHoje: Number(paidTodayCountResult.count || 0),
    totalComErro: Number(errorCountResult.count || 0),
    apiSync: { ...EMPTY_API_SYNC_SUMMARY },
    cnab240Sync: { ...EMPTY_API_SYNC_SUMMARY },
  };

  const channelCounts: ConciliacaoChannelCounts = {
    totalCount: Number(totalCountResult.count || 0),
    pendenteCount: Number(pendingCountResult.count || 0),
    apiCount: Number(apiCountResult.count || 0),
    cnabCount: Number(cnabCountResult.count || 0),
    caixaCount: Number(caixaCountResult.count || 0),
    historicoCount: 0,
    proescCount: 0,
    mpCount: Number(mpCountResult.count || 0),
    outroCount: 0,
  };

  return {
    summary,
    channelCounts,
  };
};

export const fetchConciliacaoDiagnosticsData = async (
  environment: GatewayEnvironment,
): Promise<ConciliacaoDiagnosticsDataResponse> => {
  const [transactionsResult, syncSummaryResult] = await Promise.all([
    supabase
      .from('payment_gateway_transactions')
      .select('id, receivable_id, remote_payment_id, remote_status, created_at, updated_at')
      .eq('provider_code', 'banese_card')
      .eq('environment', environment)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase.rpc(
      'get_banese_reconciliation_sync_summary_secure',
      { p_environment: environment },
    ),
  ]);

  const transactions: BaneseTransaction[] = transactionsResult.error
    ? []
    : (transactionsResult.data || []).map((row: any) => ({
      id: toSafeText(row.id),
      receivableId: toSafeText(row.receivable_id),
      remotePaymentId: normalizeString(row.remote_payment_id),
      remoteStatus: normalizeString(row.remote_status),
      createdAt: normalizeString(row.created_at),
      updatedAt: normalizeString(row.updated_at),
    }));

  const syncPayload = !syncSummaryResult.error
    && syncSummaryResult.data
    && typeof syncSummaryResult.data === 'object'
    ? syncSummaryResult.data as Record<string, BaneseSyncSummary>
    : {};
  const transactionsError = transactionsResult.error
    ? 'O histórico recente de transações não pôde ser carregado por timeout ou indisponibilidade.'
    : null;
  const syncError = syncSummaryResult.error
    ? 'O resumo operacional da sincronização não pôde ser carregado.'
    : null;
  const errors = [transactionsError, syncError]
    .filter((message): message is string => Boolean(message));

  return {
    transactions,
    apiSync: syncPayload.apiSync || { ...EMPTY_API_SYNC_SUMMARY },
    cnab240Sync: syncPayload.cnab240Sync || { ...EMPTY_API_SYNC_SUMMARY },
    transactionsError,
    syncError,
    error: errors.length > 0 ? errors.join(' ') : null,
  };
};

export const fetchConciliacaoData = async (
  input: GatewayEnvironment | FetchConciliacaoParams,
): Promise<ConciliacaoDataResponse> => {
  const params: FetchConciliacaoParams = typeof input === 'string'
    ? { environment: input }
    : input;
  const [list, overview, diagnostics] = await Promise.all([
    fetchConciliacaoListData(params),
    fetchConciliacaoOverviewData(params.environment),
    fetchConciliacaoDiagnosticsData(params.environment),
  ]);

  return {
    ...list,
    ...overview,
    transactions: diagnostics.transactions,
    diagnosticsError: diagnostics.error,
    summary: {
      ...overview.summary,
      apiSync: diagnostics.apiSync,
      cnab240Sync: diagnostics.cnab240Sync,
    },
  };
};
