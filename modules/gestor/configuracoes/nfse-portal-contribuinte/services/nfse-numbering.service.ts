import { createNfseNumberingService } from './nfse-numbering.contract';
import { mapNfseTransportError } from '../../../emissor-nfse/services/nfse.errors';

export const nfseNumberingService = createNfseNumberingService(async (name, args, signal) => {
  const { supabase } = await import('../../../../../lib/supabase');
  const request = supabase.rpc(name, args).retry(false);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw mapNfseTransportError(error);
  return data;
});
