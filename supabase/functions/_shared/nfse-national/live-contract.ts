import { NfseContractError } from './xml.ts';

/** Read-only inspection and offline cryptography do not establish national SEFIN acceptance. */
export const NATIONAL_LIVE_CONTRACT = Object.freeze({
  status: 'UNVERIFIED' as const,
  schemaPackage: 'NFSe-ESQUEMAS_XSD-v1.01-20260209',
  schemaZipSha256: 'e7935cbd9470527c6cc32984c1b2263e614183bf0139ce2733eaaed2de9a8072',
  homologationSchemaPackage: 'NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20261020',
  homologationSchemaZipSha256: '25fdcecc651a67a216496ab10d7566631e6ed10f721e37d62c7845dadb0ea267',
  blockers: ['CURRENT_SIGNATURE_PROFILE_UNVERIFIED', 'CURRENT_JSON_ENVELOPE_UNVERIFIED',
    'PRODUCTION_DPS_SERIES_SCHEMA_CONFLICT'] as const,
});

/** Every mutating transport route must enforce this guard before creating a socket. */
export function assertNationalLiveContract(): never {
  throw new NfseContractError('CONTRACT_UNVERIFIED');
}
