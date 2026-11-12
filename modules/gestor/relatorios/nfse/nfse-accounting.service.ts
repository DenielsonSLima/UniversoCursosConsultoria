import type { NfseScope } from '../../emissor-nfse/types/nfse.types';
import { unwrapNfseEnvelope } from '../../emissor-nfse/services/nfse.validation';
import { mapNfseTransportError } from '../../emissor-nfse/services/nfse.errors';
import { accountingDate, parseNfseAccountingReport, type NfseAccountingMode } from './nfse-accounting.types';

export async function fetchNfseAccountingReport(scope: NfseScope, mode: NfseAccountingMode,
  dateFrom: string, dateTo: string, signal?: AbortSignal) {
  accountingDate(dateFrom); accountingDate(dateTo);
  if (dateFrom > dateTo) throw new Error('A data inicial deve ser anterior à data final.');
  const { supabase } = await import('../../../../lib/supabase');
  signal?.throwIfAborted();
  const request = supabase.rpc('get_nfse_accounting_report_secure', {
    p_context_key: scope.contextKey, p_polo_id: scope.poloId, p_environment: scope.environment,
    p_month: scope.month, p_mode: mode, p_date_from: dateFrom, p_date_to: dateTo,
  });
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  signal?.throwIfAborted();
  if (error) throw mapNfseTransportError(error);
  const report = parseNfseAccountingReport(unwrapNfseEnvelope(data, scope), scope);
  if (report.mode !== mode || report.dateFrom !== dateFrom || report.dateTo !== dateTo)
    throw new Error('A consulta retornou um período ou modelo diferente do solicitado.');
  return report;
}
