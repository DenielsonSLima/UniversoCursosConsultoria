import { createDanfseProjectionService } from './danfse-projection.service-core';
import { mapNfseTransportError } from '../../services/nfse.errors';

export const getDanfseProjection = createDanfseProjectionService(async (name, args, signal) => {
  const { supabase } = await import('../../../../../lib/supabase');
  const request = supabase.rpc(name, args).retry(false);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw mapNfseTransportError(error);
  return data;
});
