import { NfseContractError } from '../../services/nfse.errors';
import { oneOf, record, string } from '../../services/nfse.validation';

/** Template preferences, never an authorization or a ready-to-send fiscal payload. */
export interface NfseModelServiceOptions {
  version: 1;
  countryCode: string;
  municipalityCode: string | null;
  exportResultCountryCode: string | null;
  includeIbsCbs: boolean | null;
  governmentPurchase: boolean | null;
  governmentEntityType: '1' | '2' | '3' | '4' | null;
  operationType: '1' | '2' | '3' | '4' | '5' | null;
  countryLabel?: string | null;
  municipalityLabel?: string | null;
  exportResultCountryLabel?: string | null;
}

export const createDefaultNfseModelServiceOptions = (): NfseModelServiceOptions => ({
  version: 1, countryCode: '', municipalityCode: null, exportResultCountryCode: null,
  includeIbsCbs: null, governmentPurchase: null, governmentEntityType: null, operationType: null,
});
const nullableBoolean = (value: unknown) => {
  if (value !== null && typeof value !== 'boolean') throw new NfseContractError();
  return value as boolean | null;
};
const nullableCode = (value: unknown, pattern: RegExp) => {
  if (value === null) return null;
  const result = string(value).trim().toUpperCase();
  if (!pattern.test(result)) throw new NfseContractError();
  return result;
};
export const requiresNfseOperationType = (options: Pick<NfseModelServiceOptions,
  'includeIbsCbs' | 'governmentPurchase'>, nationalCode: string) => options.includeIbsCbs === true
  && (options.governmentPurchase === true || ['2505', '1509', '1712', '1005'].includes(nationalCode.slice(0, 4)));

export function parseNfseModelServiceOptions(value: unknown): NfseModelServiceOptions | null {
  if (value === null) return null;
  const row = record(value);
  const keys = ['version', 'countryCode', 'municipalityCode', 'exportResultCountryCode', 'includeIbsCbs',
    'governmentPurchase', 'governmentEntityType', 'operationType'];
  const labels = ['countryLabel', 'municipalityLabel', 'exportResultCountryLabel'] as const;
  if (row.version !== 1 || keys.some(key => !(key in row))
    || Object.keys(row).some(key => !keys.includes(key) && !labels.includes(key as typeof labels[number]))) {
    throw new NfseContractError();
  }
  const countryCode = nullableCode(row.countryCode, /^[A-Z]{3}$/);
  if (!countryCode) throw new NfseContractError();
  const result: NfseModelServiceOptions = {
    version: 1, countryCode, municipalityCode: nullableCode(row.municipalityCode, /^\d{7}$/),
    exportResultCountryCode: nullableCode(row.exportResultCountryCode, /^[A-Z]{3}$/),
    includeIbsCbs: nullableBoolean(row.includeIbsCbs), governmentPurchase: nullableBoolean(row.governmentPurchase),
    governmentEntityType: row.governmentEntityType === null ? null : oneOf(row.governmentEntityType, ['1', '2', '3', '4']),
    operationType: row.operationType === null ? null : oneOf(row.operationType, ['1', '2', '3', '4', '5']),
  };
  for (const key of labels) if (key in row) result[key] = row[key] === null ? null : string(row[key]).trim();
  return result;
}

export function serializeNfseModelServiceOptions(value: unknown, issTreatment: string, nationalCode: string,
  operationIndicator: string): NfseModelServiceOptions | null {
  const options = parseNfseModelServiceOptions(value);
  if (!options) return null;
  const input = { ...options };
  delete input.countryLabel;
  delete input.municipalityLabel;
  delete input.exportResultCountryLabel;
  if ((input.countryCode === 'BRA') !== (input.municipalityCode !== null)
    || (issTreatment === 'EXPORTACAO') !== (input.exportResultCountryCode !== null)) throw new NfseContractError();
  if (input.includeIbsCbs === true) {
    if (!/^\d{6}$/.test(operationIndicator) || input.governmentPurchase === null
      || (input.governmentPurchase === true) !== (input.governmentEntityType !== null)
      || requiresNfseOperationType(input, nationalCode) !== (input.operationType !== null)) throw new NfseContractError();
  } else if (input.governmentPurchase !== null || input.governmentEntityType !== null || input.operationType !== null
    || (input.includeIbsCbs === false && operationIndicator !== '')) throw new NfseContractError();
  return input;
}

export function isNfseModelServiceOptionsComplete(value: unknown, issTreatment: string, nationalCode: string,
  operationIndicator: string): boolean {
  try {
    const options = serializeNfseModelServiceOptions(value, issTreatment, nationalCode, operationIndicator);
    return options !== null && typeof options.includeIbsCbs === 'boolean';
  }
  catch { return false; }
}
