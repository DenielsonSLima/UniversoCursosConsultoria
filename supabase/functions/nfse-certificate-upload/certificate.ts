import forge from 'npm:node-forge@1.4.3';
import { createHash, createPrivateKey, X509Certificate } from 'node:crypto';
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
    const privateKeyPem = forge.pki.privateKeyToPem(keys[0].key);
    const key = createPrivateKey(privateKeyPem);
    requireCertificate(key.asymmetricKeyType === 'rsa' && (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048,'UNSUPPORTED_A1_KEY');
    const certificates: { forge: any; native: X509Certificate }[] = certs.map((bag: any) => ({forge:bag.cert,native:new X509Certificate(forge.pki.certificateToPem(bag.cert))}));
    const matching = certificates.filter(item => item.native.checkPrivateKey(key));
    requireCertificate(matching.length === 1,'CERTIFICATE_KEY_MISMATCH');
    const leaf = matching[0];
    requireCertificate(!leaf.native.ca && leaf.forge.getExtension('keyUsage')?.digitalSignature === true,'INVALID_SIGNING_CERTIFICATE');
    requireCertificate(now >= leaf.forge.validity.notBefore && now < leaf.forge.validity.notAfter,'CERTIFICATE_EXPIRED_OR_NOT_YET_VALID');
    const policies = nodes(extensionAsn(leaf.forge,'certificatePolicies'))
      .filter(node => node.type === forge.asn1.Type.OID && typeof node.value === 'string')
      .map(node => forge.asn1.derToOid(node.value as string));
    requireCertificate(policies.some(oid => /^2\.16\.76\.1\.2\.1\.\d+$/.test(oid)),'ICP_A1_POLICY_REQUIRED');
    const chain = [leaf];
    const unused = certificates.filter(item => item !== leaf);
    while (unused.length) {
      const current = chain[chain.length-1];
      if (current.native.checkIssued(current.native)) break;
      const next = unused.findIndex(item => current.native.checkIssued(item.native) && current.native.verify(item.native.publicKey));
      if (next < 0) break;
      chain.push(unused.splice(next,1)[0]);
    }
    const store = forge.pki.createCaStore(trustedCaPem);
    try { forge.pki.verifyCertificateChain(store,chain.map(item => item.forge),{validityCheckDate:now}); }
    catch { throw new CertificateError('UNTRUSTED_CERTIFICATE_CHAIN'); }
    const certificatePem = forge.pki.certificateToPem(leaf.forge);
    return {
      metadata:{fingerprint:createHash('sha256').update(leaf.native.raw).digest('hex'),
        subject:leaf.native.subject,cnpj:certificateCnpj(leaf.forge),
        notBefore:leaf.forge.validity.notBefore.toISOString(),expiresAt:leaf.forge.validity.notAfter.toISOString(),
        chainVerified:true,revocationStatus:'UNKNOWN',representationVerified:false},
      material:{privateKeyPem,certificatePem,chainPem:chain.slice(1).map(item=>forge.pki.certificateToPem(item.forge)).join('\n')},
    };
  } catch (error) {
    if (error instanceof CertificateError) throw error;
    if (error instanceof Pkcs12ReadError) throw new CertificateError(error.code);
    // Crypto libraries may include input fragments or password details in errors.
    throw new CertificateError('INVALID_PFX_OR_UNTRUSTED_CHAIN');
  }
}

