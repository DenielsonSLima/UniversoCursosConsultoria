import { parseServiceFeeRequest, runApprovedRejectedFeeService, REJECTED_FEE_SERVICE_ACTION } from "./service-issuance.ts";
const assert=(v:unknown)=>{if(!v)throw new Error("assertion failed");};
const operationId="20000000-0000-4000-8000-000000086001",receivableId="20000000-0000-4000-8000-000000086002";
const matriculaId="20000000-0000-4000-8000-000000086003",requestId="20000000-0000-4000-8000-000000086004";
const leaseToken="20000000-0000-4000-8000-000000086005",manifestHash="a".repeat(64);
const body={action:REJECTED_FEE_SERVICE_ACTION,operationId,manifestHash};
Deno.test("service issuance request never accepts fee/user/date/token overrides",()=>{
 assert(parseServiceFeeRequest(body).operationId===operationId);
 for(const extra of [{receivableId},{userId:matriculaId},{dueDate:"2026-10-30"},{creationToken:requestId}]){
 let rejected=false;try{parseServiceFeeRequest({...body,...extra});}catch{rejected=true;}assert(rejected);
 }
});
Deno.test("service capability issues one fee; repeated claims are GET-only or completed readback",async()=>{
 for(const mode of ["first","recover","complete","foreign","failure","recover-failure","diagnostic-failure"]){
 const rpcCalls:string[]=[], bankCalls:string[]=[];
 const scope={matriculaId,turmaId:"turma",poloId:"polo",issuerPoloId:"issuer",credentialId:"credential",alunoId:"aluno"};
 const r={id:receivableId,matricula_id:matriculaId,turma_id:"turma",polo_id:"polo",gateway_issuer_polo_id:"issuer",
 valor:100,data_vencimento:"2026-10-30",tipo_lancamento:"REMATRICULA",gateway_creation_token:requestId};
 const admin={rpc:async(name:string,args:Record<string,unknown>)=>{
 rpcCalls.push(name);assert(args.p_operation_id===operationId&&args.p_manifest_hash===manifestHash);
 if(name.startsWith("claim_"))return{error:null,data:{operationId,manifestHash,receivableId,matriculaId,requestId,leaseToken,recoveryOnly:mode!=="first"&&mode!=="failure"&&mode!=="diagnostic-failure",completed:mode==="complete"}};
 if(name.startsWith("persist_")){assert(args.p_lease_token===leaseToken);return{error:null,data:{success:true}};}
 if(name.startsWith("fail_")&&mode==="diagnostic-failure")throw new Error("SECRET_SENTINEL_DIAGNOSTIC");
 return {error:null,data:{}};
 }};
 const result={providerCode:"banese_card"};
 const deps={scope:async()=>scope,load:async()=>({receivable:{...r,valor:mode==="foreign"?101:100},payer:{},transactions:[]}),
 create:async(input:Record<string,unknown>)=>{bankCalls.push("POST");assert(input.receivable===undefined|| (input.receivable as Record<string,unknown>).id===receivableId);if(mode==="failure"||mode==="diagnostic-failure")throw new Error("PII_SENTINEL_PROVIDER_SECRET");return result;},
 recover:async()=>{bankCalls.push("GET");if(mode==="recover-failure")throw new Error("PII_SENTINEL_GET_SECRET");return result;},terms:async()=>({}),validate:(v:unknown)=>v,issued:()=>true};
 let failed=false;try{await runApprovedRejectedFeeService(admin as never,"https://synthetic.invalid",body,deps as never);}catch(error){failed=true;assert(error instanceof Error&&error.message==="REJECTED_FEE_SERVICE_REQUIRES_EXACT_GET");assert(!("cause" in error));}
 assert(failed===(mode==="foreign"||mode.endsWith("failure")));
 assert(bankCalls.join()===(mode==="first"?"POST,GET":mode==="failure"||mode==="diagnostic-failure"?"POST":mode==="recover"||mode==="recover-failure"?"GET":""));
 if(failed)assert(rpcCalls.at(-1)==="fail_rejected_fee_service_issuance");
 else if(mode!=="complete")assert(rpcCalls.at(-1)==="persist_rejected_fee_service_issuance");
 }
});
