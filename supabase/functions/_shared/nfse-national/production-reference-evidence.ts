/** No identities, access keys or XML are stored here. The original remains outside the repository. */
export const PRODUCTION_AUTHORIZED_REFERENCE = Object.freeze({
  artifactSha256: 'c0c8d82883e4b4b8c861435701d5260ec14eda1c8625b1edf216e8c4b7ad6bf3',
  artifactBytes: 5922,
  source: 'EXISTING_AUTHORIZED_XML_DOWNLOADED_FROM_OFFICIAL_EMISSOR',
  environment: 'PRODUCAO', schemaVersion: '1.01',
  derivedFullXsdValid: true,
  originalFailure: 'PRODUCTION_DPS_SERIES_SCHEMA_CONFLICT',
  numericSeriesObserved: true,
  signatureTarget: 'infNFSe',
  signatureProfile: 'RSA_SHA1_LEGACY',
  digest: 'http://www.w3.org/2000/09/xmldsig#sha1',
  canonicalization: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  cryptographicSignatureValid: true,
  certificateValidAtProcessing: true,
  signatureTrustScope: 'PINNED_REFERENCE_EMBEDDED_CERTIFICATE',
  // The reference proves the authorized envelope. It does not contain a signed inner DPS,
  // independently prove its ICP chain/revocation, or determine taxes on another service.
  clientSignatureBasis: 'OFFICIAL_MANUAL_1.00.02_SECTION_6.1.4',
});
