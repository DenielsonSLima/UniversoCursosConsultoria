export const NFSE_NAMESPACE = 'http://www.sped.fazenda.gov.br/nfse';

export class NfseContractError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NfseContractError';
  }
}

export function requireContract(condition: unknown, code: string): asserts condition {
  if (!condition) throw new NfseContractError(code);
}

/** Deliberately supports only the text repertoire of the verified v1.01 schemas. */
export function xmlText(value: string, min = 1, max = 2000): string {
  requireContract(typeof value === 'string' && value.length >= min && value.length <= max,
    'INVALID_XML_TEXT_LENGTH');
  requireContract(value === value.trim() && !/[^\x20-\xff\n\r\t]/u.test(value),
    'UNSUPPORTED_XML_TEXT');
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function tag(name: string, value: string): string {
  return `<${name}>${xmlText(value)}</${name}>`;
}

export function digits(value: string, length: number): string {
  requireContract(typeof value === 'string' && new RegExp(`^[0-9]{${length}}$`).test(value),
    'INVALID_DIGITS');
  return value;
}

export function date(value: string): string {
  requireContract(/^20\d\d-\d\d-\d\d$/.test(value), 'INVALID_DATE');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  requireContract(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value,
    'INVALID_DATE');
  return value;
}

export function timestamp(value: string): string {
  requireContract(/^20\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d[+-](?:0\d|1[01]):00$/.test(value),
    'INVALID_TIMESTAMP');
  date(value.slice(0, 10));
  return value;
}

export function decimal(value: string, integerDigits = 15): string {
  requireContract(typeof value === 'string' &&
    new RegExp(`^(?:0|[1-9][0-9]{0,${integerDigits - 1}})\\.[0-9]{2}$`).test(value),
  'INVALID_DECIMAL');
  return value;
}

export function exactKeys(value: object, allowed: readonly string[]): void {
  requireContract(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key)), 'UNSUPPORTED_FIELD');
}

export interface UnsignedFiscalXml {
  kind: 'DPS' | 'CANCELLATION' | 'CANCELLATION_REQUEST';
  environment: 'HOMOLOGACAO' | 'PRODUCAO';
  schemaVersion: '1.01';
  referenceId: string;
  xml: string;
}
