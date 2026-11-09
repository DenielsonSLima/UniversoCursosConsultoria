import { signNationalXml, type XmlSignatureProfile } from './signature.ts';
import { NfseContractError, requireContract, type UnsignedFiscalXml } from './xml.ts';
export { NATIONAL_LIVE_CONTRACT, assertNationalLiveContract } from './live-contract.ts';

export interface NationalSchemaValidator {
  /** Must validate the exact bytes against the complete official schema, including imports. */
  validate(xml: string, schema: 'DPS_v1.01.xsd' | 'pedRegEvento_v1.01.xsd',
    environment: 'HOMOLOGACAO' | 'PRODUCAO'): Promise<void>;
}

export async function prepareNationalSignedXml(document: UnsignedFiscalXml,
  dependencies: {
    schema: NationalSchemaValidator;
    credential: { privateKeyPem: string; certificatePem: string };
    signatureProfile: XmlSignatureProfile;
  }): Promise<{ document: UnsignedFiscalXml; signedXml: string; liveReady: false }> {
  requireContract(document.schemaVersion === '1.01', 'UNSUPPORTED_SCHEMA');
  const schema = document.kind === 'DPS' ? 'DPS_v1.01.xsd' : 'pedRegEvento_v1.01.xsd';
  try {
    await dependencies.schema.validate(document.xml, schema, document.environment);
  } catch { throw new NfseContractError('XSD_VALIDATION_FAILED'); }
  const signedXml = signNationalXml(document, dependencies.credential, dependencies.signatureProfile);
  try {
    await dependencies.schema.validate(signedXml, schema, document.environment);
  } catch { throw new NfseContractError('SIGNED_XSD_VALIDATION_FAILED'); }
  return { document, signedXml, liveReady: false };
}

/** Official API operations; event retrieval is needed before retrying uncertain cancellation. */
export function nationalRoute(operation: 'ISSUE' | 'CONSULT_DPS' | 'CONSULT_NFSE' |
  'REGISTER_EVENT' | 'CONSULT_EVENTS', identifier?: string): string {
  if (operation === 'ISSUE') {
    requireContract(identifier === undefined, 'UNEXPECTED_IDENTIFIER');
    return '/nfse';
  }
  if (operation === 'CONSULT_DPS') {
    requireContract(typeof identifier === 'string' && /^DPS\d{42}$/.test(identifier), 'INVALID_DPS_ID');
    return `/dps/${identifier}`;
  }
  requireContract(typeof identifier === 'string' && /^\d{50}$/.test(identifier), 'INVALID_ACCESS_KEY');
  if (operation === 'CONSULT_NFSE') return `/nfse/${identifier}`;
  requireContract(operation === 'REGISTER_EVENT' || operation === 'CONSULT_EVENTS', 'UNSUPPORTED_OPERATION');
  return `/nfse/${identifier}/eventos`;
}
