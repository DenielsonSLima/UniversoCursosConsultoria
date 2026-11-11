import { createNfseIndividualService } from './nfse-individual.service-core';
export const nfseIndividualService = createNfseIndividualService(async body => {
  const { supabase } = await import('../../../../lib/supabase');
  const { data, error } = await supabase.functions.invoke('nfse-national-individual', { body });
  if (error) throw new Error('A etapa de produção não foi confirmada. Se o envio já começou, consulte esta mesma operação antes de tentar novamente.');
  return data;
});
