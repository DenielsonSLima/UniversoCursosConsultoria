import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {matchProductionCancellationReasonRepresentation} from './production-event-representation.ts';
import {parseNationalFiscalXml,nationalFiscalChild,nationalFiscalSemantic} from './pilot-response.ts';
import {createNationalProductionCancellation} from './production-cancellation.ts';
import {createProductionNumericSeriesCompatibilityValidator} from './production-schema.ts';
import {cancellationFixture,withProductionTestCertificate,syntheticProductionEvent} from './production.test-fixtures.ts';
import {pilotAccessKey} from './pilot-fixtures.ts';
import {encodeFiscalXml} from './pilot-codec.ts';
import type {ProductionEventEnvelopeContract} from './production.types.ts';
const reason='Descrição sintética: ação educativa.';
const encoded=(value:string)=>Buffer.from(value,'utf8').toString('latin1');
const xml=(text:string)=>`<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse"><infPedReg Id="PRE_SYNTHETIC"><tpAmb>1</tpAmb><e101101><cMotivo>1</cMotivo><xMotivo>${text}</xMotivo></e101101></infPedReg></pedRegEvento>`;
const info=(value:string)=>nationalFiscalChild(parseNationalFiscalXml(value).documentElement,'infPedReg');
Deno.test('one reversible UTF8-as-Latin1 representation is confined to101101 reason and does not mutate originals',()=>{
  const a=info(xml(reason)),b=info(xml(encoded(reason)));const before=[a.toString(),b.toString()];
  assert.notEqual(nationalFiscalSemantic(a),nationalFiscalSemantic(b));
  assert.deepEqual(matchProductionCancellationReasonRepresentation(a,b,reason,'101101'),{
    reasonEncoding:'SEFIN_UTF8_AS_LATIN1',literalPayloadMatches:false,representationMatches:true});
  assert.deepEqual([a.toString(),b.toString()],before);assert.notEqual(reason,encoded(reason));
});
Deno.test('changed meaning, double conversion, another field/attribute, wrong input and other event stay rejected',()=>{
  const before=info(xml(reason));
  for(const value of [xml(encoded('Outra operação sintética.')),xml(encoded(encoded(reason))),
    xml(encoded(reason)).replace('<tpAmb>1','<tpAmb>2'),xml(encoded(reason)).replace('PRE_SYNTHETIC','PRE_OTHER'),
    xml(reason.toUpperCase()),xml(encoded(reason)+'Ā')]){
    assert.equal(matchProductionCancellationReasonRepresentation(before,info(value),reason,'101101'),undefined);
  }
  assert.equal(matchProductionCancellationReasonRepresentation(before,info(xml(encoded(reason))),'WRONG_INPUT','101101'),undefined);
  assert.equal(matchProductionCancellationReasonRepresentation(before,info(xml(encoded(reason))),reason,'101103'),undefined);
});
Deno.test('registered archive confirms only the proven representation through GET with exact original request/event bytes',async()=>{
  await withProductionTestCertificate(async credential=>{
    const calls:string[]=[];let responseXml='';
    const contract:ProductionEventEnvelopeContract={requestProperty:'pedidoRegistroEventoXmlGZipB64',listProperty:'eventos',
      xmlProperty:'arquivoXml',eventIdProperty:null,responseMode:'ARCHIVE_DOUBLE_BASE64_GZIP',lookupSequence:'001'};
    const executor=createNationalProductionCancellation({credential,signatureProfile:'RSA_SHA1_LEGACY',schema:createProductionNumericSeriesCompatibilityValidator(),
      eventContract:contract,assertLiveContract(){throw new Error('GET only');},assertCancellationAllowed(){throw new Error('GET only');},
      transport:{async request(method,path){calls.push(method);assert.equal(method,'GET');assert(path.endsWith('/101101/1'));
        return {status:200,body:new TextEncoder().encode(JSON.stringify({tipoAmbiente:1,versaoAplicativo:'SYNTHETIC',
          dataHoraProcessamento:'2026-11-11T03:00:00Z',eventos:[{arquivoXml:Buffer.from(encodeFiscalXml(responseXml),'ascii').toString('base64'),
            tipoEvento:101101,chaveAcesso:pilotAccessKey,dataHoraRecebimento:'2026-11-11T00:00:00.000',numeroPedidoRegistroEvento:919}]}))};}}});
    const input={...cancellationFixture(pilotAccessKey),reason};const prepared=await executor.prepare(input);const original=prepared.signedEventXml;
    const officialRequest=original.replace(reason,encoded(reason));
    responseXml=syntheticProductionEvent(officialRequest,pilotAccessKey,'101101',credential);const official=responseXml;
    const confirmed=await executor.reconcile(prepared);assert.equal(confirmed.state,'CONFIRMED');
    if(confirmed.state==='CONFIRMED'){
      assert.equal(confirmed.code,'CONFIRMED');assert.equal(confirmed.cancellationState,'CANCELLED');assert.equal(confirmed.eventXml,official);
      assert.equal(confirmed.signedEventXml,original);assert.deepEqual(confirmed.payloadEvidence,{
        reasonEncoding:'SEFIN_UTF8_AS_LATIN1',literalPayloadMatches:false,representationMatches:true});
    }
    for(const changed of [original.replace(reason,encoded('Outra operação sintética.')),
      original.replace(reason,encoded(encoded(reason))),officialRequest.replace('<cMotivo>1','<cMotivo>2')]){
      responseXml=syntheticProductionEvent(changed,pilotAccessKey,'101101',credential);
      assert.equal((await executor.reconcile(prepared)).state,'AWAITING_CONFIRMATION');
    }
    assert.equal(prepared.signedEventXml,original);assert.equal(prepared.input.reason,reason);
    assert.deepEqual(calls,['GET','GET','GET','GET']);
  });
});
