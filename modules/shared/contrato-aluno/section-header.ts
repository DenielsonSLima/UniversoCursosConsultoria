const normalizeComparableHeader = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleUpperCase('pt-BR')
  .replace(/[^A-Z0-9]/g, '');

/**
 * O cabeçalho do modelo é um subtítulo opcional do documento, não uma segunda
 * identidade institucional. Valores legados iguais ao nome/razão social da
 * instituição são suprimidos; subtítulos próprios continuam preservados.
 */
export const normalizeContractSectionHeader = (
  value: unknown,
  institutionNames: readonly unknown[] = [],
) => {
  const header = String(value ?? '').trim();
  if (!header) return '';

  const comparableHeader = normalizeComparableHeader(header);
  const isInstitutionName = institutionNames.some((name) => (
    comparableHeader !== '' && normalizeComparableHeader(name) === comparableHeader
  ));

  return isInstitutionName ? '' : header;
};
