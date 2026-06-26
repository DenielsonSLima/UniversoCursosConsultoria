export const normalizeSearchText = (value?: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();

const consonantSignature = (value: string) => value.replace(/[aeiou\s-]+/g, '');

export const textMatchesSearch = (search: string, values: unknown[]) => {
  const normalizedSearch = normalizeSearchText(search);
  if (!normalizedSearch) return true;

  const normalizedText = normalizeSearchText(values.filter(Boolean).join(' '));
  if (normalizedText.includes(normalizedSearch)) return true;

  const compactSearch = consonantSignature(normalizedSearch);
  return compactSearch.length >= 3 && consonantSignature(normalizedText).includes(compactSearch);
};
