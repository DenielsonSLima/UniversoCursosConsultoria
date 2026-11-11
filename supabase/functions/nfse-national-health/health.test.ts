import assert from 'node:assert/strict';
import { probeNationalHealth, type HealthDependencies, type HealthObservation } from './probe.ts';
import { createHealthHandler } from './handler.ts';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO' as const, month: '2026-11' };
const now = Date.parse('2026-11-11T12:00:00Z');
const reference = { dpsId: `DPS${'1'.repeat(42)}`, accessKey: '2'.repeat(50), issuerCnpj: '3'.repeat(14) };

function fixture() {
  const calls: string[] = [];
  let closed = 0;
  const response = { status: 200, body: new TextEncoder().encode(JSON.stringify({ tipoAmbiente: 1,
    chaveAcesso: reference.accessKey, idDps: reference.dpsId })) };
  const material = { ...scope, actorId: id(3), issuer: { cnpj: reference.issuerCnpj },
    certificate: { notBefore: '2026-01-01', expiresAt: '2027-01-01' },
    material: { certificatePem: 'synthetic certificate', privateKeyPem: 'synthetic fixture', chainPem: '' } };
  const refs = { reference: reference as typeof reference | null };
  const deps: HealthDependencies = {
    now: () => now,
    async rpc(name, args) {
      calls.push(name); assert.equal(args.p_actor_id, id(3));
      if (name === 'get_nfse_health_reference_internal') return refs;
      if (name === 'get_nfse_production_material_internal') return material;
      assert.equal(name, 'get_nfse_production_relay_config_internal'); return {};
    },
    transport() { return {
      async request(method, path) { calls.push(`${method} ${path}`); return response; },
      close() { closed++; },
    }; },
  };
  return { deps, calls, response, material, refs, closed: () => closed };
}

Deno.test('probe only reads an own existing DPS and returns sanitized fresh evidence', async () => {
  const f = fixture();
  const result = await probeNationalHealth(scope, id(3), f.deps);
  assert.equal(result.state, 'AVAILABLE');
  assert.equal(Date.parse(result.expiresAt) - Date.parse(result.checkedAt), 60_000);
  assert.deepEqual(f.calls.filter(call => call.startsWith('GET')), [`GET /dps/${reference.dpsId}`]);
  assert(!f.calls.some(call => /POST|preview|prepare|operation|cancel|dispatch/.test(call)));
  assert(!JSON.stringify(result).includes(reference.accessKey));
  assert(!JSON.stringify(result).includes(reference.dpsId));
  assert(!JSON.stringify(result).includes('synthetic'));
  assert.equal(f.closed(), 1);
});

Deno.test('only a validated successful government read is green; access/missing/rate-limit/network remain unknown', async () => {
  for (const status of [200, 400, 401, 403, 404, 429, 500, 502, 503, 504]) {
    const f = fixture(); f.response.status = status;
    const result = await probeNationalHealth(scope, id(3), f.deps);
    assert.equal(result.state, status === 200 ? 'AVAILABLE' : status >= 500 ? 'UNAVAILABLE' : 'UNKNOWN');
    assert.equal(f.closed(), 1);
  }
  for (const body of [{ tipoAmbiente: 2, chaveAcesso: reference.accessKey },
    { tipoAmbiente: 1, chaveAcesso: '4'.repeat(50) },
    { tipoAmbiente: 1, chaveAcesso: reference.accessKey, idDPS: 'other' },
    { tipoAmbiente: 1, chaveAcesso: reference.accessKey, erros: [] }, null, []]) {
    const f = fixture(); f.response.body = new TextEncoder().encode(JSON.stringify(body));
    assert.equal((await probeNationalHealth(scope, id(3), f.deps)).state, 'UNKNOWN');
  }
  const f = fixture();
  f.deps.transport = () => ({ request: () => Promise.reject(new Error('private payload')), close() {} });
  assert.equal((await probeNationalHealth(scope, id(3), f.deps)).state, 'UNKNOWN');
});

