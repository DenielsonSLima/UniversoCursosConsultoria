import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers';
import { createRelayHandler } from './handler.js';
import { relaySigningText } from './auth.js';
import { parseRelayCommand, RELAY_LIMITS, SEFIN_HOMOLOGATION_BASE } from './contract.js';
import { createRelayTransport } from './transport.js';

const key = '12'.repeat(32), nowMs = Date.parse('2026-11-10T20:00:00Z');
const env = { VERCEL_ENV: 'preview', NFSE_HOMOLOGATION_RELAY_KEY: key };
const certificatePem = '-----BEGIN CERTIFICATE-----\nU1lOVEhFVElD\n-----END CERTIFICATE-----\n';
const privateKeyPem = '-----BEGIN PRIVATE KEY-----\nU1lOVEhFVElD\n-----END PRIVATE KEY-----\n';
const command = { method: 'GET', path: '/swagger/docs/v1', credential: { certificatePem, chainPem: '', privateKeyPem } };
function signed(value = command, { timestamp = String(Math.floor(nowMs / 1000)), nonce = randomUUID(), body, headers = {} } = {}) {
  const raw = body ?? JSON.stringify(value);
  return new Request('https://preview.invalid/api/nfse-homologation-relay', { method: 'POST', body: raw,
    headers: { 'content-type': 'application/json', 'x-nfse-relay-timestamp': timestamp, 'x-nfse-relay-nonce': nonce,
      'x-nfse-relay-signature': createHmac('sha256', Buffer.from(key, 'hex')).update(relaySigningText(timestamp, nonce, Buffer.from(raw))).digest('hex'),
      ...headers } });
}

test('relay authenticates exact raw bytes and only returns the bounded fiscal response', async () => {
  const seen = [];
  const handler = createRelayHandler({ env, now: () => nowMs, transport: async value => {
    seen.push(value); return { status: 200, bodyBase64: Buffer.from('{"swagger":"2.0"}').toString('base64') };
  } });
  const response = await handler(signed());
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.deepEqual(seen, [command]);
  const raw = await response.text();
  assert(!raw.includes('PRIVATE KEY')); assert(!raw.includes('CERTIFICATE'));
  assert.equal(JSON.parse(raw).status, 200);
});

test('no key, non-preview, browser origins, wrong signatures and expired commands cannot open a socket', async () => {
  let calls = 0;
  const transport = async () => { calls++; throw new Error('must not run'); };
  assert.equal((await createRelayHandler({ env: { ...env, VERCEL_ENV: 'production' }, transport })(signed())).status, 403);
  assert.equal((await createRelayHandler({ env: { VERCEL_ENV: 'preview' }, transport })(signed())).status, 503);
  const handler = createRelayHandler({ env, now: () => nowMs, transport });
  for (const request of [signed(command, { headers: { origin: 'https://browser.invalid' } }),
    signed(command, { headers: { 'x-nfse-relay-signature': 'ff'.repeat(32) } }),
    signed(command, { timestamp: String(Math.floor(nowMs / 1000) - 61) }),
    signed(command, { timestamp: String(Math.floor(nowMs / 1000) + 61) }),
    signed(command, { headers: { 'content-encoding': 'gzip' } })]) {
    assert.notEqual((await handler(request)).status, 200);
  }
  const tampered = signed();
  const headers = new Headers(tampered.headers);
  assert.equal((await handler(new Request(tampered.url, { method: 'POST', headers, body: `${await tampered.text()} ` }))).status, 401);
  assert.equal(calls, 0);
});

test('instance nonce guard rejects replays and unknown fields, SSRF, events and production are denied', async () => {
  let calls = 0;
  const handler = createRelayHandler({ env, now: () => nowMs, transport: async () => { calls++; return { status: 404, bodyBase64: '' }; } });
  const nonce = randomUUID();
  assert.equal((await handler(signed(command, { nonce }))).status, 200);
  assert.equal((await handler(signed(command, { nonce }))).status, 409);
  for (const patch of [{ url: 'https://other.invalid' }, { environment: 'PRODUCAO' }, { path: 'https://sefin.nfse.gov.br/nfse' },
    { path: '/nfse/123/eventos' }, { path: '/swagger/docs/v1?url=https://other.invalid' },
    { method: 'DELETE' }, { method: 'POST', path: '/nfse' }, { fiscalBody: '{}' },
    { credential: { ...command.credential, password: 'unexpected' } }]) {
    assert.equal((await handler(signed({ ...command, ...patch }))).status, 400);
  }
  assert.equal(calls, 1);
});

test('request and encoded response budgets are enforced without leaking upstream errors', async () => {
  let calls = 0;
  const handler = createRelayHandler({ env, now: () => nowMs, transport: async () => { calls++; return { status: 200, bodyBase64: 'A'.repeat(RELAY_LIMITS.responseBytes) }; } });
  const tooLarge = signed(command, { headers: { 'content-length': String(RELAY_LIMITS.requestBytes + 1) } });
  assert.equal((await handler(tooLarge)).status, 413); assert.equal(calls, 0);
  assert.equal((await handler(signed())).status, 502);
  const failed = createRelayHandler({ env, now: () => nowMs, transport: async () => { throw new Error(`PRIVATE ${privateKeyPem}`); } });
  const response = await failed(signed());
  assert.equal(await response.text(), '{"error":"RELAY_UPSTREAM_UNCONFIRMED"}');
});

test('transport pins homologation, verified TLS1.2 and no redirects, with no event or custom header surface', async () => {
  let observed;
  const transport = createRelayTransport((url, options, callback) => {
    observed = { url, options };
    const req = new EventEmitter(); req.write = value => { observed.body = value; }; req.destroy = () => {};
    req.end = () => setImmediate(() => {
      const response = new EventEmitter(); response.statusCode = 400; callback(response);
      response.emit('data', Buffer.from('rejection')); response.emit('end');
    });
    return req;
  });
  const result = await transport({ ...command, method: 'POST', path: '/nfse', fiscalBody: '{"dpsXmlGZipB64":"synthetic"}' });
  assert.equal(observed.url, `${SEFIN_HOMOLOGATION_BASE}/nfse`);
  assert.equal(observed.options.agent.options.minVersion, 'TLSv1.2');
  assert.equal(observed.options.agent.options.maxVersion, 'TLSv1.2');
  assert.equal(observed.options.agent.options.rejectUnauthorized, true);
  assert.equal(result.status, 400); assert.equal(Buffer.from(result.bodyBase64, 'base64').toString(), 'rejection');
  assert.equal(parseRelayCommand(command).path, '/swagger/docs/v1');
});
