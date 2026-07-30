const COMBINING_MARKS = /\p{M}+/gu;
const MULTIPLE_WHITESPACE = /\s+/g;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

export const normalizeSearchText = (value?: unknown) =>
  (value == null ? '' : String(value))
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLocaleLowerCase('pt-BR')
    .replace(MULTIPLE_WHITESPACE, ' ')
    .trim();

const consonantSignature = (value: string) => value.replace(/[aeiou\s-]+/g, '');
const compactSearchText = (value: string) => value.replace(NON_ALPHANUMERIC, '');

export const textMatchesSearch = (search: string, values: unknown[]) => {
  const normalizedSearch = normalizeSearchText(search);
  if (!normalizedSearch) return true;

  const normalizedValues = values
    .filter((value) => value != null)
    .map(normalizeSearchText)
    .filter(Boolean);
  const normalizedText = normalizedValues.join(' ');
  if (normalizedText.includes(normalizedSearch)) return true;

  const compactSearch = compactSearchText(normalizedSearch);
  if (
    compactSearch.length >= 3
    && normalizedValues.some((value) => compactSearchText(value).includes(compactSearch))
  ) {
    return true;
  }

  const consonants = consonantSignature(normalizedSearch);
  return consonants.length >= 3 && consonantSignature(normalizedText).includes(consonants);
};
