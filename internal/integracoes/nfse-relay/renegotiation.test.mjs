import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import tls from 'node:tls';
import https from 'node:https';
import { constants } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { setImmediate } from 'node:timers';

test('Node HTTPS verifies the server and presents a synthetic client certificate on post-request TLS1.2 renegotiation', { timeout: 20_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nfse-node-renegotiation-'));
  const file = name => join(directory, name);
  const openssl = args => {
    const result = spawnSync('openssl', args, { stdio: 'pipe' });
    assert.equal(result.status, 0, 'Synthetic certificate generation failed');
  };
  let server;
  try {
    openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'),
      '-subj', '/CN=PilotSyntheticCA', '-days', '1', '-addext', 'basicConstraints=critical,CA:TRUE']);
    for (const name of ['server', 'client']) {
      openssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file(`${name}.key`), '-out', file(`${name}.csr`), '-subj', `/CN=PilotSynthetic${name}`]);
      writeFileSync(file(`${name}.ext`), name === 'server'
        ? 'subjectAltName=IP:127.0.0.1,DNS:localhost\nextendedKeyUsage=serverAuth\n' : 'extendedKeyUsage=clientAuth\n');
      openssl(['x509', '-req', '-in', file(`${name}.csr`), '-CA', file('ca.pem'), '-CAkey', file('ca.key'),
        '-CAcreateserial', '-out', file(`${name}.pem`), '-days', '1', '-extfile', file(`${name}.ext`)]);
    }
    openssl(['verify', '-CAfile', file('ca.pem'), file('client.pem')]);
    const ca = readFileSync(file('ca.pem'));
    const observed = { initialCertificate: false, renegotiatedCertificate: false, verifiedClient: false };
    server = tls.createServer({ key: readFileSync(file('server.key')), cert: readFileSync(file('server.pem')), ca,
      requestCert: false, rejectUnauthorized: true, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
      sessionIdContext: 'nfse-synthetic-renegotiation',
      secureOptions: constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION }, socket => {
      observed.initialCertificate = Boolean(socket.getPeerCertificate()?.raw);
      socket.once('data', () => {
        observed.requestReceived = true;
        observed.renegotiationStarted = socket.renegotiate({ requestCert: true, rejectUnauthorized: true }, error => {
          if (error) { observed.callbackError = error.code || error.message; socket.destroy(error); return; }
          observed.renegotiatedCertificate = Boolean(socket.getPeerCertificate()?.raw);
          observed.verifiedClient = socket.authorized;
          socket.write('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK', () => socket.end());
        });
      });
      socket.on('error', error => { observed.error = error.code || error.message; });
      socket.on('close', () => { if (socket.authorizationError) observed.serverAuthorizationError = socket.authorizationError; });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const status = await new Promise((resolve, reject) => {
      const request = https.request({ hostname: '127.0.0.1', port: server.address().port, path: '/probe', method: 'GET', ca,
        cert: Buffer.concat([readFileSync(file('client.pem')), ca]), key: readFileSync(file('client.key')), rejectUnauthorized: true,
        minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2', agent: false }, response => {
        assert.equal(response.socket.authorized, true); assert.equal(response.socket.getProtocol(), 'TLSv1.2');
        response.resume(); response.once('end', () => resolve(response.statusCode));
      });
      request.once('error', error => setImmediate(() => reject(new Error(`Synthetic TLS failed: ${error.code} ${JSON.stringify(observed)}`))));
      request.setTimeout(10_000, () => request.destroy(new Error('LOCAL_RENEGOTIATION_TIMEOUT'))); request.end();
    });
    assert.equal(status, 200);
    assert.deepEqual(observed, { initialCertificate: false, renegotiatedCertificate: true, verifiedClient: true,
      requestReceived: true, renegotiationStarted: true });
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
