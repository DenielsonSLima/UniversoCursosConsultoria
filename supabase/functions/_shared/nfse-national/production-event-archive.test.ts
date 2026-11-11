import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {decodeProductionEventArchive,validProductionEventReceiptDate} from './production-event-archive.ts';
import {createNationalProductionCancellation} from './production-cancellation.ts';
import {createProductionNumericSeriesCompatibilityValidator} from './production-schema.ts';
import {encodeFiscalXml} from './pilot-codec.ts';
import {cancellationFixture,withProductionTestCertificate,syntheticProductionEvent} from './production.test-fixtures.ts';
import {pilotAccessKey} from './pilot-fixtures.ts';
import type {ProductionEventEnvelopeContract} from './production.types.ts';
const archive=(xml:string)=>Buffer.from(encodeFiscalXml(xml),'ascii').toString('base64');
const contract:ProductionEventEnvelopeContract={requestProperty:'pedidoRegistroEventoXmlGZipB64',listProperty:'eventos',
  xmlProperty:'arquivoXml',eventIdProperty:null,responseMode:'ARCHIVE_DOUBLE_BASE64_GZIP',lookupSequence:'001'};
Deno.test('local receipt metadata validates exact milliseconds and real calendar without assigning UTC',()=>{
  for(const value of ['2026-11-10T23:20:17.000','2024-02-29T00:00:00.001','2026-11-11T02:20:17Z','2026-11-10T23:20:17.0000000-03:00']){
    assert.equal(validProductionEventReceiptDate(value),true,value);
  }
  for(const value of ['2026-02-30T23:20:17.000','2025-02-29T00:00:00.001','2026-13-01T00:00:00.000',
    '2026-11-10T24:00:00.000','2026-11-10T23:60:00.000','2026-11-10T23:20:60.000',
    '2026-11-10T23:20:17','2026-11-10T23:20:17.0000000','2026-02-30T23:20:17.000Z','2026-11-10 23:20:17.000']){
    assert.equal(validProductionEventReceiptDate(value),false,value);
  }
});
Deno.test('event archive accepts exactly canonical double-base64 gzip UTF8, bounded before inflation',()=>{
  const xml='<evento>EXCLUSIVELY_SYNTHETIC</evento>';assert.equal(decodeProductionEventArchive(archive(xml)),xml);
  for(const value of [null,encodeFiscalXml(xml),Buffer.from(xml).toString('base64'),Buffer.from(xml).toString('hex'),
    'AB==','not+base64!',Buffer.from(' '+encodeFiscalXml(xml)).toString('base64'),
    Buffer.from([0xff,0xfe]).toString('base64'),'A'.repeat(8*1024*1024+4)]){
    assert.throws(()=>decodeProductionEventArchive(value));
  }
});
Deno.test('authenticated live archive GET proves same101101 PRE/seq001 and frozen signed payload without another POST',async()=>{
  await withProductionTestCertificate(async credential=>{
    const calls:string[]=[];let body:Record<string,unknown>={};
    const executor=createNationalProductionCancellation({credential,signatureProfile:'RSA_SHA1_LEGACY',
      schema:createProductionNumericSeriesCompatibilityValidator(),eventContract:contract,
      assertLiveContract(){throw new Error('No dispatch permitted');},assertCancellationAllowed(){throw new Error('No dispatch permitted');},
      transport:{async request(method,path){calls.push(method+' '+path);assert.equal(method,'GET');
        assert.equal(path,`/nfse/${pilotAccessKey}/eventos/101101/1`);
        return {status:200,body:new TextEncoder().encode(JSON.stringify(body))};}}});
    const prepared=await executor.prepare(cancellationFixture(pilotAccessKey));
    const event=syntheticProductionEvent(prepared.signedEventXml,pilotAccessKey,'101101',credential);
    const base={tipoAmbiente:1,versaoAplicativo:'SefinNacional_1.6.0',dataHoraProcessamento:'2026-11-11T02:50:24Z'};
    const item={arquivoXml:archive(event),tipoEvento:101101,chaveAcesso:pilotAccessKey,
      dataHoraRecebimento:'2026-11-10T23:20:17.000',numeroPedidoRegistroEvento:919};
    body={...base,eventos:[item]};
    const confirmed=await executor.reconcile(prepared);assert.equal(confirmed.state,'CONFIRMED');
    if(confirmed.state==='CONFIRMED'){
      assert.equal(confirmed.cancellationState,'CANCELLED');assert.equal(confirmed.eventCode,'101101');
      assert.equal(confirmed.eventId,`EVT${pilotAccessKey}101101001`);assert.equal(confirmed.eventXml,event);
    }
    const invalidBodies=[{...base,tipoAmbiente:2,eventos:[item]}, {...base,eventos:[]}, {...base,eventos:[item,item]},
      {...base,eventoXmlGZipB64:encodeFiscalXml(event)},
      ...[{tipoEvento:'101101'},{tipoEvento:101103},{chaveAcesso:'1'.repeat(50)},
        {dataHoraRecebimento:'INVALID'},{dataHoraRecebimento:'2026-11-10T23:20:17.0000000'},
        {dataHoraRecebimento:'2026-02-30T23:20:17.000'},
        {numeroPedidoRegistroEvento:'919'},{numeroPedidoRegistroEvento:1.5},
        {arquivoXml:encodeFiscalXml(event)},{arquivoXml:Buffer.from(event).toString('base64')},
        {arquivoXml:archive(event.replaceAll('101101','101103'))},
        {arquivoXml:archive(event.replace('<nSeqEvento>001','<nSeqEvento>002'))},
        {arquivoXml:archive(event.replace('<tpAmb>1','<tpAmb>2'))},
        {arquivoXml:archive(event.replace(prepared.input.reason,'Descrição divergente.'))}]
        .map(patch=>({...base,eventos:[{...item,...patch}]}))];
    for(body of invalidBodies){
      const result=await executor.reconcile(prepared);assert.equal(result.state,'AWAITING_CONFIRMATION');
      if(result.state==='AWAITING_CONFIRMATION'&&result.code==='REGISTERED_EVENT_PAYLOAD_MISMATCH'){
        assert.equal('registeredCancellationReview' in result,false);
        assert.equal('semanticDiff' in (result.diagnostics||{}),false);
      }
    }
    assert.equal(calls.every(call=>call.startsWith('GET ')),true);
    assert.equal(calls.length,invalidBodies.length+1);
  });
});
