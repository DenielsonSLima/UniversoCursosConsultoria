import assert from 'node:assert/strict';
import forge from 'npm:node-forge@1.4.3';
import { generateKeyPairSync } from 'node:crypto';
import { inspectPkcs12, MAX_PFX_BYTES } from './certificate.ts';
import { createCertificateUploadHandler } from './handler.ts';
import { officialTrustAnchors } from './trust-store.ts';
import { assertPfxCost } from './pfx-limits.ts';

const pair = () => {
  const generated=generateKeyPairSync('rsa',{modulusLength:2048});
  return {privateKey:forge.pki.privateKeyFromPem(generated.privateKey.export({type:'pkcs1',format:'pem'}).toString()),
    publicKey:forge.pki.publicKeyFromPem(generated.publicKey.export({type:'pkcs1',format:'pem'}).toString())};
};
const rootKey=pair();
const root=forge.pki.createCertificate(); root.publicKey=rootKey.publicKey; root.serialNumber='01';
root.validity.notBefore=new Date('2020-01-01'); root.validity.notAfter=new Date('2040-01-01');
root.setSubject([{name:'commonName',value:'Synthetic root for isolated tests'}]); root.setIssuer(root.subject.attributes);
root.setExtensions([{name:'basicConstraints',cA:true,critical:true},{name:'keyUsage',keyCertSign:true,cRLSign:true,critical:true}]);
root.sign(rootKey.privateKey,forge.md.sha256.create());
const rootPem=forge.pki.certificateToPem(root);
function fixture(options: { cnpj?: string; expired?: boolean; a3?: boolean; wrongKey?: boolean } = {}) {
  const key=pair(); const cert=forge.pki.createCertificate(); cert.publicKey=key.publicKey; cert.serialNumber='02';
  cert.validity.notBefore=new Date('2020-01-01'); cert.validity.notAfter=new Date(options.expired?'2021-01-01':'2040-01-01');
  cert.setSubject([{name:'commonName',value:'Synthetic A1 test'}]); cert.setIssuer(root.subject.attributes);
  const asn=forge.asn1; const seq=(value: unknown[])=>asn.create(asn.Class.UNIVERSAL,asn.Type.SEQUENCE,true,value);
  const oid=(value: string)=>asn.create(asn.Class.UNIVERSAL,asn.Type.OID,false,asn.oidToDer(value).getBytes());
  const san=seq([asn.create(asn.Class.CONTEXT_SPECIFIC,0,true,[
    oid('2.16.76.1.3.3'),asn.create(asn.Class.CONTEXT_SPECIFIC,0,true,[
      asn.create(asn.Class.UNIVERSAL,asn.Type.UTF8,false,options.cnpj || '00000000000100')])])]);
  cert.setExtensions([{name:'basicConstraints',cA:false,critical:true},{name:'keyUsage',digitalSignature:true,critical:true},
    {id:'2.5.29.17',value:asn.toDer(san).getBytes()},
    {id:'2.5.29.32',value:asn.toDer(seq([seq([oid(options.a3?'2.16.76.1.2.3.1':'2.16.76.1.2.1.1')])])).getBytes()}]);
  cert.sign(rootKey.privateKey,forge.md.sha256.create());
  const pfx=forge.pkcs12.toPkcs12Asn1(options.wrongKey?pair().privateKey:key.privateKey,[cert,root], 'test-password',
    {algorithm:'3des',count:1024});
  return new Uint8Array(forge.util.binary.raw.decode(asn.toDer(pfx).getBytes()));
}

