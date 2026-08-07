import { normalizeSearchText, textMatchesSearch } from '../../../lib/search';

/**
 * Canonical form for Secretaria filters.
 *
 * NFD separates accents from their base characters, so "Débora" and "debora"
 * produce the same searchable text without changing the value shown to users.
 */
export const normalizeSecretariaSearch = (value?: string | null) =>
  normalizeSearchText(value);

export const secretariaSearchIncludes = (
  value: string | number | null | undefined,
  normalizedTerm: string,
) => (
  !normalizedTerm
  || normalizeSearchText(value).includes(normalizedTerm)
);

export const matchesSecretariaSearch = (
  term: string,
  values: Array<string | number | null | undefined>,
) => {
  return textMatchesSearch(term, values);
};
