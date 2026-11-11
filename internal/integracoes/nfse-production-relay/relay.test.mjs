import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { createProductionRelayHandler } from './handler.js';
import { parseProductionRelayCommand, SEFIN_PRODUCTION_BASE } from './contract.js';
import { relaySigningText } from '../nfse-relay/auth.js';

const credential = { certificatePem: '-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----', chainPem: '',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----' };
const key = '31'.repeat(32), now = 1794350000000;
const note = '1'.repeat(50), dps = `DPS${'1'.repeat(42)}`;
const command = (method, path, fiscalBody) => ({ method, path, credential,
  ...(fiscalBody === undefined ? {} : { fiscalBody }) });
function signed(body, nonce = '00000000-0000-0000-0000-000000000001') {
  const bytes = Buffer.from(JSON.stringify(body)), timestamp = String(now / 1000);
  return new Request('https://private.example/api/nfse-production-relay', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nfse-relay-timestamp': timestamp, 'x-nfse-relay-nonce': nonce,
      'x-nfse-relay-signature': createHmac('sha256', Buffer.from(key, 'hex')).update(relaySigningText(timestamp, nonce, bytes)).digest('hex') }, body: bytes });
}
test('production accepts only official read/issue/event routes and no caller-selected destination', () => {
  assert.equal(SEFIN_PRODUCTION_BASE, 'https://sefin.nfse.gov.br/SefinNacional');
  for (const path of ['/swagger/docs/v1', '/swagger/v1/swagger.json', `/dps/${dps}`, `/nfse/${note}`,
    `/nfse/${note}/eventos`, `/nfse/${note}/eventos/101101/001`, `/nfse/${note}/eventos/101101/1`]) assert.equal(parseProductionRelayCommand(command('GET', path)).path, path);
  for (const path of ['/nfse', `/nfse/${note}/eventos`]) assert.equal(parseProductionRelayCommand(command('POST', path, '{}')).method, 'POST');
  for (const path of ['https://attacker.invalid/nfse', '/nfse?token=secret', '/admin', '/nfse/../admin', '/nfse/123', `/nfse/${note}/cancelar`]) {
    assert.throws(() => parseProductionRelayCommand(command('GET', path)));
  }
  assert.throws(() => parseProductionRelayCommand({ ...command('POST', '/nfse', '{}'), origin: 'https://attacker.invalid' }));
  assert.throws(() => parseProductionRelayCommand(command('GET', `/nfse/${note}`, '{}')));
  assert.throws(() => parseProductionRelayCommand(command('POST', '/nfse')));
});
test('private production channel uses its own key, authenticates bytes, denies browser/other environments and replay', async () => {
  let called = 0;
  const env = { VERCEL_ENV: 'preview', NFSE_PRODUCTION_RELAY_KEY: key };
  const handler = createProductionRelayHandler({ env, now: () => now, transport: async value => {
    called++; assert.equal(value.path, `/nfse/${note}/eventos`); return { status: 201, bodyBase64: 'e30=' };
  } });
  const first = await handler(signed(command('POST', `/nfse/${note}/eventos`, '{}')));
  assert.equal(first.status, 200); assert.deepEqual(await first.json(), { status: 201, bodyBase64: 'e30=' });
  assert.equal((await handler(signed(command('POST', `/nfse/${note}/eventos`, '{}')))).status, 409);
  const browser = signed(command('GET', '/swagger/docs/v1'), '00000000-0000-0000-0000-000000000002');
  browser.headers.set('origin', 'https://universocc.com.br'); assert.equal((await handler(browser)).status, 400);
  const wrong = createProductionRelayHandler({ env: { ...env, VERCEL_ENV: 'production' }, now: () => now });
  assert.equal((await wrong(signed(command('GET', '/swagger/docs/v1')))).status, 403);
  const homoOnly = createProductionRelayHandler({ env: { VERCEL_ENV: 'preview', NFSE_HOMOLOGATION_RELAY_KEY: key }, now: () => now });
  assert.equal((await homoOnly(signed(command('GET', '/swagger/docs/v1')))).status, 503);
  assert.equal(called, 1);
});
