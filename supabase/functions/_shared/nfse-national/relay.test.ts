import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { APPROVED_HOMOLOGATION_RELAY_URLS, assertHomologationRelayConfig, createNationalRelayTransport } from './relay.ts';

const url = 'https://universo-cursos-consultoria-test-fixture.vercel.app/api/nfse-homologation-relay';
const config = { url, key: '11'.repeat(32), protectionBypass: 'SYNTHETIC_BYPASS_TOKEN' };
const credential = { privateKeyPem: 'PRIVATE_KEY_SENTINEL', chainPem: 'CHAIN_SENTINEL', certificatePem: 'CERTIFICATE_SENTINEL' };
const nonce = '00000000-0000-0000-0000-000000000001';
const options = { approvedUrls: [url], now: () => 1_794_333_600_000, nonce: () => nonce };
const envelope = (status = 200, body = '{}') => Response.json({ status, bodyBase64: btoa(body) });

Deno.test('relay pins exact reviewed Preview URL and rejects production, arbitrary hosts and weak keys', () => {
  assertHomologationRelayConfig(config, [url]);
  if (!APPROVED_HOMOLOGATION_RELAY_URLS.includes(url)) assert.throws(() => assertHomologationRelayConfig(config), /RELAY_CONFIGURATION_UNAVAILABLE/);
  for (const invalid of [
    { ...config, url: 'https://evil.test/api/nfse-homologation-relay' },
    { ...config, url: 'https://universo-cursos-consultoria.vercel.app/api/nfse-homologation-relay' },
    { ...config, url: url + '?target=production' },
    { ...config, url: url.replace('https://', 'http://') },
    { ...config, url: url.replace('https://', 'https://user:password@') },
    { ...config, key: '11'.repeat(16) },
    { ...config, protectionBypass: 'secret\r\nheader: injected' },
  ]) assert.throws(() => assertHomologationRelayConfig(invalid, [invalid.url]), /RELAY_CONFIGURATION_UNAVAILABLE/);
  assert.throws(() => assertHomologationRelayConfig({ ...config, url: url.replace('test-fixture', 'other-deployment') }, [url]));
});

Deno.test('relay signs exact canonical request bytes and only sends A1 to the pinned HTTPS server', async () => {
  let requests = 0;
  const transport = createNationalRelayTransport(config, credential, { ...options,
    fetch: (async (target, init) => {
      requests++; assert.equal(target, url); assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('x-vercel-protection-bypass'), 'SYNTHETIC_BYPASS_TOKEN');
      assert.equal(headers.has('cookie'), false);
      const raw = new TextDecoder().decode(init?.body as Uint8Array);
      const body = JSON.parse(raw); assert.deepEqual(Object.keys(body), ['credential', 'method', 'path']);
      assert.deepEqual(body.credential, credential); assert.equal(body.path, '/swagger/docs/v1');
      assert.equal(body.method, 'GET'); assert.equal('environment' in body, false);
      const timestamp = String(Math.floor(options.now() / 1000));
      assert.equal(headers.get('x-nfse-relay-timestamp'), timestamp);
      assert.equal(headers.get('x-nfse-relay-nonce'), nonce);
      const bodyHash = createHash('sha256').update(raw).digest('hex');
      const expected = createHmac('sha256', Buffer.from(config.key, 'hex'))
        .update(`${timestamp}\n${nonce}\n${bodyHash}`).digest('hex');
      assert.equal(headers.get('x-nfse-relay-signature'), expected);
      return envelope(404, '{"code":"NOT_FOUND"}');
    }) as typeof fetch });
  try {
    const response = await transport.request('GET', '/swagger/docs/v1');
    assert.equal(response.status, 404);
    assert.equal(new TextDecoder().decode(response.body), '{"code":"NOT_FOUND"}');
    assert.equal(requests, 1);
  } finally { transport.close(); }
});

Deno.test('relay rejects arbitrary routes and requires a separate server-owned POST gate', async () => {
  let requests = 0; let checked = 0;
  const runtime = { ...options, fetch: (async () => { requests++; return envelope(); }) as typeof fetch };
  const disabled = createNationalRelayTransport(config, credential, runtime);
  try {
    await assert.rejects(disabled.request('POST', '/nfse', '{}'), /RELAY_POST_NOT_AUTHORIZED/);
    for (const path of ['https://sefin.nfse.gov.br/nfse', '/nfse', '/parametrizacao/2803401/convenio', '/swagger/docs/v1?token=x']) {
      await assert.rejects(disabled.request('GET', path), /UNSUPPORTED_RELAY_ROUTE/);
    }
    await assert.rejects(disabled.request('GET', '/swagger/docs/v1', '{}'), /UNSUPPORTED_RELAY_ROUTE/);
    assert.equal(requests, 0);
  } finally { disabled.close(); }
  const enabled = createNationalRelayTransport(config, credential, { ...runtime, assertPostAllowed() { checked++; } });
  try { await enabled.request('POST', '/nfse', '{"dpsXmlGZipB64":"synthetic"}'); }
  finally { enabled.close(); }
  assert.equal(checked, 1); assert.equal(requests, 1);
});

Deno.test('relay enforces response bounds, rejects private echoes, and sanitizes transport errors', async () => {
  for (const fakeFetch of [
    async () => { throw new Error('PRIVATE_KEY_SENTINEL'); },
    async () => Response.json({ error: 'PRIVATE_KEY_SENTINEL' }, { status: 401 }),
    async () => Response.json({ status: 200, bodyBase64: '', credential }),
    async () => Response.json({ status: 200, bodyBase64: 'invalid base64' }),
    async () => new Response('large', { headers: { 'content-length': String(4 * 1024 * 1024 + 1) } }),
  ]) {
    const transport = createNationalRelayTransport(config, credential, { ...options, fetch: fakeFetch as typeof fetch });
    try { await assert.rejects(transport.request('GET', '/swagger/docs/v1'), (error) =>
      error instanceof Error && error.message === 'RELAY_REQUEST_UNAVAILABLE' && !error.message.includes('SENTINEL')); }
    finally { transport.close(); }
  }
});

Deno.test('closed relay cannot dispatch even when closed during asynchronous signing', async () => {
  let requests = 0;
  const transport = createNationalRelayTransport(config, credential, { ...options,
    fetch: (async () => { requests++; return envelope(); }) as typeof fetch });
  const pending = transport.request('GET', '/swagger/docs/v1'); transport.close();
  await assert.rejects(pending, /RELAY_TRANSPORT_CLOSED/);
  await assert.rejects(transport.request('GET', '/swagger/docs/v1'), /RELAY_TRANSPORT_CLOSED/);
  assert.equal(requests, 0);
});
