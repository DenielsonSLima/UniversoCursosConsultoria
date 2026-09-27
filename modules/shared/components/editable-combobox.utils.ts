export interface EditableComboboxOption<Metadata = unknown> {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
  metadata?: Metadata;
}

export const normalizeComboboxSearch = (value: string) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleUpperCase('pt-BR');

export const filterComboboxOptions = <Metadata,>(
  options: EditableComboboxOption<Metadata>[],
  query: string,
) => {
  const normalizedQuery = normalizeComboboxSearch(query);
  if (!normalizedQuery) return options;

  return options.filter((option) => normalizeComboboxSearch([
    option.value,
    option.label,
    option.description,
    ...(option.keywords || []),
  ].filter(Boolean).join(' ')).includes(normalizedQuery));
};

export const mergeComboboxOptions = <Metadata,>(
  ...groups: Array<EditableComboboxOption<Metadata>[]>
) => {
  const unique = new Map<string, EditableComboboxOption<Metadata>>();
  groups.flat().forEach((option) => {
    const key = normalizeComboboxSearch(`${option.value}|${option.label}`);
    if (!unique.has(key)) unique.set(key, option);
  });
  return Array.from(unique.values());
};
