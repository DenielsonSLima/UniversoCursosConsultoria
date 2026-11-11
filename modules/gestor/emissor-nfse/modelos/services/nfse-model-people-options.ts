import { NfseContractError } from '../../services/nfse.errors';

export interface NfseModelPeopleOptionsV1 {
  version: 1;
  competenceMode: 'ISSUE_DATE' | 'FIXED_DATE';
  competenceDate: string | null;
  dpsSeriesMode: 'AUTOMATIC' | 'CUSTOM';
  dpsSeries: string | null;
  issuerRole: 'PROVIDER' | 'RECIPIENT' | 'INTERMEDIARY';
  simpleNationalOption: 'FROM_ESTABLISHMENT' | '1' | '2' | '3';
  simpleNationalAssessment: 'FROM_ESTABLISHMENT' | '1' | '2' | '3' | null;
  recipientLocation: 'BRASIL' | 'EXTERIOR' | 'NOT_INFORMED';
  recipientIncludeAddress: boolean;
  recipientIsDestination: boolean | null;
  destinationPartnerId: string | null;
  intermediaryLocation: 'BRASIL' | 'EXTERIOR' | 'NOT_INFORMED';
  intermediaryPartnerId: string | null;
  readonly destinationPartnerLabel?: string | null;
  readonly intermediaryPartnerLabel?: string | null;
}

export interface NfseModelPeopleOptionsV2 {
  version: 2;
  competenceMode: 'ISSUE_DATE' | 'FIXED_DATE';
  competenceDate: string | null;
  dpsSeriesMode: 'AUTOMATIC' | 'CUSTOM';
  dpsSeries: string | null;
  issuerRole: 'PROVIDER' | 'RECIPIENT' | 'INTERMEDIARY';
  simpleNationalOption: 'FROM_ESTABLISHMENT' | '1' | '2' | '3';
  simpleNationalAssessment: 'FROM_ESTABLISHMENT' | '1' | '2' | '3' | null;
  recipientSource: 'AT_ISSUANCE';
  recipientAddressSource: 'FROM_PARTNER' | 'OMIT';
  recipientIsDestination: boolean | null;
  destinationSource: 'AT_ISSUANCE' | null;
  intermediarySource: 'NONE' | 'AT_ISSUANCE';
}
export type NfseModelPeopleOptions = NfseModelPeopleOptionsV1 | NfseModelPeopleOptionsV2;


const fields = ['version', 'competenceMode', 'competenceDate', 'dpsSeriesMode', 'dpsSeries',
  'issuerRole', 'simpleNationalOption', 'simpleNationalAssessment', 'recipientLocation',
  'recipientIncludeAddress', 'recipientIsDestination', 'destinationPartnerId',
  'intermediaryLocation', 'intermediaryPartnerId'] as const;
const labels = ['destinationPartnerLabel', 'intermediaryPartnerLabel'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (): never => { throw new NfseContractError(); };
const oneOf = <T extends string>(value: unknown, choices: readonly T[]): T =>
  typeof value === 'string' && choices.includes(value as T) ? value as T : fail();
const boolean = (value: unknown): boolean => typeof value === 'boolean' ? value : fail();
const partnerId = (value: unknown): string | null => value === null ? null
  : typeof value === 'string' && uuid.test(value) ? value.toLowerCase() : fail();
const label = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 300 ? value : fail();
};

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function createDefaultNfseModelPeopleOptions(): NfseModelPeopleOptionsV1 {
  return {
    version: 1, competenceMode: 'ISSUE_DATE', competenceDate: null,
    dpsSeriesMode: 'AUTOMATIC', dpsSeries: null, issuerRole: 'PROVIDER',
    simpleNationalOption: 'FROM_ESTABLISHMENT', simpleNationalAssessment: null,
    recipientLocation: 'BRASIL', recipientIncludeAddress: false,
    recipientIsDestination: null, destinationPartnerId: null,
    intermediaryLocation: 'NOT_INFORMED', intermediaryPartnerId: null,
  };
}

