import type { NfseConfiguration } from '../../types/nfse.types';

export interface NfseConfigurationMetadata extends NfseConfiguration {
  version: number | null;
  configured: boolean;
  opSimpNac: '1' | '2' | '3' | null;
  regEspTrib: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '9' | null;
  regApTribSN: '1' | '2' | '3' | null;
}

/** Metadata only: credentials have no place in this RPC contract. */
export interface NfseConfigurationDefinition {
  municipalityCode: string;
  municipalRegistration: string;
  portalAccess: NfseConfiguration['portalAccess'];
  credentialSource: NfseConfiguration['credentialSource'];
  opSimpNac: NonNullable<NfseConfigurationMetadata['opSimpNac']>;
  regEspTrib: NonNullable<NfseConfigurationMetadata['regEspTrib']>;
  regApTribSN: NfseConfigurationMetadata['regApTribSN'];
}

export interface SaveNfseConfigurationMetadata {
  requestId: string;
  expectedVersion: number;
  definition: NfseConfigurationDefinition;
}
