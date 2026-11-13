import assert from "node:assert/strict";
import { processServiceCancellation } from "./cancellation.ts";
import { processNextServiceBankJob } from "./dispatcher.ts";
import { type CancellationMaterial } from "./cancellation-contract.ts";
import { mapBaneseFinancialTermsToPayload, normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { BANESE_DOCUMENT_FIXTURE as bank } from "../banese/internal/testing/document-fixture.ts";
import { adminForBaneseReservation, makeBaneseTitleResponse } from "../banese/core/adapter-test-fixtures.ts";
import { BaneseCancellationRequiresReviewError } from "../banese/core/adapter/types.ts";
const id=(n:number)=>`22222222-2222-4222-8222-${String(n).padStart(12,"0")}`;
const fixture=(action:CancellationMaterial["action"]="CANCEL_BANK")=>{
  const job={jobId:id(1),leaseToken:id(2),receivableId:bank.receivableId};
  const calls:Array<{name:string;args?:Record<string,unknown>}>=[];
  const material={...job,action,cancelIntent:action==="OBSERVE_BANK",bankActorId:id(3),
    receivable:{id:bank.receivableId,cliente_id:id(4),polo_id:id(5),categoria:"OUTROS_CREDITOS",tipo_lancamento:"OUTRO_CREDITO",
      status:action==="PRESERVE_PAID"?"PAGO":"PENDENTE",valor:bank.amount,data_vencimento:bank.dueDate,
      gateway_provider:"banese_card",gateway_environment:"production",gateway_payment_method:"BOLETO",gateway_submission_status:"API_REGISTERED",
      gateway_issuer_polo_id:id(6),
      gateway_boleto_nosso_numero:bank.ourNumber,gateway_boleto_convenio:bank.beneficiary.agreement,
      gateway_boleto_agencia:bank.beneficiary.agency,gateway_financial_terms:normalizeBaneseFinancialTerms(bank.financialTerms!),
      updated_at:"2026-11-12T23:00:00Z"},payer:{id:id(4),cpf_cnpj:bank.payer.document},
    metadata:{baneseAgencia:bank.beneficiary.agency,baneseConta:bank.beneficiary.account,baneseBoletoConvenio:bank.beneficiary.agreement}};
  const auth=adminForBaneseReservation(true);
  let beginAllowed=true,claim:unknown=job;
  const admin={rpc:async(name:string,args?:Record<string,unknown>)=>{
    calls.push({name,args});
    if(name==="claim_nfse_service_cancellation_job_internal")return {data:claim,error:null};
    if(name==="get_nfse_service_cancellation_material_internal")return {data:material,error:null};
    if(name==="begin_nfse_service_cancellation_bank_internal"){
      if(beginAllowed){material.cancelIntent=true;return {data:{started:true},error:null};}
      return {data:null,error:{code:"40001",message:"Lease changed"}};
    }
    if(name==="complete_nfse_service_cancellation_job_internal")return {data:{completed:true,receivableId:job.receivableId},error:null};
    if(name==="fail_nfse_service_cancellation_job_internal")return {data:null,error:null};
    return auth.rpc(name);
  }};
  const snapshot=(situationCode=2,paid=false)=>({convenio:bank.beneficiary.agreement,nossoNumero:bank.ourNumber,situationCode,
    remoteStatus:paid?"PAID":situationCode===5?"CANCELED":"PENDING",paid,
    payments:paid?[{ValorPago:bank.amount,DataPagamento:bank.dueDate}]:[],paymentsError:null,financialTermsError:null,
    financialTerms:normalizeBaneseFinancialTerms(bank.financialTerms!),pixPayload:null,pixEncodedImage:null,
    raw:{NumeroLinhaDigitavel:bank.digitableLine,NumeroCodigoBarras:bank.barcode,pixDiagnostic:{}}});
  return {admin,job,calls,material,snapshot,setBegin:(allowed:boolean)=>beginAllowed=allowed,setClaim:(value:unknown)=>claim=value};
};
const noBank=async()=>{throw new Error("No bank request allowed");};
Deno.test("local cancellation and paid preservation never create, cancel or query bank titles",async()=>{
  for(const action of ["LOCAL_CANCEL","PRESERVE_PAID"] as const){
    const f=fixture(action);
    const result=await processServiceCancellation(f.admin,{query:noBank,cancel:noBank,reconcile:noBank});
    assert.equal(result.result,action==="LOCAL_CANCEL"?"LOCAL_CANCELLED":"PAID");
    assert(!f.calls.some(call=>call.name==="begin_nfse_service_cancellation_bank_internal"));
    assert(!f.calls.some(call=>/claim_nfse_service_bolepix_job/.test(call.name)));
  }
});
Deno.test("confirmed bank cancellation carries exact identity, empty effective payments and terms before financial completion",async()=>{
  const f=fixture();let puts=0;
  const result=await processServiceCancellation(f.admin,{
    query:async(_admin,_environment,input)=>{assert.equal(input.strictEffectivePayments,true);assert.equal(input.expectedPayerDocument,bank.payer.document);return f.snapshot();},
    cancel:async(_admin,_environment,input)=>{
      assert.equal(input.expectedDigitableLine,bank.digitableLine);assert.equal(input.expectedBarcode,bank.barcode);
      await input.onMutationStart?.();puts++;
      return {convenio:bank.beneficiary.agreement,nossoNumero:bank.ourNumber,situationCode:5,remoteStatus:"CANCELED",
        alreadyCanceled:false,mutationAttempted:true,pixAvailable:false,pixPayload:null,pixEncodedImage:null,raw:f.snapshot(5).raw};
    },
  });
  assert.equal(result.result,"CANCELLED");assert.equal(puts,1);
  const complete=f.calls.find(call=>call.name==="complete_nfse_service_cancellation_job_internal")!.args!.p_result as any;
  assert.equal(complete.situationCode,5);assert.equal(complete.paymentsCount,0);
  assert.equal(complete.identityValidated,true);assert.equal(complete.strictEffectivePayments,true);assert.equal(complete.termsValidated,true);
  assert.equal(complete.bankSlipBarcode,bank.barcode);assert.match(complete.evidenceFingerprint,/^[a-f0-9]{64}$/);
  assert.equal(f.calls.findIndex(call=>call.name==="begin_nfse_service_cancellation_bank_internal")<f.calls.findIndex(call=>call.name==="complete_nfse_service_cancellation_job_internal"),true);
});
for(const reply of ["network ambiguity","accepted but still pending"] as const)
Deno.test(`${reply} PUT is followed automatically by GET-only until cancellation is officially confirmed`,async()=>{
  const f=fixture(),originalFetch=globalThis.fetch;let bankState=2,puts=0;
  globalThis.fetch=async(input,init)=>{
    const url=String(input),method=String(init?.method||"GET");
    if(url.includes("/autenticacao/"))return new Response(JSON.stringify({access_token:"synthetic",token_type:"Bearer"}),{status:200});
    if(url.endsWith("/baixa")){
      assert(f.material.cancelIntent);puts++;
      if(reply==="network ambiguity")throw new TypeError("fetch failed");
      return new Response('{}',{status:200});
    }
    if(url.endsWith("/pagamentos/efetivados"))return new Response('{"PagamentosEfetivados":[]}',{status:200});
    assert.equal(method,"GET");
    return new Response(JSON.stringify(makeBaneseTitleResponse(bank.amount,bank.dueDate,{
      CodigoSituacaoBoleto:bankState,Pagador:{TipoPessoa:"F",NumeroCPFCNPJ:Number(bank.payer.document)},
      ...mapBaneseFinancialTermsToPayload(normalizeBaneseFinancialTerms(bank.financialTerms!)),
    })),{status:200});
  };
  try{
    assert.equal((await processServiceCancellation(f.admin)).result,"RETRY");assert.equal(puts,1);
    f.material.action="OBSERVE_BANK";
    assert.equal((await processServiceCancellation(f.admin)).result,"RETRY");assert.equal(puts,1);
    bankState=5;
    assert.equal((await processServiceCancellation(f.admin)).result,"CANCELLED");assert.equal(puts,1);
    assert.equal(f.calls.filter(call=>call.name==="begin_nfse_service_cancellation_bank_internal").length,1);
  }finally{globalThis.fetch=originalFetch;}
});
Deno.test("paid bank title is reconciled canonically and never receives PUT; late payment wins cancellation",async()=>{
  const f=fixture();let reconciled=0;
  const result=await processServiceCancellation(f.admin,{query:async()=>f.snapshot(2,true),cancel:noBank,
    reconcile:async()=>{reconciled++;return {receivable:{status:"PAGO",updated_at:"2026-11-12T23:00:00Z"}} as any;}});
  assert.equal(result.result,"PAID");assert.equal(reconciled,1);
  assert(!f.calls.some(call=>call.name==="begin_nfse_service_cancellation_bank_internal"));
  const partial=fixture();
  assert.equal((await processServiceCancellation(partial.admin,{query:async()=>partial.snapshot(3,true),cancel:noBank,
    reconcile:async()=>({receivable:{status:"PENDENTE"}} as any)})).result,"REVIEW");
  assert(!partial.calls.some(call=>call.name==="complete_nfse_service_cancellation_job_internal"));
  const late=fixture();let reads=0;
  assert.equal((await processServiceCancellation(late.admin,{
    query:async()=>late.snapshot(++reads===1?2:3,reads>1),
    cancel:async()=>{throw new BaneseCancellationRequiresReviewError("O Banese já confirmou pagamento.");},
    reconcile:async()=>({receivable:{status:"PAGO"}} as any),
  })).result,"PAID");
  assert.equal(reads,2);assert(!late.calls.some(call=>call.name==="begin_nfse_service_cancellation_bank_internal"));
});
Deno.test("invalid identity, academic titles, stale mutation lease and incomplete payments fail before cancellation",async()=>{
  for(const change of [{matricula_id:id(7)},{categoria:"TECNICO"},{turma_id:id(7)}]){
    const f=fixture();Object.assign(f.material.receivable,change);
    assert.equal((await processServiceCancellation(f.admin,{query:noBank,cancel:noBank})).result,"REVIEW");
  }
  const denied=fixture();denied.setBegin(false);let puts=0;
  assert.equal((await processServiceCancellation(denied.admin,{query:async()=>denied.snapshot(),cancel:async(_a,_e,input)=>{
    await input.onMutationStart?.();puts++;throw new Error("PUT must not be reached");}})).result,"REVIEW");assert.equal(puts,0);
  const payments=fixture();
  assert.equal((await processServiceCancellation(payments.admin,{query:async()=>({...payments.snapshot(),paymentsError:new TypeError("fetch failed")}),cancel:noBank})).result,"RETRY");
  assert(!payments.calls.some(call=>call.name==="begin_nfse_service_cancellation_bank_internal"));
  const partial=fixture("LOCAL_CANCEL");Object.assign(partial.material.receivable,{payment_summary:{previouslyPaid:"20.00"}});
  assert.equal((await processServiceCancellation(partial.admin,{query:noBank,cancel:noBank})).result,"REVIEW");
  assert(!partial.calls.some(call=>call.name==="complete_nfse_service_cancellation_job_internal"));
});
Deno.test("fiscal cancellation is prioritized before any new issuance by the durable dispatcher",async()=>{
  const f=fixture("LOCAL_CANCEL");
  assert.equal((await processNextServiceBankJob(f.admin,"https://synthetic.supabase.co")).result,"LOCAL_CANCELLED");
  assert(!f.calls.some(call=>call.name==="claim_nfse_service_bolepix_job_internal"));
});
Deno.test("ambiguous issue still missing at the bank remains GET-only and never invents local cancellation",async()=>{
  const f=fixture();f.material.receivable.gateway_submission_status="API_AMBIGUOUS";
  const result=await processServiceCancellation(f.admin,{query:()=>Promise.reject(new Error("Banese recusou consulta (404)")),cancel:noBank});
  assert.equal(result.result,"RETRY");assert(!f.calls.some(call=>call.name==="complete_nfse_service_cancellation_job_internal"));
});
