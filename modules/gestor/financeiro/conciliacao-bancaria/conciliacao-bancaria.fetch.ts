import { supabase } from '../../../../lib/supabase';
import type { GatewayEnvironment } from '../../configuracoes/integracao-bancaria/integracao-bancaria.service';
import {
  BaneseSyncSummary,
  type CanalBaixaConciliacao,
  EMPTY_API_SYNC_SUMMARY,
  classifySettlementChannel,
  getMaceioDateKey,
} from './conciliacao-bancaria.utils';

export type { CanalBaixaConciliacao } from './conciliacao-bancaria.utils';

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
  gatewayStatus?: string;
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
    .select('id, descricao, status, valor, data_vencimento, data_pagamento, valor_pago, origem_pagamento, forma_pagamento, manual_settlement_id, manual_settlement_reversed_at, gateway_provider, gateway_status, gateway_synced_at, gateway_last_error, gateway_boleto_nosso_numero, gateway_payment_id, gateway_payment_method, gateway_submission_channel, updated_at')
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

  const syncSummaryQuery = supabase.rpc(
    'get_banese_reconciliation_sync_summary_secure',
    { p_environment: environment },
  );

  const [
    listResult,
    pendingCountResult,
    paidTodayCountResult,
    errorCountResult,
    transactionsResult,
    syncSummaryResult,
  ] = await Promise.all([
    listQuery,
    pendingCountQuery,
    paidTodayCountQuery,
    errorCountQuery,
    transactionsQuery,
    syncSummaryQuery,
  ]);

  if (listResult.error) throw listResult.error;
  if (pendingCountResult.error) throw pendingCountResult.error;
  if (paidTodayCountResult.error) throw paidTodayCountResult.error;
  if (errorCountResult.error) throw errorCountResult.error;
  if (transactionsResult.error) throw transactionsResult.error;
  if (syncSummaryResult.error) throw syncSummaryResult.error;

  const receivables: BaneseReceivable[] = (listResult.data || []).map((row: any) => {
    const status = normalizeString(row.status).toUpperCase();
    const syncedAt = normalizeString(row.gateway_synced_at) === '-' ? undefined : toSafeText(row.gateway_synced_at);
    const canalBaixa = classifySettlementChannel({
      status,
      origemPagamento: row.origem_pagamento,
      manualSettlementId: row.manual_settlement_id,
      manualSettlementReversedAt: row.manual_settlement_reversed_at,
      gatewayProvider: row.gateway_provider,
      gatewayPaymentMethod: row.gateway_payment_method,
      gatewayStatus: row.gateway_status,
      gatewaySubmissionChannel: row.gateway_submission_channel,
    });

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
      gatewayStatus: normalizeString(row.gateway_status),
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
  const syncPayload = syncSummaryResult.data && typeof syncSummaryResult.data === 'object'
    ? syncSummaryResult.data as Record<string, BaneseSyncSummary>
    : {};
  const apiSync = syncPayload.apiSync || { ...EMPTY_API_SYNC_SUMMARY };
  const cnab240Sync = syncPayload.cnab240Sync || { ...EMPTY_API_SYNC_SUMMARY };

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
