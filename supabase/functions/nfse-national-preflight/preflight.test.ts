import assert from 'node:assert/strict';
import { generateKeyPairSync, createPrivateKey } from 'node:crypto';
import { createPreflightHandler } from './handler.ts';
import { runPreflight } from './probe.ts';
import { assertPreflightUrl, createPreflightTransport, privateKeyAsPkcs8, safeTransportCode } from './transport.ts';
import { sanitizeMunicipalParameters, summarizePublicSpec } from './public-contract.ts';
import type { PreflightMaterial, PreflightScope } from './types.ts';

const scope: PreflightScope = { contextKey: '00000000-0000-0000-0000-000000000010',
  poloId: '00000000-0000-0000-0000-000000000001', environment: 'HOMOLOGACAO', month: '2026-11' };
const actorId = '00000000-0000-0000-0000-000000000011';
const material: PreflightMaterial = { ...scope, actorId, configurationVersion: 1,
  issuer: { cnpj: '00000000000100', municipalityCode: '2803401', municipalRegistration: null,
    opSimpNac: '1', regEspTrib: '0', regApTribSN: null },
  certificate: { notBefore: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z', fingerprint: 'a'.repeat(64) },
  material: { certificatePem: 'CERTIFICATE_SENTINEL', chainPem: 'CHAIN_SENTINEL', privateKeyPem: 'PRIVATE_KEY_SENTINEL' } };
const request = (body: unknown = { scope }) => new Request('https://local.test/preflight', {
  method: 'POST', headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const respond = (_req: Request, body: unknown, status: number) => Response.json(body, { status });

Deno.test('handler authenticates before parse and rejects production before reading Vault', async () => {
  let vaultReads = 0;
  const handler = createPreflightHandler({ identity: async () => actorId,
    material: async () => { vaultReads++; return material; }, probe: runPreflight,
    rateLimited: () => false, respond });
  assert.equal((await handler(request({ scope: { ...scope, environment: 'PRODUCAO' } }))).status, 400);
  assert.equal(vaultReads, 0);
  assert.equal((await handler(request({ scope, referenceDate: '2026-02-31' }))).status, 400);
  assert.equal((await handler(request({ scope, arbitraryUrl: 'https://evil.test' }))).status, 400);
  assert.equal(vaultReads, 0);
  const denied = createPreflightHandler({ identity: async () => { throw new Error('sensitive upstream error'); },
    material: async () => { vaultReads++; return material; }, probe: runPreflight, rateLimited: () => false, respond });
  const deniedResponse = await denied(request());
  assert.equal(deniedResponse.status, 403);
  assert.equal((await deniedResponse.text()).includes('sensitive'), false);
  assert.equal(vaultReads, 0);
});

Deno.test('handler never returns credentials and binds actor plus exact scope', async () => {
  let probed = false;
  const handler = createPreflightHandler({ identity: async () => actorId,
    material: async () => material,
    probe: async () => { probed = true; return { checkedAt: '2026-11-10T00:00:00Z', environment: 'HOMOLOGACAO',
      referenceDate: '2026-11-01', checks: [], pilot: { available: false, reason: 'PILOT_EXECUTOR_NOT_CONFIGURED' },
      certificateExpiresAt: material.certificate.expiresAt, endpoints: [], contracts: [], municipalParameters: [] }; },
    rateLimited: () => false, respond });
  const response = await handler(request());
  assert.equal(response.status, 200); assert.equal(probed, true);
  const body = await response.text();
  assert.equal(/SENTINEL|cnpj|privateKey|material|vault/i.test(body), false);
  const mismatch = createPreflightHandler({ identity: async () => actorId,
    material: async () => ({ ...material, actorId: 'different' }), probe: runPreflight,
    rateLimited: () => false, respond });
  assert.equal((await mismatch(request())).status, 403);
});

Deno.test('transport permits fixed restricted-namespace GET routes only', () => {
  assertPreflightUrl('https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/swagger/docs/v1');
  assertPreflightUrl('https://adn.producaorestrita.nfse.gov.br/parametrizacao/2803401/convenio');
  assertPreflightUrl('https://adn.producaorestrita.nfse.gov.br/parametrizacao/ParametrosMunicipais/2803401/080201/2026-11-10/aliquota');
  for (const url of [
    'https://sefin.nfse.gov.br/SefinNacional/swagger/docs/v1',
    'https://evil.test/parametrizacao/2803401/convenio',
    'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse',
    'https://adn.producaorestrita.nfse.gov.br/parametrizacao/2803401/convenio?cnpj=00000000000100',
    'https://user:password@adn.producaorestrita.nfse.gov.br/parametrizacao/2803401/convenio',
  ]) assert.throws(() => assertPreflightUrl(url), /UNSUPPORTED_PREFLIGHT_ROUTE/);
});

Deno.test('native transport supplies matching PKCS8 credentials, blocks redirects and bounds streaming responses', async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = pair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  const normalized = privateKeyAsPkcs8(keyPem);
  assert.match(normalized, /^-----BEGIN PRIVATE KEY-----/);
  assert.equal(createPrivateKey(normalized).export({ type: 'pkcs1', format: 'pem' }), keyPem);
  assert.throws(() => privateKeyAsPkcs8('PRIVATE_KEY_SENTINEL'), /PREFLIGHT_CLIENT_KEY_UNAVAILABLE/);
  let closed = 0; let mode = 'ok'; let requests = 0;
  const client = { close() { closed++; } };
  const transport = createPreflightTransport({ ...material.material, privateKeyPem: keyPem }, {
    createClient(options) {
      assert.equal(options.cert, 'CERTIFICATE_SENTINEL\nCHAIN_SENTINEL');
      assert.match(options.key, /^-----BEGIN PRIVATE KEY-----/);
      assert.deepEqual(Object.keys(options).sort(), ['cert', 'http1', 'http2', 'key']);
      assert.equal(options.http1, true); assert.equal(options.http2, false);
      return client;
    },
    async fetch(url, options) {
      requests++;
      assert.equal(url.origin, 'https://adn.producaorestrita.nfse.gov.br');
      assert.equal(options.client, client); assert.equal(options.redirect, 'error');
      assert.equal(options.method, 'GET'); assert.ok(options.signal instanceof AbortSignal);
      if (mode === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://evil.test' } });
      if (mode === 'oversize') return new Response(new globalThis.ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close();
      } }));
      return Response.json({ convenio: true });
    },
  });
  const url = 'https://adn.producaorestrita.nfse.gov.br/parametrizacao/2803401/convenio';
  const response = await transport.get(url); assert.equal(response.tlsVerified, true);
  assert.equal(response.status, 200);
  mode = 'redirect'; await assert.rejects(transport.get(url), /REDIRECT_REJECTED/);
  mode = 'oversize'; await assert.rejects(transport.get(url), /RESPONSE_TOO_LARGE/);
  await assert.rejects(transport.get('https://evil.test'), /UNSUPPORTED_PREFLIGHT_ROUTE/);
  assert.equal(requests, 3);
  transport.close(); transport.close(); assert.equal(closed, 1);
  await assert.rejects(transport.get(url), /PREFLIGHT_CLIENT_CLOSED/);
});

