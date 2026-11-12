import { createDanfseMunicipalityResolver, type MunicipalityRow } from './danfse-municipalities.service-core';

export const resolveDanfseMunicipalities = createDanfseMunicipalityResolver(async (codes, signal) => {
  const { supabase } = await import('../../../../../lib/supabase');
  const { data, error } = await supabase.from('catalogo_municipios_ibge')
    .select('codigo_ibge,nome,uf').in('codigo_ibge', codes).eq('ativo', true).abortSignal(signal);
  if (error) throw new Error('Não foi possível consultar os nomes dos municípios. Tente abrir a nota novamente.');
  return (data ?? []) as MunicipalityRow[];
});
