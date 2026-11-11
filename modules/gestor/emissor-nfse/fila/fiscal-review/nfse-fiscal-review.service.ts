import { mapNfseTransportError } from '../../services/nfse.errors';
import { createNfseFiscalReviewService } from './nfse-fiscal-review.service-core';

export const nfseFiscalReviewService = createNfseFiscalReviewService(async (name, args, signal) => {
  const { supabase } = await import('../../../../../lib/supabase');
  const request = supabase.rpc(name, args).retry(false);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) {
    if (['40001', '23505'].includes(error.code)) throw new Error('Os dados mudaram desde a conferência. Atualize a revisão antes de salvar.');
    if (error.code === '22023') throw new Error('Confira o modelo, o tomador e as datas fiscais antes de salvar a revisão.');
    throw mapNfseTransportError(error);
  }
  return data;
});