Deno.test('transport diagnostics classify native failures without disclosing messages or causes', async () => {
  for (const [message, expected] of [
    ['invalid peer certificate: UnknownIssuer', 'TLS_SERVER_CERTIFICATE_UNTRUSTED'],
    ['received fatal alert: BadCertificate', 'TLS_CLIENT_CERTIFICATE_REJECTED'],
    ['received fatal alert: UnknownCA', 'TLS_CLIENT_CERTIFICATE_REJECTED'],
    ['dns error: failed to lookup address information', 'DNS_FAILURE'],
    ['connection reset by peer (os error 54)', 'EGRESS_FAILURE'],
    ['connection error: unexpected EOF', 'EGRESS_FAILURE'],
    ['AbortError: signal aborted', 'TIMEOUT'],
    ['peer sent HelloRequest; renegotiation is not supported', 'TLS_RENEGOTIATION_UNSUPPORTED'],
    ['fatal alert NoApplicationProtocol', 'TLS_ALPN_NEGOTIATION_FAILED'],
    ['peer incompatible: ProtocolVersion', 'TLS_PROTOCOL_UNSUPPORTED'],
    ['unsupported SignatureAlgorithm', 'TLS_SIGNATURE_ALGORITHM_UNSUPPORTED'],
    ['received fatal alert: UnexpectedMessage', 'TLS_HANDSHAKE_FAILED'],
    ['SECRET_SENTINEL CNPJ 00000000000100 PRIVATE KEY', 'UNKNOWN_TRANSPORT_FAILURE'],
  ]) assert.equal(safeTransportCode(new Error(message)), expected);
  assert.equal(safeTransportCode(new Error('sensitive'), true), 'TIMEOUT');
  assert.equal(safeTransportCode({ cause: { code: 'ENOTFOUND', message: 'SECRET_SENTINEL' } }), 'DNS_FAILURE');
  const data = await runPreflight(material, { transport: {
    close() {},
    async get() { throw new Error('invalid peer certificate: UnknownIssuer SECRET_SENTINEL'); },
  } });
  assert.equal(data.endpoints.every((endpoint) => endpoint.error === 'TLS_SERVER_CERTIFICATE_UNTRUSTED'), true);
  assert.equal(JSON.stringify(data).includes('SECRET_SENTINEL'), false);
});