Deno.test('A1 parser proves key/certificate/chain/CNPJ, without claiming revocation or representation',()=>{
  const parsed=inspectPkcs12(fixture(),'test-password',[rootPem]);
  assert.equal(parsed.metadata.cnpj,'00000000000100');
  assert.equal(parsed.metadata.chainVerified,true); assert.equal(parsed.metadata.revocationStatus,'UNKNOWN');
  assert.equal(parsed.metadata.representationVerified,false); assert.match(parsed.metadata.fingerprint,/^[0-9a-f]{64}$/);
  assert.match(parsed.material.privateKeyPem,/BEGIN RSA PRIVATE KEY/);
  assert.match(parsed.material.certificatePem,/BEGIN CERTIFICATE/);
});
Deno.test('A1 parser refuses wrong password, expired certificate, A3, wrong key and untrusted roots',()=>{
  const valid=fixture();
  assert.throws(()=>inspectPkcs12(valid,'wrong',[rootPem]));
  assert.throws(()=>inspectPkcs12(fixture({expired:true}),'test-password',[rootPem]));
  assert.throws(()=>inspectPkcs12(fixture({a3:true}),'test-password',[rootPem]));
  assert.throws(()=>inspectPkcs12(fixture({wrongKey:true}),'test-password',[rootPem]));
  assert.throws(()=>inspectPkcs12(valid,'test-password',[]));
  assert.throws(()=>inspectPkcs12(valid,'test-password',officialTrustAnchors()));
  assert.throws(()=>inspectPkcs12(new Uint8Array(MAX_PFX_BYTES+1),'test-password',[rootPem]));
});
const uuid=(n: number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
function request(bytes: Uint8Array) {
  const form=new FormData(); form.append('certificate',new File([new Uint8Array(bytes).buffer],'synthetic.pfx',{type:'application/x-pkcs12'}));
  form.append('password','test-password');
  return new Request('https://example.invalid',{method:'POST',headers:{'x-nfse-context':uuid(10),'x-nfse-polo':uuid(2),
    'x-request-id':uuid(50),'x-nfse-environment':'HOMOLOGACAO','x-nfse-month':'2026-11'},body:form});
}
Deno.test('upload reuses exact authorized certificate owner, never a foreign CNPJ',async()=>{
  let stored=0;
  const handler=createCertificateUploadHandler({authorize:async()=>({actorId:uuid(11),credentialPoloId:uuid(1),
    cnpj:'00000000000100',configurationVersion:1}),trustAnchors:()=>[rootPem],rateLimited:()=>false,
    store:async()=>{stored++; return {configured:true,readiness:'BLOCKED',chainVerified:true,
      representationVerified:false,revocationStatus:'UNKNOWN',expiresAt:'2040-01-01T00:00:00Z',
      privateKeyPem:'synthetic unexpected field',secretId:uuid(99)};},
    respond:(_req,body,status)=>Response.json(body,{status})});
  const successful=await handler(request(fixture())); assert.equal(successful.status,200);
  const output=await successful.json(); assert.equal('privateKeyPem' in output,false); assert.equal('secretId' in output,false);
  assert.deepEqual(Object.keys(output).sort(),['configured','expiresAt','chainVerified','revocationStatus','representationVerified','readiness'].sort());
  assert.equal((await handler(request(fixture({cnpj:'00000000000200'})))).status,400);
  assert.equal((await handler(request(fixture({cnpj:'99999999000100'})))).status,400);
  assert.equal(stored,1);
});
Deno.test('revoked authorization is rejected before consuming uploaded material',async()=>{
  let anchors=0;
  const handler=createCertificateUploadHandler({authorize:async()=>{throw new Error('revoked');},
    trustAnchors:()=>{anchors++; return [rootPem];},rateLimited:()=>false,store:async()=>assert.fail(),
    respond:(_req,body,status)=>Response.json(body,{status})});
  assert.equal((await handler(request(fixture()))).status,403); assert.equal(anchors,0);
});
Deno.test('trust store accepts only reviewed official roots, including explicit overrides',()=>{
  const roots=officialTrustAnchors(); assert.equal(roots.length,3);
  assert.deepEqual(officialTrustAnchors(roots[0]),[roots[0]]);
  assert.throws(()=>officialTrustAnchors(rootPem));
  assert.throws(()=>officialTrustAnchors('invalid explicit configuration'));
});
Deno.test('upload limits streamed bodies even without a reliable content length',async()=>{
  let stored=0;
  const handler=createCertificateUploadHandler({authorize:async()=>({actorId:uuid(11),credentialPoloId:uuid(1),
    cnpj:'00000000000100',configurationVersion:1}),trustAnchors:()=>[rootPem],rateLimited:()=>false,
    store:async()=>{stored++;},respond:(_req,body,status)=>Response.json(body,{status})});
  const original=request(new Uint8Array([1])); const headers=new Headers(original.headers);
  headers.set('content-type','multipart/form-data; boundary=synthetic');
  const oversized=new Request(original.url,{method:'POST',headers,body:new Uint8Array(MAX_PFX_BYTES+8193)});
  const result=await handler(oversized); assert.equal(result.status,400);
  assert.equal((await result.json()).error,'INVALID_UPLOAD_SIZE'); assert.equal(stored,0);
});
Deno.test('preflight rejects artificial MAC and encrypted-bag KDF costs before deriving keys',()=>{
  const asn=forge.asn1;
  const sequence=(value: unknown[])=>asn.create(asn.Class.UNIVERSAL,asn.Type.SEQUENCE,true,value);
  const integer=(value: string)=>asn.create(asn.Class.UNIVERSAL,asn.Type.INTEGER,false,value);
  assert.throws(()=>assertPfxCost(sequence([integer('\x03'),sequence([]),sequence([sequence([]),integer('\x01'),integer('\x7f\xff\xff\xff')])])));
  assert.throws(()=>assertPfxCost(sequence([asn.create(asn.Class.UNIVERSAL,asn.Type.OID,false,
    asn.oidToDer('1.2.840.113549.1.5.12').getBytes()),sequence([integer('\x01'),integer('\x7f\xff\xff\xff')])])));
});
