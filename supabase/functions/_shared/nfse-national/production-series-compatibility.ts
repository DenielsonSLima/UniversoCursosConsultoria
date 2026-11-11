import { Buffer } from 'node:buffer';
import { PRODUCTION_SCHEMAS } from './schemas/production.generated.ts';
import { requireContract } from './xml.ts';

/** A derived, named profile, never a replacement for or claim about the official originals. */
export const PRODUCTION_SERIES_COMPATIBILITY = Object.freeze({
  id: 'PRODUCTION_NUMERIC_SERIES_COMPATIBILITY_20260209',
  activation: 'AUTHORIZED_REFERENCE_XML_VERIFIED',
  authorizedReferenceSha256: 'c0c8d82883e4b4b8c861435701d5260ec14eda1c8625b1edf216e8c4b7ad6bf3',
  sourceZipSha256: 'e7935cbd9470527c6cc32984c1b2263e614183bf0139ce2733eaaed2de9a8072',
  filename: 'tiposSimples_v1.01.xsd',
  originalSha256: '830ea116c34d7310699e34b214b7214a65f7e5d3b1f09aeaa702f7e3f4283b17',
  derivedSha256: '0d07f9c607af4df1449d21ccedd8eb1ef30df04f21f9f50f4e2f18a805a762fa',
  before: '<xs:pattern value="^0{0,4}\\d{1,5}$"/>',
  after: '<xs:pattern value="0{0,4}\\d{1,5}"/>',
  rule: 'Only remove the two literal anchors in TSSerieDPS. Preserve every other byte.',
  apiSeries: '1..49999; enforced independently by the production builder and executor',
  reference: 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx',
});

export function deriveProductionNumericSeriesSchemas(): typeof PRODUCTION_SCHEMAS {
  const evidence = PRODUCTION_SERIES_COMPATIBILITY;
  const resource = PRODUCTION_SCHEMAS[evidence.filename];
  requireContract(resource.sha256 === evidence.originalSha256, 'PRODUCTION_COMPATIBILITY_SOURCE_MISMATCH');
  const original = Buffer.from(resource.base64, 'base64').toString('utf8');
  const start = original.indexOf('<xs:simpleType name="TSSerieDPS">');
  const end = original.indexOf('</xs:simpleType>', start);
  requireContract(start !== -1 && end > start && original.indexOf(evidence.before) > start &&
    original.indexOf(evidence.before) < end && original.split(evidence.before).length === 2,
    'PRODUCTION_COMPATIBILITY_PATCH_MISMATCH');
  const derived = original.replace(evidence.before, evidence.after);
  return { ...PRODUCTION_SCHEMAS, [evidence.filename]: { sha256: evidence.derivedSha256,
    base64: Buffer.from(derived, 'utf8').toString('base64') } };
}
