import assert from 'node:assert/strict';
import {createNationalProductionCancellation} from './production-cancellation.ts';
import {createProductionNumericSeriesCompatibilityValidator} from './production-schema.ts';
import {cancellationFixture,withProductionTestCertificate,syntheticProductionEvent} from './production.test-fixtures.ts';
import {pilotAccessKey} from './pilot-fixtures.ts';
import {encodeFiscalXml,decodeFiscalXml} from './pilot-codec.ts';
import type {ProductionEventEnvelopeContract} from './production.types.ts';
import {assertProductionSingleEventEnvelope} from './production-event-response.ts';
const json=(body:unknown,status=200)=>({status,body:new TextEncoder().encode(JSON.stringify(body))});
const contract:ProductionEventEnvelopeContract={requestProperty:'pedidoRegistroEventoXmlGZipB64',listProperty:null,
  xmlProperty:'eventoXmlGZipB64',eventIdProperty:null,responseMode:'SINGLE_EVENT',lookupSequence:'001'};
Deno.test('single event contract reconciles type101101 sequence1 before and after the sole POST',async()=>{
  await withProductionTestCertificate(async credential=>{
    let registered='';const calls:string[]=[];
    const executor=createNationalProductionCancellation({credential,signatureProfile:'RSA_SHA1_LEGACY',schema:createProductionNumericSeriesCompatibilityValidator(),
      eventContract:contract,assertLiveContract(){},assertCancellationAllowed(){},transport:{async request(method,path,body){
        calls.push(`${method} ${path}`);
        if(method==='POST'){
          assert.equal(path,`/nfse/${pilotAccessKey}/eventos`);
          const requestXml=decodeFiscalXml(JSON.parse(body!).pedidoRegistroEventoXmlGZipB64);
          registered=syntheticProductionEvent(requestXml,pilotAccessKey,'101101',credential);
          return json({tipoAmbiente:1,versaoAplicativo:'TEST',dataHoraProcessamento:'2026-11-10T18:00:00Z',eventoXmlGZipB64:encodeFiscalXml(registered)},201);
        }
        assert.equal(path,`/nfse/${pilotAccessKey}/eventos/101101/1`);
        return registered?json({tipoAmbiente:1,versaoAplicativo:'TEST',dataHoraProcessamento:'2026-11-10T18:00:00Z',eventoXmlGZipB64:encodeFiscalXml(registered)}):
          json({tipoAmbiente:1,versaoAplicativo:'SefinNacional_1.6.0',dataHoraProcessamento:'2026-11-10T22:51:54.3517534-03:00'},404);
      }}});
    const prepared=await executor.prepare(cancellationFixture(pilotAccessKey));
    const result=await executor.cancel(prepared);assert.equal(result.state,'CONFIRMED');
    if(result.state==='CONFIRMED'){assert.equal(result.cancellationState,'CANCELLED');assert.equal(result.eventCode,'101101');assert.equal(result.eventId,`EVT${pilotAccessKey}101101001`);}
    assert.deepEqual(calls,[`GET /nfse/${pilotAccessKey}/eventos/101101/1`,`POST /nfse/${pilotAccessKey}/eventos`,`GET /nfse/${pilotAccessKey}/eventos/101101/1`]);
    calls.length=0;assert.equal((await executor.reconcile(prepared)).state,'CONFIRMED');assert.deepEqual(calls,[`GET /nfse/${pilotAccessKey}/eventos/101101/1`]);
  });
});
Deno.test('live minimal404 permits only omitted error detail; present detail, metadata and success remain strict',()=>{
  const base={tipoAmbiente:1,versaoAplicativo:'SefinNacional_1.6.0',dataHoraProcessamento:'2026-11-10T22:51:54.3517534-03:00'};
  assert.doesNotThrow(()=>assertProductionSingleEventEnvelope(base,true,true));
  assert.doesNotThrow(()=>assertProductionSingleEventEnvelope({...base,erro:{codigo:'E_X'}},true,true));
  for(const body of [{...base,erro:null},{...base,erro:[]},{...base,erro:{codigo:42}},
    {...base,tipoAmbiente:2},{...base,tipoAmbiente:'1'},{...base,versaoAplicativo:''},
    {...base,dataHoraProcessamento:'2026-11-10'},{...base,dataHoraProcessamento:'BAD_DATE'}]){
    assert.throws(()=>assertProductionSingleEventEnvelope(body,true,true));
  }
  assert.throws(()=>assertProductionSingleEventEnvelope(base,true));
});
Deno.test('malformed lookup never dispatches; pending recovery remains GET-only with bounded execution markers',async()=>{
  await withProductionTestCertificate(async credential=>{
    const calls:string[]=[];let valid=false;
    const executor=createNationalProductionCancellation({credential,signatureProfile:'RSA_SHA1_LEGACY',schema:createProductionNumericSeriesCompatibilityValidator(),
      eventContract:contract,assertLiveContract(){},assertCancellationAllowed(){},transport:{async request(method){
        calls.push(method);assert.equal(method,'GET');return json(valid?{tipoAmbiente:1,versaoAplicativo:'TEST',dataHoraProcessamento:'2026-11-11T01:00:00Z'}:
          {tipoAmbiente:1,erros:[{descricao:'PRIVATE_TEXT'}]},404);
      }}});
    const prepared=await executor.prepare(cancellationFixture(pilotAccessKey));
    const attempt=await executor.cancel(prepared);assert.equal(attempt.state,'AWAITING_CONFIRMATION');
    if(attempt.state==='AWAITING_CONFIRMATION')assert.deepEqual(attempt.diagnostics,{execution:'CANCEL',postAttemptedInThisExecution:false,
      errorLocation:'BEFORE_POST_LOOKUP',consult:{phase:'BEFORE_POST',httpStatus:404}});
    valid=true;const recovery=await executor.reconcile(prepared);assert.equal(recovery.state,'AWAITING_CONFIRMATION');
    if(recovery.state==='AWAITING_CONFIRMATION'){
      assert.equal(recovery.code,'REGISTERED_EVENT_NOT_FOUND');assert.deepEqual(recovery.diagnostics,{execution:'RECONCILE_CANCEL',postAttemptedInThisExecution:false,
        errorLocation:'RECONCILE_LOOKUP',consult:{phase:'RECONCILE',httpStatus:404}});
    }
    assert.deepEqual(calls,['GET','GET']);
  });
});
Deno.test('missing or contradictory detail results stay uncertain during GET-only recovery',async()=>{
  await withProductionTestCertificate(async credential=>{
    const paths:string[]=[];let mode='MISSING';let event='';
    const executor=createNationalProductionCancellation({credential,signatureProfile:'RSA_SHA1_LEGACY',schema:createProductionNumericSeriesCompatibilityValidator(),
      eventContract:contract,assertLiveContract(){throw new Error('No dispatch');},assertCancellationAllowed(){throw new Error('No dispatch');},
      transport:{async request(method,path){assert.equal(method,'GET');paths.push(path);
        if(mode==='MISSING')return json({tipoAmbiente:1,versaoAplicativo:'TEST',dataHoraProcessamento:'2026-11-10T18:00:00Z',erro:{codigo:'E_NOT_FOUND'}},404);
        if(mode==='WRONG_ENV')return json({tipoAmbiente:2,versaoAplicativo:'TEST',dataHoraProcessamento:'2026-11-10T18:00:00Z',eventoXmlGZipB64:encodeFiscalXml(event)});
        const wrong=mode==='WRONG_TYPE'?event.replaceAll('101101','101103'):event.replace('<nSeqEvento>001','<nSeqEvento>002');
        return json({tipoAmbiente:1,versaoAplicativo:'TEST',dataHoraProcessamento:'2026-11-10T18:00:00Z',eventoXmlGZipB64:encodeFiscalXml(wrong)});
      }}});
    const prepared=await executor.prepare(cancellationFixture(pilotAccessKey));event=syntheticProductionEvent(prepared.signedEventXml,pilotAccessKey,'101101',credential);
    for(mode of ['MISSING','WRONG_ENV','WRONG_TYPE','WRONG_SEQUENCE']){
      const result=await executor.reconcile(prepared);assert.equal(result.state,'AWAITING_CONFIRMATION',mode);
    }
    assert.equal(paths.length,4);assert.equal(paths.every(path=>path.endsWith('/101101/1')),true);
  });
});
Deno.test('duplicate event codes obtain matching registered XML instead of a terminal cancellation rejection',async()=>{
  await withProductionTestCertificate(async credential=>{
    for(const code of ['E0802','E1805','E0840']){
      const methods:string[]=[];let registered='';let sent='';
      const executor=createNationalProductionCancellation({credential,signatureProfile:'RSA_SHA1_LEGACY',
        schema:createProductionNumericSeriesCompatibilityValidator(),eventContract:contract,
        assertLiveContract(){},assertCancellationAllowed(){},transport:{async request(method,_path,body){
          methods.push(method);
          if(method==='POST'){
            sent=decodeFiscalXml(JSON.parse(body!).pedidoRegistroEventoXmlGZipB64);
            registered=syntheticProductionEvent(sent,pilotAccessKey,'101101',credential);
            return json({tipoAmbiente:1,versaoAplicativo:'TEST',dataHoraProcessamento:'2026-11-11T01:48:00Z',erro:{codigo:code}},400);
          }
          return registered?json({tipoAmbiente:1,versaoAplicativo:'TEST',dataHoraProcessamento:'2026-11-11T01:48:01Z',
            eventoXmlGZipB64:encodeFiscalXml(registered)}):json({tipoAmbiente:1,versaoAplicativo:'TEST',dataHoraProcessamento:'2026-11-11T01:47:59Z'},404);
        }}});
      const prepared=await executor.prepare(cancellationFixture(pilotAccessKey));
      const result=await executor.cancel(prepared);
      assert.equal(sent,prepared.signedEventXml,'Reconciliation must not rebuild or replace the immutable request');
      assert.equal(result.state,'CONFIRMED',code);
      if(result.state==='CONFIRMED'){
        assert.equal(result.cancellationState,'CANCELLED');assert.equal(result.eventCode,'101101');
        assert.equal(result.eventId,`EVT${pilotAccessKey}101101001`);assert.equal(result.eventXml,registered);
      }
      assert.deepEqual(methods,['GET','POST','GET']);
      methods.length=0;assert.equal((await executor.reconcile(prepared)).state,'CONFIRMED');assert.deepEqual(methods,['GET']);
    }
  });
});
Deno.test('duplicate response without matching registered XML remains pending and preserves GET-only probe markers',async()=>{
  await withProductionTestCertificate(async credential=>{
    for(const code of ['E0802','E1805','E0840']){
      for(const mode of ['MISSING','WRONG_REQUEST']){
        const methods:string[]=[];let posted=false;let wrongEvent='';
        const executor=createNationalProductionCancellation({credential,signatureProfile:'RSA_SHA1_LEGACY',
          schema:createProductionNumericSeriesCompatibilityValidator(),eventContract:contract,
          assertLiveContract(){},assertCancellationAllowed(){},transport:{async request(method){
            methods.push(method);
            const metadata={tipoAmbiente:1,versaoAplicativo:'TEST',dataHoraProcessamento:'2026-11-11T01:48:00Z'};
            if(method==='POST'){posted=true;return json({...metadata,erro:{codigo:code}},400);}
            return posted&&mode==='WRONG_REQUEST'?json({...metadata,eventoXmlGZipB64:encodeFiscalXml(wrongEvent)}):json(metadata,404);
          }}});
        const prepared=await executor.prepare(cancellationFixture(pilotAccessKey));
        const other=await executor.prepare({...prepared.input,reason:'Justificativa diferente da operacao canonica offline'});
        wrongEvent=syntheticProductionEvent(other.signedEventXml,pilotAccessKey,'101101',credential);
        const result=await executor.cancel(prepared);assert.equal(result.state,'AWAITING_CONFIRMATION',`${code}/${mode}`);
        if(result.state==='AWAITING_CONFIRMATION'){
          assert.equal(result.code,mode==='MISSING'?'REGISTERED_EVENT_NOT_FOUND':'REGISTERED_EVENT_PAYLOAD_MISMATCH');
          assert.equal(result.diagnostics?.postAttemptedInThisExecution,true);
          assert.equal(result.diagnostics?.postResponseStatus,400);assert.equal(result.diagnostics?.consult?.phase,'AFTER_POST');
        }
        assert.deepEqual(methods,['GET','POST','GET']);
        posted=false;methods.length=0;
        const probe=await executor.reconcile(prepared);assert.equal(probe.state,'AWAITING_CONFIRMATION');
        if(probe.state==='AWAITING_CONFIRMATION'){
          assert.equal(probe.code,'REGISTERED_EVENT_NOT_FOUND');assert.equal(probe.diagnostics?.postAttemptedInThisExecution,false);
          assert.deepEqual(probe.diagnostics?.consult,{phase:'RECONCILE',httpStatus:404});
        }
        assert.deepEqual(methods,['GET']);
      }
    }
  });
});
Deno.test('list-contract duplicate codes also reconcile while unrelated validated rejection remains a rejection',async()=>{
  await withProductionTestCertificate(async credential=>{
    const list:ProductionEventEnvelopeContract={...contract,responseMode:'LIST',listProperty:'eventos',eventIdProperty:'id'};
    for(const code of ['E0802','E1805','E0840','E0822']){
      const methods:string[]=[];
      const executor=createNationalProductionCancellation({credential,signatureProfile:'RSA_SHA1_LEGACY',
        schema:createProductionNumericSeriesCompatibilityValidator(),eventContract:list,
        assertLiveContract(){},assertCancellationAllowed(){},transport:{async request(method){
          methods.push(method);
          return method==='POST'?json({tipoAmbiente:1,erros:[{Codigo:code}]},400):json({tipoAmbiente:1,eventos:[]});
        }}});
      const prepared=await executor.prepare(cancellationFixture(pilotAccessKey));const result=await executor.cancel(prepared);
      assert.equal(result.state,code==='E0822'?'REJECTED':'AWAITING_CONFIRMATION',code);
      assert.deepEqual(methods,code==='E0822'?['GET','POST']:['GET','POST','GET']);
    }
  });
});