function parsePeopleV1(value: unknown,
  includeIbsCbs: boolean | null = null): NfseModelPeopleOptionsV1 | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (includeIbsCbs !== null && typeof includeIbsCbs !== 'boolean')) return fail();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => ![...fields, ...labels].includes(key as typeof fields[number]))
    || row.version !== 1) return fail();
  const result: NfseModelPeopleOptionsV1 = {
    version: 1,
    competenceMode: oneOf(row.competenceMode, ['ISSUE_DATE', 'FIXED_DATE']),
    competenceDate: row.competenceDate === null ? null : validDate(row.competenceDate) ? row.competenceDate : fail(),
    dpsSeriesMode: oneOf(row.dpsSeriesMode, ['AUTOMATIC', 'CUSTOM']),
    dpsSeries: row.dpsSeries === null ? null : typeof row.dpsSeries === 'string'
      && /^[0-9]{1,5}$/.test(row.dpsSeries) && Number(row.dpsSeries) >= 1 && Number(row.dpsSeries) <= 49999
      ? row.dpsSeries : fail(),
    issuerRole: oneOf(row.issuerRole, ['PROVIDER', 'RECIPIENT', 'INTERMEDIARY']),
    simpleNationalOption: oneOf(row.simpleNationalOption, ['FROM_ESTABLISHMENT', '1', '2', '3']),
    simpleNationalAssessment: row.simpleNationalAssessment === null ? null
      : oneOf(row.simpleNationalAssessment, ['FROM_ESTABLISHMENT', '1', '2', '3']),
    recipientLocation: oneOf(row.recipientLocation, ['BRASIL', 'EXTERIOR', 'NOT_INFORMED']),
    recipientIncludeAddress: boolean(row.recipientIncludeAddress),
    recipientIsDestination: row.recipientIsDestination === null ? null : boolean(row.recipientIsDestination),
    destinationPartnerId: partnerId(row.destinationPartnerId),
    intermediaryLocation: oneOf(row.intermediaryLocation, ['BRASIL', 'EXTERIOR', 'NOT_INFORMED']),
    intermediaryPartnerId: partnerId(row.intermediaryPartnerId),
    ...(row.destinationPartnerLabel === undefined ? {} : { destinationPartnerLabel: label(row.destinationPartnerLabel) }),
    ...(row.intermediaryPartnerLabel === undefined ? {} : { intermediaryPartnerLabel: label(row.intermediaryPartnerLabel) }),
  };
  if ((result.competenceMode === 'FIXED_DATE') !== (result.competenceDate !== null)
    || (includeIbsCbs === true && result.competenceMode === 'FIXED_DATE'
      && result.competenceDate !== null && result.competenceDate < '2026-01-01')
    || (result.dpsSeriesMode === 'CUSTOM') !== (result.dpsSeries !== null)
    || (['1', '2'].includes(result.simpleNationalOption) && result.simpleNationalAssessment !== null)
    || (result.simpleNationalOption === '3' && result.simpleNationalAssessment === null)
    || (result.recipientLocation === 'NOT_INFORMED' && result.recipientIncludeAddress)
    || (includeIbsCbs === true && result.recipientIsDestination === null)
    || (includeIbsCbs !== true && (result.recipientIsDestination !== null || result.destinationPartnerId !== null))
    || ((result.recipientIsDestination === false) !== (result.destinationPartnerId !== null))
    || ((result.intermediaryLocation !== 'NOT_INFORMED') !== (result.intermediaryPartnerId !== null))) return fail();
  return result;
}

const v2Fields = ['version', 'competenceMode', 'competenceDate', 'dpsSeriesMode', 'dpsSeries',
  'issuerRole', 'simpleNationalOption', 'simpleNationalAssessment', 'recipientSource',
  'recipientAddressSource', 'recipientIsDestination', 'destinationSource', 'intermediarySource'] as const;
const commonFields = ['competenceMode', 'competenceDate', 'dpsSeriesMode', 'dpsSeries',
  'issuerRole', 'simpleNationalOption', 'simpleNationalAssessment'] as const;