Deno.test('no reference or invalid credential scope cannot cause an external request', async () => {
  const f = fixture(); f.refs.reference = null;
  assert.equal((await probeNationalHealth(scope, id(3), f.deps)).reason, 'NO_REFERENCE');
  assert.deepEqual(f.calls, ['get_nfse_health_reference_internal']);
  for (const change of [
    (m: ReturnType<typeof fixture>['material']) => { m.actorId = id(4); },
    (m: ReturnType<typeof fixture>['material']) => { m.poloId = id(4); },
    (m: ReturnType<typeof fixture>['material']) => { m.issuer.cnpj = '4'.repeat(14); },
    (m: ReturnType<typeof fixture>['material']) => { m.certificate.expiresAt = '2025-01-01'; },
  ]) {
    const f = fixture(); change(f.material);
    assert.equal((await probeNationalHealth(scope, id(3), f.deps)).state, 'UNKNOWN');
    assert(!f.calls.some(call => call.startsWith('GET')));
  }
});

Deno.test('handler reauthorizes cached/coalesced reads, limits requests and rejects supplied references', async () => {
  let auth = 0, probes = 0, denied = false, limited = false, time = now;
  const good = (): HealthObservation => ({ state: 'AVAILABLE', reason: 'NATIONAL_QUERY_OK',
    checkedAt: new Date(time).toISOString(), expiresAt: new Date(time + 60_000).toISOString() });
  const handler = createHealthHandler({
    now: () => time, rateLimited: () => limited,
    async authorize() { auth++; if (denied) throw new Error('secret'); return id(3); },
    async probe() { probes++; await Promise.resolve(); return good(); },
    respond: (_req, body, status) => new Response(JSON.stringify(body), { status }),
  });
  const request = (body: unknown = { scope }) => new Request('https://example.test/health', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const results = await Promise.all([handler(request()), handler(request()), handler(request())]);
  assert(results.every(result => result.status === 200)); assert.equal(probes, 1); assert.equal(auth, 3);
  denied = true; assert.equal((await handler(request())).status, 403); assert.equal(probes, 1);
  denied = false; time += 60_001; assert.equal((await handler(request())).status, 200); assert.equal(probes, 2);
  assert.equal((await handler(request({ scope, dpsId: reference.dpsId }))).status, 400);
  assert.equal((await handler(request({ scope: { ...scope, environment: 'HOMOLOGACAO' } }))).status, 400);
  assert.equal((await handler(request({ scope: { ...scope, month: '2026-99' } }))).status, 400);
  assert.equal((await handler(request({ scope, huge: 'x'.repeat(2048) }))).status, 400);
  assert.equal((await handler(new Request('https://example.test/health'))).status, 405);
  limited = true; assert.equal((await handler(request())).status, 429);
  assert.equal(probes, 2);
});

Deno.test('cache is isolated by actor/context/polo/month and canonical across property ordering', async () => {
  let actor = id(3), probes = 0;
  const handler = createHealthHandler({ now: () => now, rateLimited: () => false,
    authorize: async () => actor,
    async probe() { probes++; return { state: 'AVAILABLE', reason: 'NATIONAL_QUERY_OK',
      checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString() }; },
    respond: (_req, body, status) => new Response(JSON.stringify(body), { status }),
  });
  const call = (changed = scope) => handler(new Request('https://example.test/health', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: changed }),
  }));
  await call(); await call({ month: scope.month, environment: scope.environment, poloId: scope.poloId, contextKey: scope.contextKey });
  assert.equal(probes, 1);
  actor = id(4); await call(); assert.equal(probes, 2);
  await call({ ...scope, contextKey: id(5) }); assert.equal(probes, 3);
  await call({ ...scope, poloId: id(6) }); assert.equal(probes, 4);
  await call({ ...scope, month: '2026-10' }); assert.equal(probes, 5);
  actor = id(3); await call(); assert.equal(probes, 5);
});
