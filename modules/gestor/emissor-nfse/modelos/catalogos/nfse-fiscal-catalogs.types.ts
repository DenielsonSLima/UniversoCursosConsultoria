export interface NfseFiscalCatalogOption {
  code: string;
  description: string;
}

/** Public national domain tables; they contain no tenant or financial data. */
export interface NfseFiscalCatalogs {
  nationalServices: readonly NfseFiscalCatalogOption[];
  nbs: readonly NfseFiscalCatalogOption[];
  operationIndicators: readonly NfseFiscalCatalogOption[];
}