Deno.test('probe reports capabilities independently and never claims representation or pilot eligibility', async () => {
  const visited: string[] = []; let closed = false;
  const sefinSpec = { swagger: '2.0', paths: { '/nfse': { post: { parameters: [
    { name: 'body', in: 'body', required: true, schema: { $ref: '#/definitions/Request' } },
  ] } } }, definitions: { Request: { type: 'object', properties: { dpsXmlGZipB64: { type: 'string' } } } } };
  const municipalSpec = { openapi: '3.0.1', paths: { '/{codigoMunicipio}/convenio': { get: {
    parameters: [{ name: 'dataCompetencia', in: 'query', required: true, schema: { type: 'string', format: 'date' } }],
  } } } };
  const data = await runPreflight(material, { transport: {
    close() { closed = true; },
    async get(url) {
      visited.push(url);
      return { status: 200, tlsVerified: true, body: JSON.stringify(url.includes('/convenio')
        ? { ativo: true, aderiuEmissorNacional: false, dataInicio: '2026-01-01', cnpj: '00000000000100',
          mensagem: 'PRIVATE_KEY_SENTINEL', nome: 'PERSON_SENTINEL' }
        : url.includes('sefin.') ? sefinSpec : municipalSpec) };
    },
  }, now: () => new Date('2026-11-10T00:00:00Z') });
  assert.equal(closed, true); assert.equal(data.pilot.available, false);
  assert.equal(data.checks.find((check) => check.code === 'REPRESENTATION')?.status, 'UNKNOWN');
  assert.equal(data.checks.find((check) => check.code === 'SEFIN_CONTRACT')?.status, 'PASSED');
  assert.equal(data.checks.find((check) => check.code === 'PRODUCTION')?.status, 'BLOCKED');
  assert.equal(visited.some((url) => url.endsWith('?dataCompetencia=2026-11-01')), true);
  assert.equal(/SENTINEL|00000000000100|privateKeyPem/.test(JSON.stringify(data)), false);
  assert.equal((data.municipalParameters[0].parameters as Record<string, unknown>).aderiuEmissorNacional, false);
});

Deno.test('contract projection omits examples and municipal projection drops identities and free text', () => {
  const summary = summarizePublicSpec({ swagger: '2.0', description: 'SECRET_SENTINEL',
    paths: { '/nfse': { post: { description: 'SECRET_SENTINEL' } } },
    definitions: { Request: { type: 'object', example: 'SECRET_SENTINEL', properties: { dpsXmlGZipB64: { type: 'string' } } } } });
  assert.equal(JSON.stringify(summary).includes('SECRET_SENTINEL'), false);
  assert.deepEqual(sanitizeMunicipalParameters({ convenio: { ativo: true, nome: 'PERSON_SENTINEL',
    cnpj: '00000000000100', descricao: 'SECRET_SENTINEL', codigo: '2803401' } }),
  { convenio: { ativo: true, codigo: '2803401' } });
});
