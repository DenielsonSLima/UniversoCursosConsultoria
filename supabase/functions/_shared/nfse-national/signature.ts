import { SignedXml } from 'npm:xml-crypto@6.4.0';
import { DOMParser } from 'npm:@xmldom/xmldom@0.8.15';
import { X509Certificate } from 'node:crypto';
import { NFSE_NAMESPACE, NfseContractError, requireContract, type UnsignedFiscalXml } from './xml.ts';

const DS = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
export type XmlSignatureProfile = 'RSA_SHA1_LEGACY' | 'RSA_SHA256';
const PROFILES = {
  RSA_SHA1_LEGACY: { signature: `${DS}rsa-sha1`, digest: `${DS}sha1` },
  RSA_SHA256: { signature: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digest: 'http://www.w3.org/2001/04/xmlenc#sha256' },
};

function parse(xml: string) {
  requireContract(!/<!DOCTYPE|<!ENTITY/i.test(xml) && xml.length < 4 * 1024 * 1024, 'UNSAFE_XML');
  return new DOMParser({ errorHandler: { warning: () => {}, error: () => {
    throw new NfseContractError('INVALID_XML');
  }, fatalError: () => { throw new NfseContractError('INVALID_XML'); } } }).parseFromString(xml, 'text/xml');
}

function assertDocument(document: UnsignedFiscalXml, xml: string, signed: boolean) {
  const dom = parse(xml);
  const rootName = document.kind === 'DPS' ? 'DPS' : 'pedRegEvento';
  const infoName = document.kind === 'DPS' ? 'infDPS' : 'infPedReg';
  const root = dom.documentElement;
  const info = dom.getElementsByTagNameNS(NFSE_NAMESPACE, infoName);
  const signatures = dom.getElementsByTagNameNS(DS, 'Signature');
  const children = Array.from(root.childNodes).filter((node) => node.nodeType === 1);
  requireContract(root.localName === rootName && root.namespaceURI === NFSE_NAMESPACE &&
    root.getAttribute('versao') === document.schemaVersion && info.length === 1 &&
    info[0].parentNode === root && info[0].getAttribute('Id') === document.referenceId &&
    signatures.length === (signed ? 1 : 0) && children.length === (signed ? 2 : 1), 'XML_DOCUMENT_MISMATCH');
  requireContract((document.kind === 'DPS' ? /^DPS\d{42}$/ : /^PRE\d{56}$/).test(document.referenceId),
    'INVALID_REFERENCE_ID');
  if (signed) requireContract(signatures[0].parentNode === root, 'INVALID_SIGNATURE_LOCATION');
  return { dom, info: info[0], signature: signatures[0] };
}

/** Cryptographic primitive only. Profile acceptance by national SEFIN is a separate gate. */
export function signNationalXml(document: UnsignedFiscalXml,
  material: { privateKeyPem: string; certificatePem: string }, profile: XmlSignatureProfile): string {
  requireContract(Object.hasOwn(PROFILES, profile), 'UNSUPPORTED_SIGNATURE_PROFILE');
  assertDocument(document, document.xml, false);
  // EndCertOnly: reject chains here; the TLS transport may use a separate certificate chain.
  requireContract((material.certificatePem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length === 1,
    'LEAF_CERTIFICATE_REQUIRED');
  try {
    new X509Certificate(material.certificatePem);
    const algorithm = PROFILES[profile];
    const signer = new SignedXml({ privateKey: material.privateKeyPem, publicCert: material.certificatePem,
      signatureAlgorithm: algorithm.signature, canonicalizationAlgorithm: C14N });
    const name = document.kind === 'DPS' ? 'infDPS' : 'infPedReg';
    signer.addReference({ xpath: `//*[local-name()='${name}' and namespace-uri()='${NFSE_NAMESPACE}']`,
      digestAlgorithm: algorithm.digest, transforms: [`${DS}enveloped-signature`, C14N] });
    signer.computeSignature(document.xml, { location: {
      reference: `//*[local-name()='${name}' and namespace-uri()='${NFSE_NAMESPACE}']`, action: 'after' } });
    const signed = signer.getSignedXml();
    requireContract(verifyNationalXml(document, signed, material.certificatePem, profile),
      'SIGNATURE_SELF_VERIFICATION_FAILED');
    return signed;
  } catch {
    throw new NfseContractError('SIGNATURE_FAILED');
  }
}

/** Trust the supplied certificate, never a certificate chosen by untrusted KeyInfo. */
export function verifyNationalXml(document: UnsignedFiscalXml, signedXml: string,
  trustedCertificatePem: string, profile: XmlSignatureProfile): boolean {
  try {
    requireContract(Object.hasOwn(PROFILES, profile), 'UNSUPPORTED_SIGNATURE_PROFILE');
    const { signature } = assertDocument(document, signedXml, true);
    const algorithm = PROFILES[profile];
    const references = signature.getElementsByTagNameNS(DS, 'Reference');
    requireContract(references.length === 1 && references[0].getAttribute('URI') === `#${document.referenceId}`,
      'INVALID_SIGNATURE_REFERENCE');
    const transforms = references[0].getElementsByTagNameNS(DS, 'Transform');
    requireContract(transforms.length === 2 && transforms[0].getAttribute('Algorithm') === `${DS}enveloped-signature` &&
      transforms[1].getAttribute('Algorithm') === C14N, 'UNEXPECTED_SIGNATURE_TRANSFORMS');
    requireContract(signature.getElementsByTagNameNS(DS, 'SignatureMethod')[0]?.getAttribute('Algorithm') ===
      algorithm.signature && signature.getElementsByTagNameNS(DS, 'DigestMethod')[0]?.getAttribute('Algorithm') ===
      algorithm.digest && signature.getElementsByTagNameNS(DS, 'CanonicalizationMethod')[0]?.getAttribute('Algorithm') ===
      C14N, 'UNEXPECTED_SIGNATURE_ALGORITHM');
    const verifier = new SignedXml({ publicCert: trustedCertificatePem, getCertFromKeyInfo: () => null });
    verifier.loadSignature(signature);
    return verifier.checkSignature(signedXml) && verifier.getSignedReferences().length === 1;
  } catch { return false; }
}
