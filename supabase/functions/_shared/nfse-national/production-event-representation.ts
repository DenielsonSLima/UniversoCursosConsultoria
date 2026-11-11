import {Buffer} from 'node:buffer';
import {nationalFiscalChild,nationalFiscalSemantic,parseNationalFiscalXml} from './pilot-response.ts';
import type {ProductionEventPayloadEvidence} from './production.types.ts';
type Element=ReturnType<typeof parseNationalFiscalXml>['documentElement'];
/** One observed SEFIN1.6.0 representation defect, exclusively e101101/xMotivo.
 * The caller has already validated schema/EVT/key/PRE/environment/sequence.
 * No original DOM/XML/request is mutated and no general semantic rule changes. */
export function matchProductionCancellationReasonRepresentation(
  sent:Element,registered:Element,inputReason:string,eventCode:string,
):ProductionEventPayloadEvidence|undefined{
  if(eventCode!=='101101')return undefined;
  try{
    const a=nationalFiscalChild(nationalFiscalChild(sent,'e101101'),'xMotivo');
    const b=nationalFiscalChild(nationalFiscalChild(registered,'e101101'),'xMotivo');
    const sentReason=a.textContent||'',registeredReason=b.textContent||'';
    if(sentReason!==inputReason||sentReason===registeredReason||sentReason.length>255||registeredReason.length>255
      ||/[\u0100-\uffff]/.test(sentReason)||/[\u0100-\uffff]/.test(registeredReason))return undefined;
    if(Buffer.from(sentReason,'utf8').toString('latin1')!==registeredReason
      ||Buffer.from(registeredReason,'latin1').toString('utf8')!==sentReason)return undefined;
    const comparison=registered.cloneNode(true) as Element;
    nationalFiscalChild(nationalFiscalChild(comparison,'e101101'),'xMotivo').textContent=sentReason;
    if(nationalFiscalSemantic(sent)!==nationalFiscalSemantic(comparison))return undefined;
    return {reasonEncoding:'SEFIN_UTF8_AS_LATIN1',literalPayloadMatches:false,representationMatches:true};
  }catch{return undefined;}
}
