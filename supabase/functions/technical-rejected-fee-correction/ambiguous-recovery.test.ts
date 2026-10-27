import assert from "node:assert/strict";
import {createReceivableIssuer} from "../technical-manual-cycle-issuance/receivable-issuance.ts";
import type {ManualCycleContext} from "../technical-manual-cycle-issuance/contract.ts";
import {makeBaneseTitleResponse,validInput} from "../banese/core/adapter-test-fixtures.ts";
import {BANESE_DOCUMENT_FIXTURE as fixture} from "../banese/internal/testing/document-fixture.ts";
import {buildBanesePixPayloadFixture} from "../banese/internal/testing/pix-fixture.ts";
const uuid=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
Deno.test("user resume after due date: authorize real route boundary -> API_AMBIGUOUS -> strict exact GET -> persist, never creation policy/POST",async()=>{
 const previous=globalThis.fetch,request=uuid(3),cycle=uuid(4),enrollment=uuid(5),turma=uuid(6),polo=uuid(7);
 const due="2026-10-30",calls:string[]=[],methods:string[]=[];
 const terms={nominalAmount:fixture.amount,dueDate:due,discount:null,interest:null,penalty:null};
 const row={id:fixture.receivableId,matricula_id:enrollment,turma_id:turma,polo_id:polo,cliente_id:uuid(8),
 valor:fixture.amount,data_vencimento:due,status:"PENDENTE",gateway_provider:"banese_card",gateway_environment:"production",
 gateway_payment_method:"BOLETO",forma_pagamento:"BOLETO",gateway_status:"CREATING",gateway_submission_channel:"API",
 gateway_submission_status:"API_AMBIGUOUS",gateway_creation_token:request,gateway_boleto_nosso_numero:fixture.ourNumber,
 gateway_boleto_convenio:fixture.beneficiary.agreement,gateway_boleto_agencia:fixture.beneficiary.agency,
 gateway_issuer_polo_id:polo,gateway_financial_terms:terms,regra_financeira_tecnica_snapshot:{versao:2,cicloManual:{requestId:cycle}}};
 const admin={from:(table:string)=>{const data=table==="contas_receber"?row:table==="payment_gateway_transactions"?[]:
 table==="parceiros"?{nome:"SYNTHETIC",cpf_cnpj:validInput.payer.document}:table==="payment_gateway_credentials"?
 {metadata:{baneseBoletoConvenio:fixture.beneficiary.agreement,baneseAgencia:fixture.beneficiary.agency,baneseConta:fixture.beneficiary.account}}:null;
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data,error:null}),then:(fn:(x:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(fn)};return q;},
 rpc:async(name:string)=>{calls.push(name);
 if(name==="resolve_rejected_fee_request_service")return {data:{required:true,receivableId:row.id,cycleRequestId:cycle,requestId:request,requiresManagerConsent:true},error:null};
 if(name==="claim_technical_manual_cycle_banese_reconciliation")return {data:{claimed:true},error:null};
 if(name==="payment_gateway_get_secret")return {data:"synthetic",error:null};
 if(name==="persist_technical_manual_cycle_banese_issuance")return {data:{success:true,status:"EMITIDO",receivableId:row.id},error:null};
 throw new Error(`Unexpected RPC ${name}`);}};
 const user={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push(name);assert.equal(name,"authorize_technical_manual_receivable_issuance_secure");assert.equal(args.p_request_id,request);return {data:{authorized:true},error:null};}};
 const realDate=globalThis.Date;
 class AfterDueDate extends realDate {constructor(value?:string|number){super(value??"2026-10-31T12:00:00Z");}static now(){return realDate.parse("2026-10-31T12:00:00Z");}}
 globalThis.Date=AfterDueDate as DateConstructor;
 globalThis.fetch=async(url,init)=>{const endpoint=String(url),method=String(init?.method||"GET");
 if(endpoint.includes("/autenticacao/"))return new Response(JSON.stringify({access_token:"synthetic",token_type:"Bearer"}));
 methods.push(method);if(endpoint.endsWith("/pagamentos/efetivados"))return new Response(JSON.stringify({PagamentosEfetivados:[]}));
 return new Response(JSON.stringify(makeBaneseTitleResponse(fixture.amount,due,{QrCode:buildBanesePixPayloadFixture("RESUME-AFTER-DUE",fixture.amount)})));};
 try {const issue=createReceivableIssuer({admin:admin as never,userClient:user as never,supabaseUrl:"https://example.invalid",getScope:()=>({matriculaId:enrollment,turmaId:turma,poloId:polo,alunoId:uuid(8),issuerPoloId:polo,credentialId:uuid(9)})});
 await issue({requestId:cycle,ciclo:{recebiveis:[{id:row.id,tipo:"REMATRICULA",destinoCobranca:"BANESE",emissaoBanese:"PENDENTE"}]}} as ManualCycleContext,row.id);
 assert.deepEqual(methods,["GET","GET"]);assert.equal(calls.includes("persist_technical_manual_cycle_banese_issuance"),true);
 assert.equal(calls.some(n=>n==="rejected_fee_bank_policy_service"||n==="claim_banese_api_submission_attempt"),false);
 }finally{globalThis.Date=realDate;globalThis.fetch=previous;}
});
