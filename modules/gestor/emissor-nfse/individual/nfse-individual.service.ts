import { individualTransportError } from './nfse-individual.errors';
import { createNfseIndividualService } from './nfse-individual.service-core';
export const nfseIndividualService = createNfseIndividualService(async body => {
  const { supabase } = await import('../../../../lib/supabase');
  const { data, error } = await supabase.functions.invoke('nfse-national-individual', { body });
  if (error) throw await individualTransportError(error);
  return data;
});
