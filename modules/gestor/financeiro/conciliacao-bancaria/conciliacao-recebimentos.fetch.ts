import { supabase } from '../../../../lib/supabase';
import type {
  ConciliacaoListDataResponse,
  FetchConciliacaoParams,
} from './conciliacao-bancaria.fetch';
import {
  asReceiptRecord,
  channelToFinancialReceiptOrigin,
  mapFinancialReceipt,
  mapFinancialReceiptCounts,
  receiptNumber,
} from './conciliacao-recebimentos.model';

export { shouldUseFinancialReceiptsFeed } from './conciliacao-recebimentos.model';

export const fetchFinancialReceipts = async (
  params: FetchConciliacaoParams,
): Promise<ConciliacaoListDataResponse> => {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const search = params.search?.trim() || null;

  const { data, error } = await supabase.rpc('list_financial_receipts_secure', {
    p_company_id: params.companyId || null,
    p_polo_id: params.poloId || null,
    p_payment_start: params.settlementStartDate || null,
    p_payment_end: params.settlementEndDate || null,
    p_search: search,
    p_origin: channelToFinancialReceiptOrigin(params.canal),
    p_environment: params.environment,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) throw error;

  const payload = asReceiptRecord(data);
  const items = Array.isArray(payload.items) ? payload.items : [];

  return {
    receivables: items.map(mapFinancialReceipt),
    totalCount: receiptNumber(payload.total_count),
    page: receiptNumber(payload.page, page),
    pageSize: receiptNumber(payload.page_size, pageSize),
    receiptChannelCounts: mapFinancialReceiptCounts(payload.counts),
  };
};
