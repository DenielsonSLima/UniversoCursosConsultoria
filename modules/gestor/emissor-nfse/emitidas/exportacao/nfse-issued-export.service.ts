import { createNfseIssuedExportService } from './nfse-issued-export.service-core';
import { mapNfseTransportError } from '../../services/nfse.errors';
import { NFSE_BACKEND_ENABLED } from '../../services/nfse.runtime';

export type { NfseIssuedExportFilters, NfseIssuedExportReport } from './nfse-issued-export.service-core';

export const fetchNfseIssuedExportReport = createNfseIssuedExportService(async (name, args, signal) => {
  const { supabase } = await import('../../../../../lib/supabase');
  const request = supabase.rpc(name, args);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) {
    if (error.code === '22023' && error.details === 'NFSE_REPORT_TOO_LARGE') throw new Error('O relatório aceita até 10.000 notas. Reduza o período ou refine os filtros para exportar.');
    throw mapNfseTransportError(error);
  }
  return data;
}, NFSE_BACKEND_ENABLED);
