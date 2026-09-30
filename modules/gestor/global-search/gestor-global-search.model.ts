import { formatCpfCnpj } from '../../../lib/documentFormatters.ts';
import type { GestorGlobalSearchResult } from './gestor-global-search.types';

export const formatGlobalSearchDocument = (value?: string | null) =>
  formatCpfCnpj(value) || 'Documento não informado';

export const formatGlobalSearchPolo = (
  result: Pick<GestorGlobalSearchResult, 'poloCity' | 'poloState'>,
) => {
  const city = result.poloCity?.trim();
  const state = result.poloState?.trim().toUpperCase();
  return [city, state].filter(Boolean).join('/') || 'Cadastro global';
};

export const formatGlobalSearchClass = (
  result: Pick<GestorGlobalSearchResult, 'classCode' | 'className' | 'otherClasses'>,
) => {
  if (!result.className && !result.classCode) return null;
  const identity = [result.classCode, result.className]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' — ');
  const suffix = result.otherClasses > 0
    ? ` +${result.otherClasses} ${result.otherClasses === 1 ? 'outra' : 'outras'}`
    : '';
  return `${identity}${suffix}`;
};

export const buildGlobalSearchResultKey = (
  partnerId: string,
  poloId?: string | null,
) => `${partnerId}:${poloId || 'global'}`;
