import assert from 'node:assert/strict';
import { buildNationalDps } from './dps.ts';
import { createNationalProductionIssuer,productionDpsIdentityDiagnostics } from './production.ts';
import { createProductionNumericSeriesCompatibilityValidator } from './production-schema.ts';
import { productionFixture,withProductionTestCertificate } from './production.test-fixtures.ts';
const json=(value:unknown)=>({status:200,body:new TextEncoder().encode(JSON.stringify(value))});
Deno.test('DPS diagnostics are shape metadata only, never envelope, key or XML',()=>{
  const diagnostics=productionDpsIdentityDiagnostics({idDps:'1'.repeat(150),idDPS:{xml:'PRIVATE_XML'},chaveAcesso:'PRIVATE_KEY',
    nfseXmlGZipB64:'PRIVATE_XML',password:'SECRET'},'DPS_EXPECTED');
  assert.deepEqual(diagnostics,{expectedDpsLength:12,idDps:'OTHER_STRING',idDPS:'OBJECT',chaveAcessoPresent:true});
  assert.equal(/PRIVATE|SECRET|nfseXml|password/.test(JSON.stringify(diagnostics)),false);
  assert.deepEqual(productionDpsIdentityDiagnostics({idDps:null,idDPS:false},'DPS_EXPECTED'),{
    expectedDpsLength:12,idDps:'NULL',idDPS:'BOOLEAN',chaveAcessoPresent:false});
});
Deno.test('unprefixed or conflicting JSON DPS identity stays uncertain with diagnostics through GET only',async()=>{
  await withProductionTestCertificate(async credential=>{
    const input=productionFixture(),expected=buildNationalDps(input).referenceId;
    const calls:{method:string;path:string}[]=[];let body:Record<string,unknown>={tipoAmbiente:1,idDps:expected.slice(3),chaveAcesso:'1'.repeat(50)};
    const engine=createNationalProductionIssuer({credential,signatureProfile:'RSA_SHA1_LEGACY',schema:createProductionNumericSeriesCompatibilityValidator(),
      assertLiveContract(){throw new Error('No dispatch allowed during reconciliation');},transport:{async request(method,path){
        calls.push({method,path});assert.equal(method,'GET');return json(body);}}});
    const prepared=await engine.prepare(input,expected);
    const result=await engine.reconcile(prepared);
    assert.equal(result.state,'AWAITING_CONFIRMATION');
    if(result.state==='AWAITING_CONFIRMATION')assert.deepEqual(result.diagnostics,{expectedDpsLength:expected.length,idDps:'MATCH_WITHOUT_DPS_PREFIX',chaveAcessoPresent:true});
    assert.deepEqual(calls,[{method:'GET',path:`/dps/${expected}`}]);
    body={tipoAmbiente:1,idDps:expected,idDPS:expected.slice(3),chaveAcesso:'1'.repeat(50)};calls.length=0;
    const conflict=await engine.reconcile(prepared);assert.equal(conflict.state,'AWAITING_CONFIRMATION');
    if(conflict.state==='AWAITING_CONFIRMATION'){assert.equal(conflict.diagnostics?.idDps,'MATCH_EXPECTED_DPS');assert.equal(conflict.diagnostics?.idDPS,'MATCH_WITHOUT_DPS_PREFIX');}
    assert.deepEqual(calls,[{method:'GET',path:`/dps/${expected}`}]);
    body={tipoAmbiente:2,idDps:expected.slice(3)};
    const wrongEnvironment=await engine.reconcile(prepared);assert.equal(wrongEnvironment.state,'AWAITING_CONFIRMATION');
    if(wrongEnvironment.state==='AWAITING_CONFIRMATION'){assert.equal(wrongEnvironment.code,'RESPONSE_ENVIRONMENT_MISMATCH');assert.equal(wrongEnvironment.diagnostics,undefined);}
  });
});
