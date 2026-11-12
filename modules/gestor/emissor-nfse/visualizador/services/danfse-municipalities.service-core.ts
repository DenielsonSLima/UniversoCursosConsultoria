import { type DanfseDocument } from '../danfse.types';
import { municipalityName, stateFromMunicipality } from '../danfse.presentation';

export interface MunicipalityRow { codigo_ibge: string | number; nome: string; uf: string }
type Lookup = (codes: string[], signal: AbortSignal) => Promise<MunicipalityRow[]>;

/** Resolve only missing labels by exact IBGE key, never by current student address or CEP. */
export function createDanfseMunicipalityResolver(lookup: Lookup) {
  return async <T extends DanfseDocument>(document: T, signal: AbortSignal): Promise<T> => {
    signal.throwIfAborted();
    const codes = [...new Set(Object.entries(document.fields)
      .filter(([path]) => path.endsWith('/cMun'))
      .flatMap(([, values]) => values)
      .filter(code => /^\d{7}$/.test(code) && municipalityName(document, code) === code))];
    if (!codes.length) return document;
    const rows = await lookup(codes, signal);
    signal.throwIfAborted();
    const names: Record<string, string> = { ...document.municipalityNames };
    for (const row of rows) {
      const code = String(row.codigo_ibge);
      if (!codes.includes(code) || row.uf !== stateFromMunicipality(code) || !row.nome?.trim()) continue;
      if (names[code] && names[code] !== row.nome.trim()) throw new Error('Município ambíguo no catálogo IBGE.');
      names[code] = row.nome.trim();
    }
    // Unknown codes remain visible instead of borrowing a different municipality.
    return { ...document, municipalityNames: names };
  };
}
