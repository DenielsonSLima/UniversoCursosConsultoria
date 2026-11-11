import { Buffer } from 'node:buffer';
import { createHash, X509Certificate } from 'node:crypto';
import { SignedXml } from 'npm:xml-crypto@6.4.0';
import { parseNationalFiscalXml, nationalFiscalChild } from './pilot-response.ts';
import { createProductionNumericSeriesCompatibilityValidator } from './production-schema.ts';
import { PRODUCTION_AUTHORIZED_REFERENCE } from './production-reference-evidence.ts';
import { requireContract } from './xml.ts';

const ds = 'http://www.w3.org/2000/09/xmldsig#';
const c14n = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

/** Reproduce the pinned local evidence without returning XML, identities, keys or certificate subjects. */
export async function verifyPinnedProductionReferenceXml(xml: string) {
  const evidence = PRODUCTION_AUTHORIZED_REFERENCE;
  requireContract(createHash('sha256').update(xml).digest('hex') === evidence.artifactSha256 &&
    Buffer.byteLength(xml) === evidence.artifactBytes, 'REFERENCE_XML_HASH_MISMATCH');
  await createProductionNumericSeriesCompatibilityValidator().validate(xml, 'NFSe_v1.01.xsd', 'PRODUCAO');
  const dom = parseNationalFiscalXml(xml);
  const root = dom.documentElement;
  const info = nationalFiscalChild(root, 'infNFSe');
  const dps = nationalFiscalChild(nationalFiscalChild(info, 'DPS'), 'infDPS');
  requireContract(nationalFiscalChild(dps, 'tpAmb').textContent === '1' &&
    /^\d{1,5}$/.test(nationalFiscalChild(dps, 'serie').textContent || ''), 'REFERENCE_XML_ENVIRONMENT_MISMATCH');
  const signatures = dom.getElementsByTagNameNS(ds, 'Signature');
  requireContract(signatures.length === 1 && signatures[0].parentNode === root, 'REFERENCE_SIGNATURE_LOCATION_MISMATCH');
  const signature = signatures[0];
  const references = signature.getElementsByTagNameNS(ds, 'Reference');
  const transforms = signature.getElementsByTagNameNS(ds, 'Transform');
  requireContract(references.length === 1 && references[0].getAttribute('URI') === `#${info.getAttribute('Id')}` &&
    transforms.length === 2 && transforms[0].getAttribute('Algorithm') === `${ds}enveloped-signature` &&
    transforms[1].getAttribute('Algorithm') === c14n &&
    signature.getElementsByTagNameNS(ds, 'SignatureMethod')[0]?.getAttribute('Algorithm') === `${ds}rsa-sha1` &&
    signature.getElementsByTagNameNS(ds, 'DigestMethod')[0]?.getAttribute('Algorithm') === `${ds}sha1` &&
    signature.getElementsByTagNameNS(ds, 'CanonicalizationMethod')[0]?.getAttribute('Algorithm') === c14n,
    'REFERENCE_SIGNATURE_PROFILE_MISMATCH');
  const certificates = signature.getElementsByTagNameNS(ds, 'X509Certificate');
  requireContract(certificates.length === 1, 'REFERENCE_CERTIFICATE_COUNT_MISMATCH');
  const encoded = (certificates[0].textContent || '').replace(/\s/g, '');
  requireContract(encoded.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded), 'REFERENCE_CERTIFICATE_INVALID');
  const certificate = new X509Certificate(Buffer.from(encoded, 'base64'));
  const verifier = new SignedXml({ publicCert: certificate.toString(), getCertFromKeyInfo: () => null });
  verifier.loadSignature(signature);
  requireContract(verifier.checkSignature(xml) && verifier.getSignedReferences().length === 1,
    'REFERENCE_CRYPTOGRAPHIC_SIGNATURE_INVALID');
  const processed = Date.parse(nationalFiscalChild(info, 'dhProc').textContent || '');
  requireContract(Number.isFinite(processed) && Date.parse(certificate.validFrom) <= processed &&
    processed <= Date.parse(certificate.validTo), 'REFERENCE_CERTIFICATE_INVALID_AT_PROCESSING');
  return evidence;
}
