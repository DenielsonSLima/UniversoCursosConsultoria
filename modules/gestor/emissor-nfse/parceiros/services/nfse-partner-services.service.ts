import { createNfsePartnerServices } from './nfse-partner-services.service-core';
import { mapNfseTransportError } from '../../services/nfse.errors';

export const nfsePartnerServices = createNfsePartnerServices(async (name, args, signal) => {
  const { supabase } = await import('../../../../../lib/supabase');
  const request = supabase.rpc(name, args).retry(false);
  if (signal) request.abortSignal(signal);
  const { data, error } = await request;
  if (error) {
    if (error.code === '40001') throw new Error('Os dados mudaram. Atualize e confira a seleção antes de salvar.');
    if (error.code === '22023') throw new Error('Revise os dados do serviço e da conta a receber.');
    if (error.code === '23505') throw new Error('Já existe uma conta com esses dados. Escolha Vincular conta existente.');
    throw mapNfseTransportError(error);
  }
  return data;
});
