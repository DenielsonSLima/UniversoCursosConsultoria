import assert from 'node:assert/strict';
import { createNationalProductionIssuer } from './production.ts';
import { buildNationalDps } from './dps.ts';
import { createProductionNumericSeriesCompatibilityValidator } from './production-schema.ts';
import { productionFixture,withProductionTestCertificate } from './production.test-fixtures.ts';
import { pilotAccessKey,syntheticAuthorizedNote } from './pilot-fixtures.ts';
import { encodeFiscalXml } from './pilot-codec.ts';
import { assertNationalEnvelope } from './pilot-response.ts';
const json=(value:unknown,status=200)=>({status,body:new TextEncoder().encode(JSON.stringify(value))});
Deno.test('production absent JSON IDs require exact authorized XML; present conflicts and wrong environments remain uncertain without POST',async()=>{
  await withProductionTestCertificate(async credential=>{
    const input=productionFixture(),expected=buildNationalDps(input).referenceId;let mode='CORRECT';let xml='';const calls:string[]=[];
    const issuer=createNationalProductionIssuer({credential,signatureProfile:'RSA_SHA1_LEGACY',schema:createProductionNumericSeriesCompatibilityValidator(),
      assertLiveContract(){throw new Error('No POST during reconciliation');},transport:{async request(method,path){
        calls.push(`${method} ${path}`);assert.equal(method,'GET');
        if(path.startsWith('/dps/'))return json({tipoAmbiente:mode==='WRONG_ENV'?2:1,chaveAcesso:pilotAccessKey,
          ...(mode==='WRONG_JSON_ID'?{idDps:expected.slice(3)}:{}),...(mode==='CONFLICT_JSON_IDS'?{idDps:expected,idDPS:expected.slice(3)}:{})});
        let returned=xml;
        if(mode==='WRONG_XML_ID')returned=returned.replace(`Id="${expected}"`,`Id="${expected.slice(0,-1)}4"`);
        if(mode==='WRONG_XML_PAYLOAD')returned=returned.replace('<vServ>1.00','<vServ>2.00');
        if(mode==='WRONG_XML_ENV')returned=returned.replace('<tpAmb>1</tpAmb>','<tpAmb>2</tpAmb>');
        return json({tipoAmbiente:1,nfseXmlGZipB64:encodeFiscalXml(returned)});
      }}});
    const prepared=await issuer.prepare(input,expected);xml=syntheticAuthorizedNote(prepared.signedDpsXml,credential);
    const result=await issuer.reconcile(prepared);assert.equal(result.state,'AUTHORIZED');
    if(result.state==='AUTHORIZED'){assert.equal(result.dpsId,expected);assert.equal(result.number,'9');assert.equal(result.authorizedXml,xml);}
    assert.deepEqual(calls,[`GET /dps/${expected}`,`GET /nfse/${pilotAccessKey}`]);
    for(const scenario of ['WRONG_XML_ID','WRONG_XML_PAYLOAD','WRONG_JSON_ID','CONFLICT_JSON_IDS','WRONG_ENV','WRONG_XML_ENV']){
      mode=scenario;calls.length=0;const uncertain=await issuer.reconcile(prepared);assert.equal(uncertain.state,'AWAITING_CONFIRMATION',scenario);
      assert.equal(calls.filter(call=>call.startsWith('POST')).length,0);assert.equal(calls.filter(call=>call===`GET /dps/${expected}`).length,1);
      if(uncertain.state==='AWAITING_CONFIRMATION'){
        if(scenario==='WRONG_XML_PAYLOAD')assert.equal(uncertain.code,'AUTHORIZED_DPS_PAYLOAD_MISMATCH');
        if(scenario==='WRONG_JSON_ID'||scenario==='CONFLICT_JSON_IDS')assert.equal(uncertain.code,'RESPONSE_DPS_MISMATCH');
        if(scenario==='WRONG_ENV')assert.equal(uncertain.code,'RESPONSE_ENVIRONMENT_MISMATCH');
      }
    }
  });
});
Deno.test('production POST201 may omit JSON IDs only when returned XML proves this exact signed DPS',async()=>{
  await withProductionTestCertificate(async credential=>{
    const input=productionFixture(),expected=buildNationalDps(input).referenceId;const calls:string[]=[];let xml='';
    const issuer=createNationalProductionIssuer({credential,signatureProfile:'RSA_SHA1_LEGACY',schema:createProductionNumericSeriesCompatibilityValidator(),
      assertLiveContract(){},transport:{async request(method,path){calls.push(`${method} ${path}`);
        if(method==='GET')return json({},404);return json({tipoAmbiente:1,chaveAcesso:pilotAccessKey,nfseXmlGZipB64:encodeFiscalXml(xml)},201);}}});
    const prepared=await issuer.prepare(input,expected);xml=syntheticAuthorizedNote(prepared.signedDpsXml,credential);
    assert.equal((await issuer.issue(prepared)).state,'AUTHORIZED');assert.deepEqual(calls,[`GET /dps/${expected}`,'POST /nfse']);
    assert.throws(()=>assertNationalEnvelope({tipoAmbiente:2},'HOMOLOGACAO',expected),/RESPONSE_DPS_MISMATCH/);
  });
});
