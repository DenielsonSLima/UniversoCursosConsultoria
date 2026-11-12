import assert from 'node:assert/strict';
import { createProductionContractCache } from './contract-cache.ts';
import type { ProductionContractEvidence } from '../_shared/nfse-national/production-live-contract.ts';
const object = (types: Record<string, string>, required: string[] = []) => ({ type: 'object', required,
  properties: Object.fromEntries(Object.entries(types).map(([name, type]) => [name, { type }])) });
function evidence(): ProductionContractEvidence {
  const schemas = {
    IssueRequest: object({ dpsXmlGZipB64: 'string' }, ['dpsXmlGZipB64']),
    IssueResponse: object({ tipoAmbiente: 'integer', idDps: 'string', chaveAcesso: 'string', nfseXmlGZipB64: 'string' }),
    NoteResponse: object({ tipoAmbiente: 'integer', nfseXmlGZipB64: 'string' }),
    DpsResponse: object({ tipoAmbiente: 'integer', idDps: 'string', chaveAcesso: 'string' }),
    EventRequest: object({ pedidoRegistroEventoXmlGZipB64: 'string' }, ['pedidoRegistroEventoXmlGZipB64']),
    EventItem: object({ idEvento: 'string', eventoXmlGZipB64: 'string' }),
    EventsResponse: { type: 'object', properties: { tipoAmbiente: { type: 'integer' },
      eventos: { type: 'array', items: { $ref: '#/definitions/EventItem' } } } },
  };
  const response = (name: string) => ({ schema: { $ref: `#/definitions/${name}` } });
  const body = (name: string) => [{ in: 'body', required: true, schema: { $ref: `#/definitions/${name}` } }];
  return { environment: 'PRODUCAO', checkedAt: '2026-11-11T01:00:00Z', status: 200,
    url: 'https://sefin.nfse.gov.br/SefinNacional/swagger/docs/v1', tlsVerified: true, certificateValid: true,
    specification: { swagger: '2.0', definitions: schemas, paths: {
      '/nfse': { post: { parameters: body('IssueRequest'), responses: { 201: response('IssueResponse') } } },
      '/dps/{id}': { get: { responses: { 200: response('DpsResponse') } } },
      '/nfse/{chaveAcesso}': { get: { responses: { 200: response('NoteResponse') } } },
      '/nfse/{chaveAcesso}/eventos': {
        get: { responses: { 200: response('EventsResponse') } },
        post: { parameters: body('EventRequest'), responses: {} },
      },
    } } };
}
const now = Date.parse('2026-11-11T01:00:00Z');


Deno.test('contract cache preserves original evidence timestamp and expires without stale fallback', () => {
  let clock = now;
  const cache = createProductionContractCache(() => clock);
  cache.put('scope', evidence());
  assert.ok(cache.get('scope'));
  clock += 59_999;
  const hit = cache.get('scope')!;
  assert.equal(hit.checkedAt, evidence().checkedAt);
  cache.put('scope', hit);
  clock += 1;
  assert.equal(cache.get('scope'), null);
});
Deno.test('contract cache isolates rotation keys, rejects invalid evidence and cannot be mutated by caller', () => {
  const cache = createProductionContractCache(() => now);
  const proof = evidence(); cache.put('cert1-version1', proof);
  proof.status = 503;
  assert.equal(cache.get('cert1-version1')?.status, 200);
  assert.equal(cache.get('cert2-version1'), null);
  const hit = cache.get('cert1-version1')!; hit.specification = {};
  assert.ok(cache.get('cert1-version1'));
  cache.put('bad', proof); assert.equal(cache.get('bad'), null);
  cache.put('future', {...evidence(), checkedAt: new Date(now + 1).toISOString()});
  assert.equal(cache.get('future'), null);
  cache.invalidate('cert1-version1'); assert.equal(cache.get('cert1-version1'), null);
});
Deno.test('contract cache bounds process memory', () => {
  const cache = createProductionContractCache(() => now);
  for (let i=0;i<129;i++) cache.put(String(i), evidence());
  assert.equal(cache.get('0'), null); assert.ok(cache.get('128'));
});
Deno.test('contract cache limits individual and total serialized evidence bytes', () => {
  const cache = createProductionContractCache(() => now);
  const large = evidence();
  (large.specification as Record<string,unknown>).description = 'x'.repeat(1024*1024);
  cache.put('oversized',large); assert.equal(cache.get('oversized'),null);
  (large.specification as Record<string,unknown>).description = 'x'.repeat(300_000);
  for(let i=0;i<8;i++) cache.put(String(i),large);
  assert.equal(cache.get('0'),null); assert.equal(cache.get('1'),null);
  assert.ok(cache.get('7'));
  cache.invalidate('7'); cache.put('fresh', evidence()); assert.ok(cache.get('fresh'));
});
