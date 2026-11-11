import type { NfseDocument, NfseDocumentFilters, NfseScope } from '../../types/nfse.types';
import type { NfseRpcTransport } from '../../services/nfse.service-core';
import { NfseContractError, NfseUnavailableError } from '../../services/nfse.errors';
import { mapNfseDocument } from '../../services/nfse.mappers';
import { assertScope, assertUniqueIds, integer, money, record, string, unwrapNfseEnvelope } from '../../services/nfse.validation';
import { nfseDocumentFilterArgs } from '../../services/nfse-document-filters';

export type NfseIssuedExportFilters = Pick<NfseDocumentFilters, 'dateFrom' | 'dateTo' | 'search' | 'courseType' | 'origin'>;
export interface NfseIssuedExportReport {
  scope: NfseScope;
  filters: NfseIssuedExportFilters;
  generatedAt: string;
  rows: NfseDocument[];
  totalItems: number;
  totalAmount: string | null;
}

export function createNfseIssuedExportService(transport: NfseRpcTransport, enabled = false) {
  return async (scope: NfseScope, filters: NfseIssuedExportFilters, signal?: AbortSignal): Promise<NfseIssuedExportReport> => {
    assertScope(scope);
    if (!enabled) throw new NfseUnavailableError();
    signal?.throwIfAborted();
    const filterArgs = nfseDocumentFilterArgs({ ...filters, status: 'EMITIDA' });
    const search = filters.search?.trim() ? string(filters.search.trim()) : null;
    const envelope = await transport('get_nfse_issued_report_secure', {
      p_polo_id: scope.poloId, p_context_key: scope.contextKey,
      p_environment: scope.environment, p_month: scope.month, p_search: search, ...filterArgs,
    }, signal);
    signal?.throwIfAborted();
    const data = record(unwrapNfseEnvelope(envelope, scope));
    const totalItems = integer(data.totalItems);
    if (!Array.isArray(data.rows) || totalItems > 10000 || data.rows.length !== totalItems
      || data.page !== 1 || data.pageSize !== 10000) throw new NfseContractError();
    const rows = data.rows.map(mapNfseDocument);
    assertUniqueIds(rows);
    if (new Set(rows.map(row => row.accessKey)).size !== rows.length
      || rows.some(row => row.status !== 'EMITIDA' || row.state === 'CANCELLED'
        || !/^\d{1,15}$/.test(row.number ?? '') || !/^\d{50}$/.test(row.accessKey ?? '')))
      throw new NfseContractError();
    const generatedAt = string(data.generatedAt);
    if (!Number.isFinite(Date.parse(generatedAt))) throw new NfseContractError();
    return { scope: { ...scope }, filters: { ...filters, search: search || '' }, generatedAt, rows,
      totalItems, totalAmount: money(data.totalAmount) };
  };
}
