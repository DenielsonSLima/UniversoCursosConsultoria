import { supabase } from '../../../../lib/supabase';
import {
  BaneseSyncSummary,
  BaneseTransactionAuditRow,
  buildApiSyncSummary,
  buildCnab240SyncSummary,
  EMPTY_API_SYNC_SUMMARY,
} from './conciliacao-bancaria.utils';

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
}

export interface BaneseTransaction {
  id: string;
  receivableId: string;
  remotePaymentId: string;
  remoteStatus: string;
  createdAt: string;
  updatedAt: string;
  rawPayload: string;
}

export interface ConciliacaoSummary {
  totalPendentes: number;
  valorPendentes: number;
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
  const normalized = toSafeText(value).trim();
  return normalized || '-';
};

const makeRawPreview = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return '-';
  try {
    return JSON.stringify(payload).slice(0, 120);
  } catch {
    return '-';
  }
};

const buildConciliacaoSummary = (receivables: BaneseReceivable[]): ConciliacaoSummary => {
  const pendentes = receivables.filter((item) => item.status !== 'PAGO');
  const totalPendentes = pendentes.length;
  const valorPendentes = pendentes.reduce((acc, item) => acc + (item.valor || 0), 0);
  const totalComErro = pendentes.filter((item) => item.gatewayLastError && item.gatewayLastError !== '-').length;
  const today = new Date().toISOString().slice(0, 10);
  const totalPagoHoje = receivables.filter((item) => item.status === 'PAGO' && item.dataPagamento === today).length;

  return {
    totalPendentes,
    valorPendentes,
    totalPagoHoje,
    totalComErro,
    apiSync: { ...EMPTY_API_SYNC_SUMMARY },
    cnab240Sync: { ...EMPTY_API_SYNC_SUMMARY },
  };
};

export const fetchConciliacaoData = async (poloId?: string | null): Promise<ConciliacaoDataResponse> => {
  let pendingQuery = supabase
    .from('contas_receber')
    .select('id, descricao, status, valor, data_vencimento, data_pagamento, valor_pago, gateway_synced_at, gateway_last_error, gateway_boleto_nosso_numero, gateway_payment_id, gateway_payment_method, updated_at')
    .eq('gateway_provider', 'banese_card')
    .eq('gateway_payment_method', 'BOLETO')
    .in('status', [
      'PENDENTE',
      'VENCIDO',
      'AGUARDANDO_CONFIRMACAO',
      'AGUARDANDO_PAGAMENTO',
      'PAGO',
    ])
    .order('updated_at', { ascending: false })
    .limit(120);

  if (poloId) {
    pendingQuery = pendingQuery.eq('polo_id', poloId);
  }

  const transactionsQuery = supabase
    .from('payment_gateway_transactions')
    .select('id, receivable_id, remote_payment_id, remote_status, created_at, updated_at, raw_payload')
    .eq('provider_code', 'banese_card')
    .order('updated_at', { ascending: false })
    .limit(20);

  const apiSyncHistoryQuery = supabase
    .from('payment_gateway_transactions')
    .select('id, created_at, updated_at, raw_payload, last_error')
    .eq('provider_code', 'banese_card')
    .eq('payment_method', 'BOLETO')
    .order('created_at', { ascending: false })
    .limit(5000);

  const [pendingResult, transactionsResult, apiSyncHistoryResult] = await Promise.all([
    pendingQuery,
    transactionsQuery,
    apiSyncHistoryQuery,
  ]);

  if (pendingResult.error) throw pendingResult.error;
  if (transactionsResult.error) throw transactionsResult.error;
  if (apiSyncHistoryResult.error) throw apiSyncHistoryResult.error;

  const receivables: BaneseReceivable[] = (pendingResult.data || []).map((row: any) => ({
    id: toSafeText(row.id),
    descricao: normalizeString(row.descricao),
    status: normalizeString(row.status).toUpperCase(),
    valor: Number(row.valor || 0),
    dataVencimento: normalizeString(row.data_vencimento),
    dataPagamento: row.data_pagamento || undefined,
    valorPago: row.valor_pago != null ? Number(row.valor_pago) : undefined,
    gatewaySyncedAt: normalizeString(row.gateway_synced_at) === '-' ? undefined : toSafeText(row.gateway_synced_at),
    gatewayLastError: normalizeString(row.gateway_last_error),
    nossoNumero: normalizeString(row.gateway_boleto_nosso_numero || row.gateway_payment_id || ''),
  }));

  const transactions: BaneseTransaction[] = (transactionsResult.data || []).map((row: any) => ({
    id: toSafeText(row.id),
    receivableId: toSafeText(row.receivable_id),
    remotePaymentId: normalizeString(row.remote_payment_id),
    remoteStatus: normalizeString(row.remote_status),
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
    rawPayload: makeRawPreview(row.raw_payload),
  }));

  const summary = buildConciliacaoSummary(receivables);
  const apiSyncHistory = (apiSyncHistoryResult.data || []).map((row: any): BaneseTransactionAuditRow => ({
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    rawPayload: row.raw_payload,
    lastError: typeof row.last_error === 'string' ? row.last_error : null,
  }));
  const apiSync = buildApiSyncSummary(apiSyncHistory);
  const cnab240Sync = buildCnab240SyncSummary(apiSyncHistory);

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
