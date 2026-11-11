import assert from 'node:assert/strict';
import {TextDecoder} from 'node:util';
import {createNationalProductionRelayTransport,assertProductionRelayConfig,APPROVED_PRODUCTION_RELAY_URLS} from './production-relay.ts';
Deno.test('production relay pins only the two reviewed recovery previews',()=>{
  assert.equal(APPROVED_PRODUCTION_RELAY_URLS.length,2);
  for(const url of APPROVED_PRODUCTION_RELAY_URLS)assert.doesNotThrow(()=>assertProductionRelayConfig({url,key:'11'.repeat(32)}));
  assert.throws(()=>assertProductionRelayConfig({url:'https://universo-cursos-consultoria-arbitrary.vercel.app/api/nfse-production-relay',key:'11'.repeat(32)}));
  assert.throws(()=>assertProductionRelayConfig({url:APPROVED_PRODUCTION_RELAY_URLS[1]+'?target=other',key:'11'.repeat(32)}));
});
Deno.test('production relay permits numeric GET event sequence1 without widening POST or origins',async()=>{
  const url='https://universo-cursos-consultoria-test-fixture.vercel.app/api/nfse-production-relay';
  const key='2'.repeat(50);const requests:string[]=[];
  const transport=createNationalProductionRelayTransport({url,key:'11'.repeat(32)},
    {certificatePem:'SYNTHETIC_CERTIFICATE',chainPem:'SYNTHETIC_CHAIN',privateKeyPem:'SYNTHETIC_PRIVATE'},
    {approvedUrls:[url],fetch:(async(target,init)=>{
      assert.equal(target,url);const body=JSON.parse(new TextDecoder().decode(init?.body as Uint8Array));
      assert.equal(body.method,'GET');requests.push(body.path);
      return Response.json({status:404,bodyBase64:btoa('{}')});
    }) as typeof fetch});
  try{
    for(const sequence of ['1','001'])await transport.request('GET',`/nfse/${key}/eventos/101101/${sequence}`);
    assert.deepEqual(requests,[`/nfse/${key}/eventos/101101/1`,`/nfse/${key}/eventos/101101/001`]);
    for(const sequence of ['1000','-1','1?other=2']){
      await assert.rejects(transport.request('GET',`/nfse/${key}/eventos/101101/${sequence}`),/UNSUPPORTED_RELAY_ROUTE/);
    }
    await assert.rejects(transport.request('POST',`/nfse/${key}/eventos/101101/1`,'{}'),/UNSUPPORTED_RELAY_ROUTE/);
    await assert.rejects(transport.request('POST',`/nfse/${key}/eventos`,'{}'),/RELAY_POST_NOT_AUTHORIZED/);
    assert.equal(requests.length,2);
  }finally{transport.close();}
});
