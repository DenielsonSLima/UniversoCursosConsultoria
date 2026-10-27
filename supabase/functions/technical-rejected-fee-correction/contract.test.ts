import { assertOfficialAbsence, parseInspectionRequest } from "./contract.ts";
import { enforceRejectedFeePreflight } from "./bank-policy.ts";
import { runRejectedFeeAbsenceInspection } from "./worker-action.ts";
import { resolveRejectedFeeRequest } from "./issuance-request.ts";
const assert = (value: unknown, message = "assertion failed") => { if (!value) throw new Error(message); };
const rejects = async (fn: () => unknown | Promise<unknown>) => { let failed=false; try { await fn(); } catch { failed=true; } assert(failed); };
const operationId="20000000-0000-4000-8000-000000096001", leaseToken="20000000-0000-4000-8000-000000096002";
const receivableId="20000000-0000-4000-8000-000000096003",cycleRequestId="20000000-0000-4000-8000-000000096004";
const manifestHash="a".repeat(64), official={Erros:[{CodigoErroProcessamento:"ERRO_BOLETO_NAO_ENCONTRADO"}]};
Deno.test("strict official absence excludes generic404/multiple/200/400/body supplied scope",async()=>{
 assertOfficialAbsence(404,official);
 for(const [status,body] of [[404,{}],[200,official],[400,official],[404,{Erros:[...official.Erros,...official.Erros]}]])
 await rejects(()=>assertOfficialAbsence(Number(status),body));
 await rejects(()=>parseInspectionRequest({action:"inspect_rejected_fee_absence",operationId,manifestHash,convenio:"123"}));
});
Deno.test("authenticated worker performs exactly one GET, no financial mutation or fallthrough; failure never commits absence",async()=>{
 for(const status of [404,200,500]) {
 const calls:string[]=[],methods:string[]=[];
 const admin={rpc:async(name:string)=>{calls.push(name);return {error:null,data:name.startsWith("claim_")?
 {operationId,manifestHash,receivableId,leaseToken,environment:"production",convenio:"12345",nossoNumero:"000099001"}:{confirmed:true}};}};
 const deps={token:async()=>({accessToken:"synthetic-test",tokenType:"Bearer",expiresIn:null,scope:null,raw:{}}),
 fetch:async(url:RequestInfo|URL,init?:RequestInit)=>{methods.push(String(init?.method));assert(String(url).endsWith("/convenios/12345/boletos/000099001"));return new Response(JSON.stringify(official),{status});}};
 const run=()=>runRejectedFeeAbsenceInspection(admin,{action:"inspect_rejected_fee_absence",operationId,manifestHash},deps);
 if(status===404){const result=await run();assert(result.issued===false&&result.financiallyChanged===false);assert(calls.length===2);}
 else {await rejects(run);assert(calls.length===1);}
 assert(methods.join()==="GET");
 }
});
Deno.test("fresh preflight permits only exact reserved identity; positive response goes to strict matching recovery, never number advance",async()=>{
 const p={allowNewPost:true,environment:"production",convenio:"12345",nossoNumero:"000099001"};
 enforceRejectedFeePreflight(p,p,404,official);enforceRejectedFeePreflight(p,p,200,{existing:true});
 await rejects(()=>enforceRejectedFeePreflight(p,p,404,{}));
 await rejects(()=>enforceRejectedFeePreflight(p,{...p,nossoNumero:"000099002"},200,{}));
});
Deno.test("per-item new request is backend-bound, replay-stable, internal recovery cannot forge user consent",async()=>{
 const input={receivableId,cycleRequestId,defaultRequestId:leaseToken,internalRecovery:false};
 const admin={rpc:async()=>({error:null,data:{required:true,receivableId,cycleRequestId,requiresManagerConsent:true,requestId:operationId}})};
 assert(await resolveRejectedFeeRequest(admin,input)===operationId);
 assert(await resolveRejectedFeeRequest(admin,input)===operationId);
 await rejects(()=>resolveRejectedFeeRequest(admin,{...input,internalRecovery:true}));
 await rejects(()=>resolveRejectedFeeRequest(admin,{...input,cycleRequestId:leaseToken}));
});
Deno.test("inspection diagnostic retains HTTP and bounded codes only; rejected responses never commit proof",async()=>{
 for(const status of [200,400,404]) {
 for(const topLevel of [false,true]) {
 const calls:string[]=[];
 const admin={rpc:async(name:string)=>{calls.push(name);return {error:null,data:{operationId,manifestHash,receivableId,leaseToken,environment:"production",convenio:"12345",nossoNumero:"000099001"}};}};
 const raw={Erros:[{CodigoErroProcessamento:"ERRO_OUTRO",DescricaoErroProcessamento:"PRIVATE_PAYER_ADDRESS"},
 {CodigoErroProcessamento:"12345678901"},{CodigoErroProcessamento:"UNSAFE code@email.invalid"},{CodigoErroProcessamento:"FOURTH_HIDDEN"}],Pagador:{Nome:"PRIVATE_PAYER_NAME"}};
 const responseBody=topLevel?{Codigo:"ERRO_BOLETO_NAO_ENCONTRADO",code:"12345678901",Descricao:"ERRO_TESTE",Pagador:{Nome:"PRIVATE_PAYER_NAME"}}:raw;
 const deps={token:async()=>({accessToken:"synthetic-test",tokenType:"Bearer",expiresIn:null,scope:null,raw:{}}),
 fetch:async()=>new Response(JSON.stringify(responseBody),{status})};
 let message="";
 try{await runRejectedFeeAbsenceInspection(admin,{action:"inspect_rejected_fee_absence",operationId,manifestHash},deps);}catch(error){message=(error as Error).message;}
 assert(message===`REJECTED_FEE_EXACT_OFFICIAL_ABSENCE_NOT_CONFIRMED HTTP_${status} ${topLevel?"CODES_ERRO_BOLETO_NAO_ENCONTRADO_REDACTED DESCRIPTION_ERRO_TESTE":"CODES_ERRO_OUTRO_REDACTED_REDACTED DESCRIPTION_REDACTED"}`);
 assert(calls.join()==="claim_rejected_fee_absence_service");
 }
 }
});
