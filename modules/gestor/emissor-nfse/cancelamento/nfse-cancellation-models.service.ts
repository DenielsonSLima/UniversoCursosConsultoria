import { createNfseCancellationModelsService } from './nfse-cancellation-models.contract';
import { mapNfseTransportError } from '../services/nfse.errors';
export const nfseCancellationModelsService = createNfseCancellationModelsService(async (name, args, signal) => {
  const { supabase } = await import('../../../../lib/supabase');
  const request = supabase.rpc(name, args).retry(false); if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) {
    if (error.code === '40001') throw new Error('O modelo foi atualizado. Reabra a versão atual antes de salvar.');
    throw mapNfseTransportError(error);
  }
  return data;
});
