import { createNfseService, type NfseRpcTransport } from './nfse.service-core';
import { mapNfseTransportError } from './nfse.errors';
import { NFSE_BACKEND_ENABLED, NFSE_WRITES_ENABLED } from './nfse.runtime';

const rpcTransport: NfseRpcTransport = async (name, args, signal) => {
  const { supabase } = await import('../../../../lib/supabase');
  const request = supabase.rpc(name, args);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw mapNfseTransportError(error);
  return data;
};

export const nfseService = createNfseService(rpcTransport, {
  reads: NFSE_BACKEND_ENABLED,
  writes: NFSE_WRITES_ENABLED,
});
