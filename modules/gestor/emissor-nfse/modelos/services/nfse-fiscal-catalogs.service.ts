import type { NfseFiscalCatalogs } from '../catalogos/nfse-fiscal-catalogs.types';

/** Load the versioned official tables only when the model form is opened. */
export async function loadNfseFiscalCatalogs(): Promise<NfseFiscalCatalogs> {
  const { default: catalogs } = await import('../catalogos/generated/nfse-fiscal-catalogs.json');
  return catalogs;
}
