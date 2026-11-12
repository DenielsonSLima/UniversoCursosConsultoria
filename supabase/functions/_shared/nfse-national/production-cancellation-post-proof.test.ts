import assert from 'node:assert/strict';
import {createNationalProductionCancellation} from './production-cancellation.ts';
import {createProductionNumericSeriesCompatibilityValidator} from './production-schema.ts';
import {cancellationFixture,withProductionTestCertificate,syntheticProductionEvent} from './production.test-fixtures.ts';
import {pilotAccessKey} from './pilot-fixtures.ts';
import {encodeFiscalXml,decodeFiscalXml} from './pilot-codec.ts';
const metadata={tipoAmbiente:1,versaoAplicativo:'SYNTHETIC',dataHoraProcessamento:'2026-11-12T18:00:00Z'};
const json=(body:unknown,status=200)=>({status,body:new TextEncoder().encode(JSON.stringify(body))});
Deno.test('POST200/201 complete event proof confirms despite GET404; acknowledgements and mismatches never confirm',async()=>{
 await withProductionTestCertificate(async credential=>{
  for(const status of [200,201]) for(const mode of ['VALID','ACK','WRONG_ENV','WRONG_KEY','WRONG_REASON','WRONG_SEQUENCE','WRONG_EVENT','BAD_XML','BAD_GZIP']) {
   const calls:string[]=[];
   const engine=createNationalProductionCancellation({credential,signatureProfile:'RSA_SHA1_LEGACY',
    schema:createProductionNumericSeriesCompatibilityValidator(),eventContract:{requestProperty:'pedidoRegistroEventoXmlGZipB64',
     listProperty:'eventos',xmlProperty:'arquivoXml',eventIdProperty:null,responseMode:'ARCHIVE_DOUBLE_BASE64_GZIP',lookupSequence:'001'},
    assertLiveContract(){},assertCancellationAllowed(){},transport:{async request(method,_path,body){
     calls.push(method);
     if(method==='GET') return json(metadata,404);
     let xml=syntheticProductionEvent(decodeFiscalXml(JSON.parse(body!).pedidoRegistroEventoXmlGZipB64),pilotAccessKey,'101101',credential);
     if(mode==='WRONG_KEY') xml=xml.replaceAll(pilotAccessKey,'9'.repeat(50));
     if(mode==='WRONG_REASON') xml=xml.replace('Erro no valor informado.','Outra justificativa diferente.');
     if(mode==='WRONG_SEQUENCE') xml=xml.replaceAll('101101001','101101002').replace('<nSeqEvento>001','<nSeqEvento>002');
     if(mode==='WRONG_EVENT') xml=xml.replaceAll('101101','101103');
     if(mode==='BAD_XML') xml='<evento/>';
     return json({...metadata,...(mode==='WRONG_ENV'?{tipoAmbiente:2}:{}),
      ...(mode==='ACK'?{}:{eventoXmlGZipB64:mode==='BAD_GZIP'?'invalid':encodeFiscalXml(xml)})},status);
    }}});
   const input={...cancellationFixture(pilotAccessKey),reason:'Erro no valor informado.'};
   const result=await engine.cancel(await engine.prepare(input));
   assert.equal(result.state,mode==='VALID'?'CONFIRMED':'AWAITING_CONFIRMATION',`${status}/${mode}`);
   assert.deepEqual(calls,mode==='VALID'?['GET','POST']:['GET','POST','GET']);
   if(result.state==='CONFIRMED') assert.equal(result.eventId,`EVT${pilotAccessKey}101101001`);
  }
 });
});
