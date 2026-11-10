import { mapNfseTransportError } from '../services/nfse.errors';
import { createNfseQueueService } from './nfse-queue.service-core';

export const nfseQueueService = createNfseQueueService(async (name, args, signal) => {
  const { supabase } = await import('../../../../lib/supabase');
  const request = supabase.rpc(name, args).retry(false);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) {
    if (name === 'remove_nfse_queue_documents_secure' && ['40001', '22023', '23505'].includes(error.code)) {
      throw new Error('A seleção mudou ou não está mais disponível. Nenhuma nova exclusão foi confirmada. Revise os pendentes.');
    }
    if (error.code === '40001' || error.code === '23505') {
      throw new Error('O modelo ou os recebimentos mudaram, ou já estão reservados. Atualize e revise a seleção.');
    }
    if (error.code === '22023') throw new Error('Revise o mês, os alunos e o modelo antes de preparar as notas.');
    throw mapNfseTransportError(error);
  }
  return data;
});
