import { runServiceFeeReplacement, replacementDependencies, REPLACEMENT_ACTION } from './worker.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const terms={nominalAmount:100,dueDate:'2026-10-30',discount:null,penalty:null,interest:null};
const request={action:REPLACEMENT_ACTION,operationId:id(1),manifestHash:'a'.repeat(64)};
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m);};
type Scenario={pixBefore?:boolean;cancelFails?:boolean;retry?:boolean;stored?:boolean;paid?:boolean;postFails?:boolean;pixPending?:boolean};

const setup=(scenario:Scenario={})=>{
 const calls:string[]=[];
 let currentNumber=scenario.retry?'000099002':'000099001';
 const result=()=>({providerCode:'banese_card',remotePaymentId:currentNumber,bankSlipOurNumber:currentNumber,
  remotePaymentLinkId:null,remoteCustomerId:null,remoteStatus:'PENDING',issuerPoloId:id(6),financialTerms:terms,
  bankSlipDigitableLine:'1'.repeat(47),bankSlipBarcode:'1'.repeat(44),pixPayload:'official-post-pix',pixEncodedImage:'official-post-image',
  invoiceUrl:null,bankSlipUrl:null,rawPayload:{request:{synthetic:true},response:{synthetic:true}}});
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  calls.push(name);
  if(name==='claim_service_fee_replacement_service') return {data:{
   completed:false,leaseToken:id(2),receivableId:id(3),matriculaId:id(4),requestId:id(5),
   recoveryOnly:scenario.retry===true,state:scenario.retry?'ISSUING':'APPROVED',oldNumber:'000099001',
   officialResult:scenario.stored?result():null,
  },error:null};
  if(name==='confirm_service_fee_canceled_service') {
   assert((args.p_evidence as Record<string,unknown>).situationCode===5,'Canceled proof');
   currentNumber=''; return {data:{ready:true,newPostAllowed:true},error:null};
  }
  if(name==='persist_rejected_fee_service_issuance') {
   const saved=args.p_result as Record<string,unknown>;
   assert(saved.pixPayload==='official-post-pix','Preserve official POST Pix when GET omits it');
   return {data:{success:true},error:null};
  }
  return {data:{intent:true,stored:true,completed:true},error:null};
 };
 const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:{metadata:{}},error:null})};
 const admin={rpc,from:()=>chain} as unknown as SupabaseClient;
 const deps={
  scope:async()=>({matriculaId:id(4),turmaId:id(7),poloId:id(8),issuerPoloId:id(6),credentialId:id(9)}),
  load:async()=>({receivable:{id:id(3),matricula_id:id(4),turma_id:id(7),polo_id:id(8),gateway_issuer_polo_id:id(6),
   gateway_creation_token:id(5),tipo_lancamento:'REMATRICULA',valor:100,data_vencimento:'2026-10-30',
   gateway_boleto_nosso_numero:currentNumber,gateway_boleto_convenio:'12345',gateway_boleto_agencia:'033',gateway_financial_terms:terms},
   payer:{},transactions:[]}),
  cancel:async(_a:unknown,_e:unknown,input:{onMutationStart:()=>Promise<void>})=>{
   calls.push('GET_OLD');
   if(scenario.cancelFails) throw new Error('Payment or identity changed');
   if(!scenario.pixBefore) {await input.onMutationStart();calls.push('PUT_CANCEL');}
   return {situationCode:scenario.pixBefore?2:5,remoteStatus:scenario.pixBefore?'PENDING':'CANCELED',
    nossoNumero:'000099001',convenio:'12345',pixAvailable:scenario.pixBefore,
    pixPayload:scenario.pixBefore?'official-post-pix':null,pixEncodedImage:scenario.pixBefore?'official-post-image':null,
    raw:{},alreadyCanceled:false,mutationAttempted:!scenario.pixBefore};
  },
  reserve:async()=>{calls.push('RESERVE_NEW');currentNumber='000099002';return {nossoNumero:currentNumber,recoveryPending:false};},
  create:async()=>{calls.push('POST_NEW');if(scenario.postFails)throw new Error('Response lost');return result();},
  query:async()=>{calls.push('GET_NEW');return {paid:scenario.paid,payments:[],paymentsError:null,financialTermsError:null,
   financialTerms:terms,situationCode:2,remoteStatus:'PENDING',pixPayload:scenario.pixPending?null:null,pixEncodedImage:null,raw:{}};},
  terms:async()=>terms,validate:(r:unknown)=>r,
 } as unknown as typeof replacementDependencies;
 return {calls,run:()=>runServiceFeeReplacement(admin,'https://example.invalid',request,deps)};
};

Deno.test('Pix recovered before cancel prevents PUT and POST',async()=>{
 const s=setup({pixBefore:true});assert((await s.run()).completed,'Recovered');
 assert(!s.calls.includes('PUT_CANCEL')&&!s.calls.includes('POST_NEW'),'No replacement when Pix exists');
});
Deno.test('one replacement requires canceled proof, fresh reservation, then stores POST before persistence',async()=>{
 const s=setup();assert((await s.run()).completed,'Completed');
 assert(s.calls.filter(x=>x==='POST_NEW').length===1,'One POST');
 assert(s.calls.indexOf('PUT_CANCEL')<s.calls.indexOf('confirm_service_fee_canceled_service'),'Confirm after cancellation');
 assert(s.calls.indexOf('confirm_service_fee_canceled_service')<s.calls.indexOf('POST_NEW'),'No POST before proof');
 assert(s.calls.indexOf('stage_service_fee_replacement_result_service')<s.calls.indexOf('persist_rejected_fee_service_issuance'),'Stage original POST');
 assert(!s.calls.includes('GET_NEW'),'A later empty GET cannot discard the POST Pix');
});
Deno.test('payment or identity conflict before cancellation stops all replacement mutations',async()=>{
 const s=setup({cancelFails:true});try{await s.run();}catch{ /* expected */ }
 assert(!s.calls.includes('PUT_CANCEL')&&!s.calls.includes('POST_NEW')&&!s.calls.includes('RESERVE_NEW'),'No mutation');
});
Deno.test('retry uses exact GET and stored official POST Pix when query omits Pix',async()=>{
 const s=setup({retry:true,stored:true});assert((await s.run()).completed,'Recovered stored official result');
 assert(s.calls.includes('GET_NEW')&&!s.calls.includes('POST_NEW')&&!s.calls.includes('PUT_CANCEL'),'GET only');
});
Deno.test('response loss after POST leaves GET-only review without another POST',async()=>{
 const s=setup({postFails:true});try{await s.run();}catch{ /* expected */ }
 assert(s.calls.filter(x=>x==='POST_NEW').length===1&&!s.calls.includes('persist_rejected_fee_service_issuance'),'Preserve ambiguous attempt');
 const retry=setup({retry:true});try{await retry.run();}catch{ /* no Pix yet */ }
 assert(!retry.calls.includes('POST_NEW')&&retry.calls.includes('GET_NEW'),'Never recreate ambiguous title');
});
Deno.test('payment seen during GET retry blocks persistence and replacement',async()=>{
 const s=setup({retry:true,stored:true,paid:true});try{await s.run();}catch{ /* expected */ }
 assert(!s.calls.includes('POST_NEW')&&!s.calls.includes('persist_rejected_fee_service_issuance'),'Do not overwrite a payment');
});