export function createDefaultNfseModelPeopleOptionsV2(): NfseModelPeopleOptionsV2 {
  return { version: 2, competenceMode: 'ISSUE_DATE', competenceDate: null,
    dpsSeriesMode: 'AUTOMATIC', dpsSeries: null, issuerRole: 'PROVIDER',
    simpleNationalOption: 'FROM_ESTABLISHMENT', simpleNationalAssessment: null,
    recipientSource: 'AT_ISSUANCE', recipientAddressSource: 'FROM_PARTNER',
    recipientIsDestination: null, destinationSource: null, intermediarySource: 'NONE' };
}

/** Explicit form edit: preserve reusable rules and replace participant links with operation strategies. */
export function upgradeNfseModelPeopleOptions(value: NfseModelPeopleOptions | null,
  includeIbsCbs: boolean | null): NfseModelPeopleOptionsV2 {
  if (!value) return createDefaultNfseModelPeopleOptionsV2();
  const common = Object.fromEntries(commonFields.map(key => [key, value[key]])) as Pick<NfseModelPeopleOptionsV2, typeof commonFields[number]>;
  const recipientIsDestination = includeIbsCbs === true ? value.recipientIsDestination : null;
  return { ...common, version: 2, recipientSource: 'AT_ISSUANCE',
    recipientAddressSource: value.version === 2 ? value.recipientAddressSource : value.recipientIncludeAddress ? 'FROM_PARTNER' : 'OMIT',
    recipientIsDestination, destinationSource: recipientIsDestination === false ? 'AT_ISSUANCE' : null,
    intermediarySource: value.version === 2 ? value.intermediarySource : value.intermediaryLocation === 'NOT_INFORMED' ? 'NONE' : 'AT_ISSUANCE' };
}

/** Reading never upgrades historical models or discards their historical party references. */
export function parseNfseModelPeopleOptions(value: unknown,
  includeIbsCbs: boolean | null = null): NfseModelPeopleOptions | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  if (row.version === 1) return parsePeopleV1(value, includeIbsCbs);
  if (row.version !== 2 || v2Fields.some(key => !(key in row))
    || Object.keys(row).some(key => !v2Fields.includes(key as typeof v2Fields[number]))) return fail();
  const recipientIsDestination = row.recipientIsDestination === null ? null : boolean(row.recipientIsDestination);
  const destinationSource = row.destinationSource === null ? null : oneOf(row.destinationSource, ['AT_ISSUANCE']);
  if ((includeIbsCbs === true && recipientIsDestination === null)
    || (includeIbsCbs !== true && recipientIsDestination !== null)
    || (recipientIsDestination === false) !== (destinationSource === 'AT_ISSUANCE')) return fail();
  // Reuse the mature calendar, DPS-series and Simples validation without exposing v1 fields in v2.
  const common = parsePeopleV1({ ...createDefaultNfseModelPeopleOptions(),
    ...Object.fromEntries(commonFields.map(key => [key, row[key]])), recipientIsDestination: null }, false)!;
  if (includeIbsCbs === true && common.competenceMode === 'FIXED_DATE' && common.competenceDate! < '2026-01-01') return fail();
  if (includeIbsCbs !== null && typeof includeIbsCbs !== 'boolean') return fail();
  return { ...Object.fromEntries(commonFields.map(key => [key, common[key]])), version: 2,
    recipientSource: oneOf(row.recipientSource, ['AT_ISSUANCE']),
    recipientAddressSource: oneOf(row.recipientAddressSource, ['FROM_PARTNER', 'OMIT']), recipientIsDestination, destinationSource,
    intermediarySource: oneOf(row.intermediarySource, ['NONE', 'AT_ISSUANCE']) } as NfseModelPeopleOptionsV2;
}

export function serializeNfseModelPeopleOptions(value: unknown,
  includeIbsCbs: boolean | null = null): NfseModelPeopleOptions | null {
  const parsed = parseNfseModelPeopleOptions(value, includeIbsCbs);
  if (parsed === null || parsed.version === 2) return parsed;
  return Object.fromEntries(fields.map(key => [key, parsed[key]])) as unknown as NfseModelPeopleOptionsV1;
}

export function isNfseModelPeopleOptionsComplete(value: unknown, includeIbsCbs: boolean | null): boolean {
  try { return parseNfseModelPeopleOptions(value, includeIbsCbs) !== null; }
  catch { return false; }
}
