import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { generateKeyPairSync } from 'node:crypto';
import type { TLSSocket } from 'node:tls';
import forge from 'npm:node-forge@1.4.3';
import { createPreflightTransport } from './transport.ts';

function pair() {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = keys.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  return { privatePem, privateKey: forge.pki.privateKeyFromPem(privatePem),
    publicKey: forge.pki.publicKeyFromPem(keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()) };
}

Deno.test('native HttpClient completes real mutual TLS against an isolated synthetic server', async () => {
  const rootKey = pair();
  const root = forge.pki.createCertificate(); root.publicKey = rootKey.publicKey;
  root.serialNumber = '01'; root.validity.notBefore = new Date('2020-01-01'); root.validity.notAfter = new Date('2040-01-01');
  root.setSubject([{ name: 'commonName', value: 'Synthetic mTLS test root' }]); root.setIssuer(root.subject.attributes);
  root.setExtensions([{ name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }]);
  root.sign(rootKey.privateKey, forge.md.sha256.create());
  const rootPem = forge.pki.certificateToPem(root);
  const leaf = (name: string, serial: string, client: boolean) => {
    const keys = pair(); const certificate = forge.pki.createCertificate(); certificate.publicKey = keys.publicKey;
    certificate.serialNumber = serial; certificate.validity.notBefore = root.validity.notBefore;
    certificate.validity.notAfter = root.validity.notAfter;
    certificate.setSubject([{ name: 'commonName', value: name }]); certificate.setIssuer(root.subject.attributes);
    certificate.setExtensions([{ name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', clientAuth: client, serverAuth: !client },
      ...(!client ? [{ name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] }] : [])]);
    certificate.sign(rootKey.privateKey, forge.md.sha256.create());
    return { certificatePem: forge.pki.certificateToPem(certificate), privateKeyPem: keys.privatePem };
  };
  const serverCredential = leaf('Synthetic mTLS server', '02', false);
  const clientCredential = leaf('Synthetic mTLS client', '03', true);
  let authenticated = false;
  const server = createServer({ cert: serverCredential.certificatePem, key: serverCredential.privateKeyPem,
    ca: rootPem, requestCert: true, rejectUnauthorized: true }, (req, res) => {
      authenticated = (req.socket as TLSSocket).authorized;
      res.setHeader('connection', 'close');
      res.end(JSON.stringify({ clientAuthenticated: authenticated }));
    });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const localUrl = `https://127.0.0.1:${address.port}/`;
  const transport = createPreflightTransport({ ...clientCredential, chainPem: rootPem }, {
    createClient(options) { return Deno.createHttpClient({ ...options, caCerts: [rootPem] }); },
    fetch(_url, options) { return fetch(localUrl, { ...options, client: options.client as Deno.HttpClient }); },
  });
  try {
    const result = await transport.get('https://adn.producaorestrita.nfse.gov.br/parametrizacao/2803401/convenio');
    assert.equal(result.status, 200); assert.equal(result.tlsVerified, true);
    assert.equal(authenticated, true); assert.deepEqual(JSON.parse(result.body), { clientAuthenticated: true });
    const anonymous = Deno.createHttpClient({ caCerts: [rootPem] });
    try { await assert.rejects(fetch(localUrl, { client: anonymous })); }
    finally { anonymous.close(); }
  } finally {
    transport.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
