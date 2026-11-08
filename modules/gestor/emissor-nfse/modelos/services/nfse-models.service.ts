import { createNfseModelsService } from './nfse-models.service-core';
import { mapNfseTransportError } from '../../services/nfse.errors';

export const nfseModelsService = createNfseModelsService(async (name, args, signal) => {
  const { supabase } = await import('../../../../../lib/supabase');
  const request = supabase.rpc(name, args).retry(false);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw mapNfseTransportError(error);
  return data;
});
