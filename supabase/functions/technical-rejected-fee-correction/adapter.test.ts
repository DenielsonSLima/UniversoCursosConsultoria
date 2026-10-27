import assert from "node:assert/strict";
import {createBaneseBoletoCharge} from "../banese/core/adapter/boleto.ts";
import {makeBaneseTitleResponse,reservedBoletoInput} from "../banese/core/adapter-test-fixtures.ts";
import {BANESE_DOCUMENT_FIXTURE as fixture} from "../banese/internal/testing/document-fixture.ts";
import {buildBanesePixPayloadFixture} from "../banese/internal/testing/pix-fixture.ts";
const policy={required:true,allowNewPost:true,environment:"production",convenio:fixture.beneficiary.agreement,nossoNumero:fixture.ourNumber};
const base=reservedBoletoInput(true,true,true);
const official={Erros:[{CodigoErroProcessamento:"ERRO_BOLETO_NAO_ENCONTRADO"}]};
const match=()=>makeBaneseTitleResponse(fixture.amount,fixture.dueDate,{QrCode:buildBanesePixPayloadFixture("REJECTED-FEE-MOCK",fixture.amount)});
const inputFor=(calls:string[],allowNewPost=true)=>({...base,environment:"production" as const,
 receivable:{...base.receivable,regra_financeira_tecnica_snapshot:{versao:2,cicloManual:{synthetic:true}}},
 admin:{rpc:async(fn:string,args?:Record<string,unknown>)=>{calls.push(fn);
 if(fn==="rejected_fee_bank_policy_service")return {data:{...policy,allowNewPost},error:null};return base.admin.rpc(fn);}}});
Deno.test("POST response lost -> next exact GET MATCH restores BolePix, strict payments empty, zero second POST",async()=>{
 const previous=globalThis.fetch,calls:string[]=[],methods:string[]=[];let remoteExists=false;
 globalThis.fetch=async(url,init)=>{const endpoint=String(url),method=String(init?.method||"GET");
 if(endpoint.includes("/autenticacao/"))return new Response(JSON.stringify({access_token:"synthetic",token_type:"Bearer"}));
 methods.push(method);
 if(endpoint.endsWith("/pagamentos/efetivados"))return new Response(JSON.stringify({PagamentosEfetivados:[]}));
 if(method==="POST"){remoteExists=true;throw new Error("synthetic response lost");}
 return remoteExists?new Response(JSON.stringify(match())):new Response(JSON.stringify(official),{status:404});};
 try {const input=inputFor(calls);await assert.rejects(()=>createBaneseBoletoCharge(input));
 const result=await createBaneseBoletoCharge(inputFor(calls,false));assert.equal(result.bankSlipOurNumber,fixture.ourNumber);
 assert.equal(methods.filter(m=>m==="POST").length,1);assert.equal(methods.includes("PUT"),false);
 assert.equal(calls.filter(n=>n==="claim_banese_api_submission_attempt").length,1);
 assert.equal(calls.some(n=>n.includes("advance")),false);
 }finally{globalThis.fetch=previous;}
});
for(const mode of ["generic404","foreign","unknown","payment","payment404","transient","expiredAbsent"])Deno.test(`correction ${mode}: no POST, PUT, or NN advance`,async()=>{
 const previous=globalThis.fetch,calls:string[]=[],methods:string[]=[];
 globalThis.fetch=async(url,init)=>{const endpoint=String(url),method=String(init?.method||"GET");
 if(endpoint.includes("/autenticacao/"))return new Response(JSON.stringify({access_token:"synthetic",token_type:"Bearer"}));
 methods.push(method);
 if(endpoint.endsWith("/pagamentos/efetivados"))return mode==="payment404"?new Response("{}",{status:404}):new Response(JSON.stringify({PagamentosEfetivados:[{Valor:1}]}));
 if(mode==="expiredAbsent")return new Response(JSON.stringify(official),{status:404});
 if(mode==="generic404")return new Response("{}",{status:404});
 if(mode==="transient")return new Response(JSON.stringify(official),{status:500});
 if(mode==="foreign")return new Response(JSON.stringify({...match(),IdTituloEmpresa:"OTHER",NumeroDocumento:"OTHER",Pagador:{NumeroCPFCNPJ:"98765432100"}}));
 if(mode==="unknown")return new Response("{}");
 return new Response(JSON.stringify(match()));};
 try {await assert.rejects(()=>createBaneseBoletoCharge(inputFor(calls,mode!=="expiredAbsent")));
 assert.equal(methods.some(m=>m!=="GET"),false);assert.equal(calls.some(n=>n.includes("advance")||n.includes("claim_banese")),false);
 }finally{globalThis.fetch=previous;}
});
