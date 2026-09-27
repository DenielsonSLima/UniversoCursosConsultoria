import { supabase } from '../../../lib/supabase';
import type { EditableComboboxOption } from '../components/editable-combobox.utils';

export interface MunicipalityCatalogMetadata {
  codigoIbge: string;
  uf: string;
}

export interface NationalityCatalogMetadata {
  codigoIso3: string;
  pais: string;
}

export const MUNICIPALITY_FALLBACK_OPTIONS: EditableComboboxOption<MunicipalityCatalogMetadata>[] = [
  ['ARACAJU', 'SE', '2800308'],
  ['ESTÂNCIA', 'SE', '2802106'],
  ['ITABAIANA', 'SE', '2802908'],
  ['JAPOATÃ', 'SE', '2803401'],
  ['NEÓPOLIS', 'SE', '2804409'],
  ['PROPRIÁ', 'SE', '2805703'],
  ['MACEIÓ', 'AL', '2704302'],
].map(([nome, uf, codigoIbge]) => ({
  value: `${nome}/${uf}`,
  label: `${nome}/${uf}`,
  description: `Município IBGE · ${codigoIbge}`,
  keywords: [nome, uf, codigoIbge],
  metadata: { codigoIbge, uf },
}));

export const NATIONALITY_FALLBACK_OPTIONS: EditableComboboxOption<NationalityCatalogMetadata>[] = [
  ['BRA', 'BRASIL', 'BRASILEIRA'],
  ['ARG', 'ARGENTINA', 'ARGENTINA'],
  ['BOL', 'BOLÍVIA', 'BOLIVIANA'],
  ['PRY', 'PARAGUAI', 'PARAGUAIA'],
  ['PRT', 'PORTUGAL', 'PORTUGUESA'],
  ['VEN', 'VENEZUELA', 'VENEZUELANA'],
].map(([codigoIso3, pais, nacionalidade]) => ({
  value: nacionalidade,
  label: nacionalidade,
  description: `${pais} · ${codigoIso3}`,
  keywords: [pais, codigoIso3],
  metadata: { codigoIso3, pais },
}));

export const searchMunicipalityCatalog = async (
  query: string,
): Promise<EditableComboboxOption<MunicipalityCatalogMetadata>[]> => {
  const { data, error } = await (supabase.rpc as any)('buscar_municipios_ibge', {
    p_busca: query,
    p_limite: 20,
  });
  if (error) throw error;

  return (data || []).map((row: any) => ({
    value: String(row.rotulo || `${row.nome}/${row.uf}`).toUpperCase(),
    label: String(row.rotulo || `${row.nome}/${row.uf}`).toUpperCase(),
    description: `Município IBGE · ${row.codigo_ibge}`,
    keywords: [row.nome, row.uf, String(row.codigo_ibge)],
    metadata: {
      codigoIbge: String(row.codigo_ibge),
      uf: String(row.uf || '').toUpperCase(),
    },
  }));
};

export const searchNationalityCatalog = async (
  query: string,
): Promise<EditableComboboxOption<NationalityCatalogMetadata>[]> => {
  const { data, error } = await (supabase.rpc as any)('buscar_paises_nacionalidades', {
    p_busca: query,
    p_limite: 20,
  });
  if (error) throw error;

  return (data || []).map((row: any) => ({
    value: String(row.nacionalidade || row.pais || '').toUpperCase(),
    label: String(row.nacionalidade || row.pais || '').toUpperCase(),
    description: `${row.pais} · ${row.codigo_iso3}`,
    keywords: [row.pais, row.codigo_iso3, row.rotulo],
    metadata: {
      codigoIso3: String(row.codigo_iso3 || '').toUpperCase(),
      pais: String(row.pais || '').toUpperCase(),
    },
  }));
};
