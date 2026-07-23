import { supabase } from '../../../../lib/supabase';
import type { GatewayEnvironment } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import {
  BaneseSyncSummary,
  BaneseTransactionAuditRow,
  buildApiSyncSummary,
  buildCnab240SyncSummary,
  EMPTY_API_SYNC_SUMMARY,
  getMaceioDateKey,
} from './conciliacao-bancaria.utils';

export type CanalBaixaConciliacao =
  | 'API_BANESE'
  | 'CNAB240'
  | 'CAIXA_MANUAL'
  | 'MERCADO_PAGO'
  | 'PENDENTE';

export interface BaneseReceivable {
  id: string;
  descricao: string;
  status: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  valorPago?: number;
  gatewaySyncedAt?: string;
  gatewayLastError?: string;
  nossoNumero?: string;
  canalBaixa?: CanalBaixaConciliacao;
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

export interface ConciliacaoDataResponse {
  receivables: BaneseReceivable[];
  transactions: BaneseTransaction[];
  summary: ConciliacaoSummary;
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

const BANESE_PENDING_STATUSES = [
  'PENDENTE',
  'VENCIDO',
  'AGUARDANDO_CONFIRMACAO',
  'AGUARDANDO_PAGAMENTO',
] as const;

const BANESE_RECONCILIATION_STATUSES = [...BANESE_PENDING_STATUSES, 'PAGO'] as const;

const createReceivableCountQuery = (environment: GatewayEnvironment) => supabase
  .from('contas_receber')
  .select('id', { count: 'exact', head: true })
  .eq('gateway_provider', 'banese_card')
  .eq('gateway_environment', environment)
  .eq('gateway_payment_method', 'BOLETO');

export const fetchConciliacaoData = async (
  environment: GatewayEnvironment,
): Promise<ConciliacaoDataResponse> => {
  const listQuery = supabase
    .from('contas_receber')
    .select('id, descricao, status, valor, data_vencimento, data_pagamento, valor_pago, gateway_synced_at, gateway_last_error, gateway_boleto_nosso_numero, gateway_payment_id, gateway_payment_method, updated_at')
    .eq('gateway_provider', 'banese_card')
    .eq('gateway_environment', environment)
    .eq('gateway_payment_method', 'BOLETO')
    .in('status', [...BANESE_RECONCILIATION_STATUSES])
    .order('updated_at', { ascending: false })
    .limit(120);

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

  const transactionsQuery = supabase
    .from('payment_gateway_transactions')
    .select('id, receivable_id, remote_payment_id, remote_status, created_at, updated_at')
    .eq('provider_code', 'banese_card')
    .eq('environment', environment)
    .order('updated_at', { ascending: false })
    .limit(20);

  const apiSyncHistoryQuery = supabase
    .from('payment_gateway_transactions')
    .select('id, created_at, updated_at, last_error')
    .eq('provider_code', 'banese_card')
    .eq('environment', environment)
    .eq('payment_method', 'BOLETO')
    .not('raw_payload->reconciliation', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5000);

  const cnabSyncHistoryQuery = supabase
    .from('payment_gateway_cnab_files')
    .select('id, created_at, updated_at, imported_at, processed_at, status, processing_summary')
    .eq('provider_code', 'banese_card')
    .eq('environment', environment)
    .eq('direction', 'RETORNO')
    .order('created_at', { ascending: false })
    .limit(5000);

  const [
    listResult,
    pendingCountResult,
    paidTodayCountResult,
    errorCountResult,
    transactionsResult,
    apiSyncHistoryResult,
    cnabSyncHistoryResult,
  ] = await Promise.all([
    listQuery,
    pendingCountQuery,
    paidTodayCountQuery,
    errorCountQuery,
    transactionsQuery,
    apiSyncHistoryQuery,
    cnabSyncHistoryQuery,
  ]);

  if (listResult.error) throw listResult.error;
  if (pendingCountResult.error) throw pendingCountResult.error;
  if (paidTodayCountResult.error) throw paidTodayCountResult.error;
  if (errorCountResult.error) throw errorCountResult.error;
  if (transactionsResult.error) throw transactionsResult.error;
  if (apiSyncHistoryResult.error) throw apiSyncHistoryResult.error;
  if (cnabSyncHistoryResult.error) throw cnabSyncHistoryResult.error;

  const receivables: BaneseReceivable[] = (listResult.data || []).map((row: any) => {
    const status = normalizeString(row.status).toUpperCase();
    const syncedAt = normalizeString(row.gateway_synced_at) === '-' ? undefined : toSafeText(row.gateway_synced_at);
    let canalBaixa: CanalBaixaConciliacao = 'PENDENTE';

    if (status === 'PAGO') {
      if (row.gateway_provider === 'mercado_pago' || row.gateway_payment_method === 'CREDIT_CARD') {
        canalBaixa = 'MERCADO_PAGO';
      } else if (row.raw_payload?.cnab || row.raw_payload?.source === 'cnab' || row.raw_payload?.reconciliation?.source === 'cnab240') {
        canalBaixa = 'CNAB240';
      } else if (syncedAt || row.gateway_payment_id) {
        canalBaixa = 'API_BANESE';
      } else {
        canalBaixa = 'CAIXA_MANUAL';
      }
    }

    return {
      id: toSafeText(row.id),
      descricao: normalizeString(row.descricao),
      status,
      valor: Number(row.valor || 0),
      dataVencimento: normalizeString(row.data_vencimento),
      dataPagamento: row.data_pagamento || undefined,
      valorPago: row.valor_pago != null ? Number(row.valor_pago) : undefined,
      gatewaySyncedAt: syncedAt,
      gatewayLastError: normalizeString(row.gateway_last_error),
      nossoNumero: normalizeString(row.gateway_boleto_nosso_numero || row.gateway_payment_id || ''),
      canalBaixa,
    };
  });

  const transactions: BaneseTransaction[] = (transactionsResult.data || []).map((row: any) => ({
    id: toSafeText(row.id),
    receivableId: toSafeText(row.receivable_id),
    remotePaymentId: normalizeString(row.remote_payment_id),
    remoteStatus: normalizeString(row.remote_status),
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
  }));

  const summary: ConciliacaoSummary = {
    totalPendentes: Number(pendingCountResult.count || 0),
    valorPendentes: null,
    totalPagoHoje: Number(paidTodayCountResult.count || 0),
    totalComErro: Number(errorCountResult.count || 0),
    apiSync: { ...EMPTY_API_SYNC_SUMMARY },
    cnab240Sync: { ...EMPTY_API_SYNC_SUMMARY },
  };
  const apiSyncHistory = (apiSyncHistoryResult.data || []).map((row: any): BaneseTransactionAuditRow => ({
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    lastError: typeof row.last_error === 'string' ? row.last_error : null,
  }));
  const cnabSyncHistory = (cnabSyncHistoryResult.data || []).map((row: any): BaneseTransactionAuditRow => ({
    createdAt: typeof row.imported_at === 'string'
      ? row.imported_at
      : typeof row.created_at === 'string' ? row.created_at : null,
    updatedAt: typeof row.processed_at === 'string'
      ? row.processed_at
      : typeof row.updated_at === 'string' ? row.updated_at : null,
    lastError: row.status === 'REJECTED' || row.status === 'PARTIAL'
      ? String(row.processing_summary?.error || row.status)
      : null,
  }));
  const apiSync = buildApiSyncSummary(apiSyncHistory);
  const cnab240Sync = buildCnab240SyncSummary(cnabSyncHistory);

  return {
    receivables,
    transactions,
    summary: {
      ...summary,
      apiSync,
      cnab240Sync,
    },
  };
};
