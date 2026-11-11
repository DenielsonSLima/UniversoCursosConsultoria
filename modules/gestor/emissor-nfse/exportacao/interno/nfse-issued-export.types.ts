import type { NfseDocument, NfseDocumentFilters, NfseScope } from '../../types/nfse.types';
import type { CanonicalInstitutionalHeader } from '../../../secretaria/shared/canonical-institutional-header-pdf';
import type { CanonicalPdfImage, CanonicalPdfWatermark } from '../../../secretaria/shared/canonical-document-vector-pdf.core';

/** Complete, ordered result from the authorized server query, never the visible page. */
export interface NfseIssuedExportReport {
  scope: NfseScope;
  filters: Pick<NfseDocumentFilters, 'dateFrom' | 'dateTo' | 'search' | 'courseType' | 'origin'>;
  generatedAt: string;
  rows: NfseDocument[];
  totalItems: number;
  /** Canonical backend aggregate. null means unknown and must never become zero. */
  totalAmount: string | null;
}

export interface NfseIssuedExportAssets {
  institution: CanonicalInstitutionalHeader;
  logo: CanonicalPdfImage | null;
  watermark: CanonicalPdfWatermark | null;
}

const moneyPattern = /^\d+(?:\.\d{1,2})?$/;
const validDate = (value?: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value);

export function assertNfseIssuedExportReport(report: NfseIssuedExportReport): void {
  const { scope, filters, rows, totalAmount, totalItems } = report;
  if (!scope?.poloId || !scope.contextKey || !['PRODUCAO', 'HOMOLOGACAO'].includes(scope.environment)
    || !filters || !validDate(filters.dateFrom) || !validDate(filters.dateTo)
    || (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
    || !Number.isFinite(Date.parse(report.generatedAt)) || !Number.isSafeInteger(totalItems)
    || totalItems < 0 || !Array.isArray(rows) || rows.length !== totalItems
    || (totalAmount !== null && (typeof totalAmount !== 'string' || !moneyPattern.test(totalAmount)))) {
    throw new Error('O relatório de emitidas está incompleto ou possui dados incompatíveis. Atualize a consulta.');
  }
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.id || ids.has(row.id) || row.status !== 'EMITIDA' || row.state === 'CANCELLED'
      || (row.amount !== null && (typeof row.amount !== 'string' || !moneyPattern.test(row.amount)))) {
      throw new Error('O relatório contém uma nota duplicada, cancelada ou incompatível com as emitidas.');
    }
    ids.add(row.id);
  }
}

/** String formatting preserves every cent without floating-point conversion. */
export function formatNfseIssuedReportAmount(value: string | null): string {
  if (value === null) return 'Não informado';
  if (!moneyPattern.test(value)) throw new Error('Valor monetário incompatível com o relatório.');
  const [integer, decimal = ''] = value.split('.');
  const grouped = integer.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${grouped},${decimal.padEnd(2, '0')}`;
}
