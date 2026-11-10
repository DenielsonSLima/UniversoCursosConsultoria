import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync } from 'node:crypto';
import forge from 'npm:node-forge@1.4.3';
import { Pkcs12ReadError, readPkcs12 } from './pkcs12-reader.ts';

const generated = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = forge.pki.privateKeyFromPem(generated.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString());
const certificate = forge.pki.createCertificate();
certificate.publicKey = forge.pki.publicKeyFromPem(generated.publicKey.export({ type: 'pkcs1', format: 'pem' }).toString());
certificate.serialNumber = '01';
certificate.validity.notBefore = new Date('2020-01-01');
certificate.validity.notAfter = new Date('2040-01-01');
certificate.setSubject([{ name: 'commonName', value: 'Synthetic encoding test only' }]);
certificate.setIssuer(certificate.subject.attributes);
certificate.sign(privateKey, forge.md.sha256.create());

/** WebCrypto creates PBES2 ciphertext independently from Forge on old and new Deno. */
async function fixture(password: string, encoding: 'utf8' | 'latin1' | 'legacy' = 'utf8', corrupt = false) {
  const asn = forge.asn1;
  const pfx = forge.pkcs12.toPkcs12Asn1(privateKey, [certificate], password, { algorithm: '3des', count: 2048 });
  if (encoding !== 'legacy') {
    const authenticatedSafe = pfx.value[1].value[1].value[0];
    const safe = asn.fromDer(authenticatedSafe.value, true);
    const keyContents = safe.value[1].value[1].value[0];
    const bags = asn.fromDer(keyContents.value, true);
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(16));
    const secret=await crypto.subtle.importKey('raw',new Uint8Array(Buffer.from(password,encoding)),
      'PBKDF2',false,['deriveKey']);
    const aes=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:2048,hash:'SHA-256'},
      secret,{name:'AES-CBC',length:256},false,['encrypt']);
    const plainKey=generated.privateKey.export({type:'pkcs8',format:'der'});
    const encryptedKey=await crypto.subtle.encrypt({name:'AES-CBC',iv},aes,new Uint8Array(plainKey));
    const sequence=(value: unknown[])=>asn.create(asn.Class.UNIVERSAL,asn.Type.SEQUENCE,true,value);
    const oid=(value: string)=>asn.create(asn.Class.UNIVERSAL,asn.Type.OID,false,asn.oidToDer(value).getBytes());
    const octet=(value: Uint8Array)=>asn.create(asn.Class.UNIVERSAL,asn.Type.OCTETSTRING,false,forge.util.binary.raw.encode(value));
    const info=sequence([sequence([oid('1.2.840.113549.1.5.13'),sequence([
      sequence([oid('1.2.840.113549.1.5.12'),sequence([octet(salt),
        asn.create(asn.Class.UNIVERSAL,asn.Type.INTEGER,false,asn.integerToDer(2048).getBytes()),
        sequence([oid('1.2.840.113549.2.9'),asn.create(asn.Class.UNIVERSAL,asn.Type.NULL,false,'')])])]),
      sequence([oid('2.16.840.1.101.3.4.1.42'),octet(iv)])])]),octet(new Uint8Array(encryptedKey))]);
    if (corrupt) info.value[1].value = '\x00'.repeat(16);
    bags.value[0].value[1].value[0] = info;
    keyContents.value = asn.toDer(bags).getBytes();
    authenticatedSafe.value = asn.toDer(safe).getBytes();
    const macData = pfx.value[2];
    const macKey = forge.pkcs12.generateKey(password, forge.util.createBuffer(macData.value[1].value), 3, 2048, 20);
    const mac = forge.hmac.create();
    mac.start(forge.md.sha1.create(), macKey);
    mac.update(authenticatedSafe.value);
    macData.value[0].value[1].value = mac.getMac().getBytes();
  }
  return new Uint8Array(forge.util.binary.raw.decode(asn.toDer(pfx).getBytes()));
}

Deno.test('PBES2 accepts literal Unicode and boundary spaces without changing the MAC password', async () => {
  for (const password of ['  Sênha-測試!  ', '  ASCII spaces  ', '']) {
    const bytes = await fixture(password);
    const parsed = readPkcs12(bytes, password);
    assert.equal(parsed.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag].length, 1);
    if (password.trim() !== password) assert.throws(() => readPkcs12(bytes, password.trim()),
      (error: unknown) => error instanceof Pkcs12ReadError && error.code === 'INVALID_PFX_PASSWORD_OR_DATA');
  }
});

Deno.test('PBES2 keeps raw-byte export compatibility and PKCS12 legacy Unicode passwords', async () => {
  const password = '  Sênha!  ';
  for (const encoding of ['latin1', 'legacy'] as const) {
    assert.ok(readPkcs12(await fixture(password, encoding), password));
  }
});

Deno.test('the scoped PBES2 hook is restored after success, wrong password and corrupt ciphertext', async () => {
  const original = forge.pki.pbe.getCipherForPBES2;
  const password = 'Sênha-測試';
  const valid=await fixture(password);
  assert.ok(readPkcs12(valid, password));
  assert.equal(forge.pki.pbe.getCipherForPBES2, original);
  assert.throws(() => readPkcs12(valid, 'wrong'),
    (error: unknown) => error instanceof Pkcs12ReadError && error.code === 'INVALID_PFX_PASSWORD_OR_DATA');
  assert.equal(forge.pki.pbe.getCipherForPBES2, original);
  const corrupt=await fixture(password, 'utf8', true);
  assert.throws(() => readPkcs12(corrupt, password));
  assert.equal(forge.pki.pbe.getCipherForPBES2, original);
  assert.ok(readPkcs12(await fixture('next request'), 'next request'));
});

Deno.test('malformed input exposes only a fixed safe error code', () => {
  assert.throws(() => readPkcs12(new Uint8Array([1, 2, 3]), 'synthetic'),
    (error: unknown) => error instanceof Pkcs12ReadError && error.message === 'INVALID_PFX_FORMAT');
});
