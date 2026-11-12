import assert from 'node:assert/strict';
import { createIndividualRuntime } from './runtime.ts';
import { reviewedIndividualFixture } from './adapter.fixture.ts';
import type { IndividualCommand } from './contract.ts';
import type { ProductionContractEvidence } from '../_shared/nfse-national/production-live-contract.ts';
import { APPROVED_PRODUCTION_RELAY_URLS } from '../_shared/nfse-national/production-relay.ts';
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

Deno.test('runtime cache skips Swagger only: revalidates material/config each request and isolates rotations/scopes', async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [], rpcs: string[] = [];
  let fingerprint = 'b'.repeat(64), version = 3, relay = APPROVED_PRODUCTION_RELAY_URLS[0];
  let failFirst = false, failBoth = false, invalidCertificate = false;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(new globalThis.TextDecoder().decode(init?.body as Uint8Array));
    assert.equal(body.method, 'GET');
    assert.match(body.path, /^\/swagger\//);
    paths.push(body.path);
    const unavailable = failBoth || (failFirst && body.path === '/swagger/docs/v1');
    return Response.json({status: unavailable ? 503 : 200,
      bodyBase64: btoa(JSON.stringify(unavailable ? {} : evidence().specification))});
  };
  const cmd: IndividualCommand = {scope:{contextKey:'cache-test-context',poloId:'cache-test-polo',
    environment:'PRODUCAO',month:'2026-11'}, action:'PREVIEW',requestId:'cache-test-request',
    partnerId:'cache-test-partner',modelId:'cache-test-model',modelVersion:1,amount:'1.00',
    competenceDate:'2026-11-10',serviceDate:'2026-11-10'};
  async function check(actor = 'cache-test-actor', command = cmd) {
    const row = reviewedIndividualFixture(); row.certificateFingerprint = fingerprint; row.configurationVersion = version;
    const runtime = createIndividualRuntime({
      rpc: async (name,args) => {
        rpcs.push(name);
        if(name === 'get_nfse_production_material_internal') return {error:null,data:{
          actorId:args.p_actor_id,...command.scope,configurationVersion:version,
          issuer:{cnpj:'00000000000100'},certificate:{fingerprint,
            notBefore:'2020-01-01T00:00:00Z',expiresAt:invalidCertificate?'2020-02-01T00:00:00Z':'2030-01-01T00:00:00Z'},
          material:{certificatePem:'SYNTHETIC',chainPem:'SYNTHETIC',privateKeyPem:'SYNTHETIC'}}};
        if(name === 'get_nfse_production_relay_config_internal') return {error:null,data:{url:relay,key:'ab'.repeat(32)}};
        throw new Error('Unexpected RPC '+name);
      },authorize:async()=>actor,respond:(_r,body,status)=>Response.json(body,{status}),rateLimited:()=>false,
    });
    try { return await runtime.dependencies.capability(command,actor,row); }
    finally { runtime.close(); }
  }
  try {
    assert.equal((await check()).available,true); assert.equal(paths.length,1);
    assert.equal((await check()).available,true); assert.equal(paths.length,1);
    assert.deepEqual(rpcs, Array(2).fill(['get_nfse_production_material_internal','get_nfse_production_relay_config_internal']).flat());
    fingerprint='c'.repeat(64); assert.equal((await check()).available,true); assert.equal(paths.length,2);
    version++; assert.equal((await check()).available,true); assert.equal(paths.length,3);
    assert.equal((await check('cache-test-other-actor')).available,true); assert.equal(paths.length,4);
    assert.equal((await check('cache-test-actor',{...cmd,scope:{...cmd.scope,poloId:'other-polo'}})).available,true);
    assert.equal(paths.length,5);
    relay=APPROVED_PRODUCTION_RELAY_URLS[1]; assert.equal((await check()).available,true); assert.equal(paths.length,6);
    invalidCertificate=true; assert.equal((await check()).reason,'PRODUCTION_CERTIFICATE_EXPIRED');
    assert.equal(paths.length,6); invalidCertificate=false;
    version++; failFirst=true;
    assert.equal((await check()).available,true); assert.deepEqual(paths.slice(-2),['/swagger/docs/v1','/swagger/v1/swagger.json']);
    assert.equal(paths.length,8);
    version++; failBoth=true;
    assert.equal((await check()).reason,'PRODUCTION_MTLS_SPEC_UNVERIFIED'); assert.equal(paths.length,10);
    assert.equal((await check()).reason,'PRODUCTION_MTLS_SPEC_UNVERIFIED'); assert.equal(paths.length,12);
  } finally { globalThis.fetch = originalFetch; }
});
