import { mapNfseTransportError } from '../../services/nfse.errors';
import { createNfseModelPartnerService } from './nfse-model-partners.service-core';
export type { NfseModelPartnerOption } from './nfse-model-partners.service-core';

export const nfseModelPartnersService = createNfseModelPartnerService(async (name, args, signal) => {
  const { supabase } = await import('../../../../../lib/supabase');
  const request = supabase.rpc(name, args).retry(false);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw mapNfseTransportError(error);
  return data;
});
