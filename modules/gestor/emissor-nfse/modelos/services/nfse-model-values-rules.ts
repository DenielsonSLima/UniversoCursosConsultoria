import { NfseContractError } from '../../services/nfse.errors';
import type { AmountBase, NfseAmountRule, NfseDocumentRule, NfsePrincipalAmountRule } from './nfse-model-values.types';

export const invalidValues = (): never => { throw new NfseContractError(); };
export function valuesRecord(value: unknown, fields: readonly string[], labels: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidValues();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !fields.includes(key) && !labels.includes(key))
    || fields.some(key => !Object.prototype.hasOwnProperty.call(row, key))) return invalidValues();
  for (const key of labels) if (row[key] !== undefined && row[key] !== null
    && (typeof row[key] !== 'string' || String(row[key]).length > 300)) return invalidValues();
  return row;
}
export const valuesChoice = <T extends string>(value: unknown, choices: readonly T[]): T =>
  typeof value === 'string' && choices.includes(value as T) ? value as T : invalidValues();
export const valuesText = (value: unknown, max: number): string | null => value === null ? null
  : typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value : invalidValues();
export const valuesCode = (value: unknown, pattern: RegExp): string =>
  typeof value === 'string' && pattern.test(value) ? value : invalidValues();
export const valuesUuid = (value: unknown): string => valuesCode(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).toLowerCase();

/** Canonical decimals only. No locale coercion or binary floating point calculations. */
export function valuesDecimal(value: unknown, kind: 'MONEY' | 'PERCENT'): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$/.test(value)) return invalidValues();
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (kind === 'PERCENT' && units > 10000n) return invalidValues();
  return value;
}
export const valuesOptionalDecimal = (value: unknown, kind: 'MONEY' | 'PERCENT'): string | null =>
  value === null ? null : valuesDecimal(value, kind);
export function parseNfseAmountRule(value: unknown, allowedBases: readonly AmountBase[]): NfseAmountRule {
  const row = valuesRecord(value, ['source', 'value', 'base']);
  const source = valuesChoice(row.source, ['NONE', 'FIXED', 'PERCENTAGE']);
  if (source === 'NONE') {
    if (row.value !== null || row.base !== null) return invalidValues();
    return { source, value: null, base: null };
  }
  const amount = valuesDecimal(row.value, source === 'FIXED' ? 'MONEY' : 'PERCENT');
  if (source === 'FIXED') {
    if (row.base !== null) return invalidValues();
    return { source, value: amount, base: null };
  }
  return { source, value: amount, base: valuesChoice(row.base, allowedBases) };
}
export function parseNfsePrincipalAmountRule(value: unknown): NfsePrincipalAmountRule {
  const row = valuesRecord(value, ['source', 'fixedAmount']);
  const source = valuesChoice(row.source, ['RECEIPTS', 'FIXED']);
  if (source === 'RECEIPTS' && row.fixedAmount !== null) return invalidValues();
  return { source, fixedAmount: source === 'FIXED' ? valuesDecimal(row.fixedAmount, 'MONEY') : null };
}
export function parseNfseDocumentRules(value: unknown): NfseDocumentRule[] {
  if (!Array.isArray(value) || value.length > 1000) return invalidValues();
  return value.map(item => {
    const row = valuesRecord(item, ['source', 'documentType', 'categoryCode', 'categoryDescription',
      'documentDescription', 'allocationMode', 'allocationValue', 'supplierSource', 'supplierPartnerId'], ['supplierPartnerLabel']);
    const allocationMode = valuesChoice(row.allocationMode, ['ELIGIBLE_AMOUNT', 'FIXED', 'PERCENTAGE']);
    const supplierSource = valuesChoice(row.supplierSource, ['DOCUMENT', 'FIXED_PARTNER', 'OMIT']);
    if ((allocationMode === 'ELIGIBLE_AMOUNT' && row.allocationValue !== null)
      || (supplierSource !== 'FIXED_PARTNER' && row.supplierPartnerId !== null)) return invalidValues();
    return {
      source: valuesChoice(row.source, ['LINKED_OPERATION_DOCUMENTS']),
      documentType: valuesChoice(row.documentType, ['NATIONAL_NFSE', 'NFE', 'CTE', 'OTHER_NATIONAL_DFE', 'MUNICIPAL_NFSE', 'NF_NFS', 'OTHER_FISCAL', 'NON_FISCAL']),
      categoryCode: valuesCode(row.categoryCode, /^[0-9]{1,3}$/),
      categoryDescription: valuesText(row.categoryDescription, 150),
      documentDescription: valuesText(row.documentDescription, 255),
      allocationMode,
      allocationValue: allocationMode === 'ELIGIBLE_AMOUNT' ? null : valuesDecimal(row.allocationValue, allocationMode === 'FIXED' ? 'MONEY' : 'PERCENT'),
      supplierSource,
      supplierPartnerId: supplierSource === 'FIXED_PARTNER' ? valuesUuid(row.supplierPartnerId) : null,
      ...(row.supplierPartnerLabel === undefined ? {} : { supplierPartnerLabel: row.supplierPartnerLabel as string | null }),
    };
  });
}
export const noNfseAmount = (): NfseAmountRule => ({ source: 'NONE', value: null, base: null });
export const amountIsNone = (rule: NfseAmountRule): boolean => rule.source === 'NONE';
