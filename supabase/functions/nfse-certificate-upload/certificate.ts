import forge from 'npm:node-forge@1.4.3';
import { Pkcs12ReadError, readPkcs12 } from './pkcs12-reader.ts';

export const MAX_PFX_BYTES = 128 * 1024;
export class CertificateError extends Error {
  constructor(public code: string) { super(code); }
}
const requireCertificate = (condition: unknown, code: string) => {
  if (!condition) throw new CertificateError(code);
};
type AsnNode = { tagClass: number; type: number; value: string | AsnNode[] };

function nodes(root: AsnNode): AsnNode[] {
  const result: AsnNode[] = [];
  const pending = [{ node:root, depth:0 }];
  while (pending.length) {
    const { node,depth } = pending.pop()!;
    requireCertificate(depth < 16 && result.length < 512,'INVALID_CERTIFICATE_EXTENSION');
    result.push(node);
    if (Array.isArray(node.value)) for (const child of node.value) pending.push({node:child,depth:depth+1});
  }
  return result;
}

function extensionAsn(certificate: any, name: string) {
  const extension = certificate.getExtension(name);
  requireCertificate(extension && typeof extension.value === 'string','MISSING_CERTIFICATE_EXTENSION');
  return forge.asn1.fromDer(extension.value,true) as AsnNode;
}

function certificateCnpj(certificate: any): string {
  const identifiers: string[] = [];
  for (const node of nodes(extensionAsn(certificate,'subjectAltName'))) {
    if (!Array.isArray(node.value) || node.value.length !== 2) continue;
    const [oid,value] = node.value;
    if (oid.type !== forge.asn1.Type.OID || typeof oid.value !== 'string'
      || forge.asn1.derToOid(oid.value) !== '2.16.76.1.3.3') continue;
    for (const leaf of nodes(value)) {
      if (typeof leaf.value === 'string' && /^\d{14}$/.test(leaf.value)) identifiers.push(leaf.value);
    }
  }
  requireCertificate(identifiers.length === 1,'CERTIFICATE_CNPJ_REQUIRED');
  return identifiers[0];
}

export interface ParsedCertificate {
  metadata: { fingerprint: string; subject: string; cnpj: string; notBefore: string; expiresAt: string;
    chainVerified: true; revocationStatus: 'UNKNOWN'; representationVerified: false };
  material: { privateKeyPem: string; certificatePem: string; chainPem: string };
}

/** Trust anchors come only from server configuration, never from the PFX uploader. */
export function inspectPkcs12(bytes: Uint8Array,password: string,trustedCaPem: string[],now = new Date()): ParsedCertificate {
  requireCertificate(bytes.length > 0 && bytes.length <= MAX_PFX_BYTES,'INVALID_PFX_SIZE');
  requireCertificate(typeof password === 'string' && password.length <= 1024,'INVALID_PFX_PASSWORD');
  requireCertificate(trustedCaPem.length > 0 && trustedCaPem.length <= 30,'ICP_TRUST_STORE_UNAVAILABLE');
  try {
    const pfx = readPkcs12(bytes,password);
    const keys = [forge.pki.oids.pkcs8ShroudedKeyBag,forge.pki.oids.keyBag].flatMap(bagType =>
      pfx.getBags({bagType})[bagType] ?? []);
    const certs = pfx.getBags({bagType:forge.pki.oids.certBag})[forge.pki.oids.certBag] ?? [];
    requireCertificate(keys.length === 1 && keys[0].key && certs.length > 0 && certs.length <= 8,'INVALID_PFX_CONTENTS');
    // Supabase Edge's Node polyfill does not implement X509Certificate's
    // checkPrivateKey/checkIssued/verify/raw. Keep all checks in Forge instead.
    const key = keys[0].key;
    requireCertificate(key.n && key.e && key.d && typeof key.n.bitLength === 'function'
      && key.n.bitLength() >= 2048,'UNSUPPORTED_A1_KEY');
    const privateKeyPem = forge.pki.privateKeyToPem(key);
    const certificates: any[] = certs.map((bag: any) => bag.cert);
    requireCertificate(certificates.every(certificate => certificate?.publicKey),'INVALID_PFX_CONTENTS');
    const matching = certificates.filter(certificate => certificate.publicKey.n?.equals(key.n)
      && certificate.publicKey.e?.equals(key.e));
    requireCertificate(matching.length === 1,'CERTIFICATE_KEY_MISMATCH');
    const leaf = matching[0];
    let signingKeyMatches = false;
    try {
      const challenge = forge.md.sha256.create().update('nfse-certificate-key-pair-check-v1');
      const signature = key.sign(challenge);
      signingKeyMatches = leaf.publicKey.verify(challenge.digest().getBytes(),signature);
    } catch { /* Invalid private components must not pass on matching n/e alone. */ }
    requireCertificate(signingKeyMatches,'CERTIFICATE_KEY_MISMATCH');
    requireCertificate(leaf.getExtension('basicConstraints')?.cA !== true
      && leaf.getExtension('keyUsage')?.digitalSignature === true,'INVALID_SIGNING_CERTIFICATE');
    requireCertificate(now >= leaf.validity.notBefore && now < leaf.validity.notAfter,'CERTIFICATE_EXPIRED_OR_NOT_YET_VALID');
    const policies = nodes(extensionAsn(leaf,'certificatePolicies'))
      .filter(node => node.type === forge.asn1.Type.OID && typeof node.value === 'string')
      .map(node => forge.asn1.derToOid(node.value as string));
    requireCertificate(policies.some(oid => /^2\.16\.76\.1\.2\.1\.\d+$/.test(oid)),'ICP_A1_POLICY_REQUIRED');
    const chain = [leaf];
    const unused = certificates.filter(item => item !== leaf);
    while (unused.length) {
      const current = chain[chain.length-1];
      if (current.isIssuer(current)) break;
      const next = unused.findIndex(issuer => {
        if (!current.isIssuer(issuer)) return false;
        try { return issuer.verify(current); } catch { return false; }
      });
      if (next < 0) break;
      chain.push(unused.splice(next,1)[0]);
    }
    const store = forge.pki.createCaStore(trustedCaPem);
    try { forge.pki.verifyCertificateChain(store,chain,{validityCheckDate:now}); }
    catch { throw new CertificateError('UNTRUSTED_CERTIFICATE_CHAIN'); }
    const certificatePem = forge.pki.certificateToPem(leaf);
    const certificateDer = forge.asn1.toDer(forge.pki.certificateToAsn1(leaf)).getBytes();
    return {
      metadata:{fingerprint:forge.md.sha256.create().update(certificateDer).digest().toHex(),
        subject:leaf.subject.attributes.map((attribute: any) => {
          const value = attribute.valueTagClass === forge.asn1.Type.UTF8
            ? forge.util.decodeUtf8(attribute.value) : attribute.value;
          return `${attribute.shortName || attribute.name || attribute.type}=${value}`;
        }).join('\n'),
        cnpj:certificateCnpj(leaf),
        notBefore:leaf.validity.notBefore.toISOString(),expiresAt:leaf.validity.notAfter.toISOString(),
        chainVerified:true,revocationStatus:'UNKNOWN',representationVerified:false},
      material:{privateKeyPem,certificatePem,chainPem:chain.slice(1).map(item=>forge.pki.certificateToPem(item)).join('\n')},
    };
  } catch (error) {
    if (error instanceof CertificateError) throw error;
    if (error instanceof Pkcs12ReadError) throw new CertificateError(error.code);
    // Crypto libraries may include input fragments or password details in errors.
    throw new CertificateError('INVALID_PFX_OR_UNTRUSTED_CHAIN');
  }
}

