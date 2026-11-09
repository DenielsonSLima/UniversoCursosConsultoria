import { mapNfseTransportError } from '../nfse.errors';
import { createNfseConfigurationService } from './configuration.service-core';

// Enable only alongside the reviewed configuration migrations. This is not fiscal readiness.
export const NFSE_CONFIGURATION_ENABLED: boolean = true;
export const nfseConfigurationService=createNfseConfigurationService(async (name,args,signal) => {
  const { supabase }=await import('../../../../../lib/supabase');
  const request=supabase.rpc(name,args).retry(false);
  if (signal) request.abortSignal(signal);
  const { data,error }=await request;
  if (error) throw mapNfseTransportError(error);
  return data;
},NFSE_CONFIGURATION_ENABLED);
