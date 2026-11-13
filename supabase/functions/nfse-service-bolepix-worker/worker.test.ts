import assert from "node:assert/strict";
import { BANESE_DOCUMENT_FIXTURE as bank } from "../banese/internal/testing/document-fixture.ts";
import { buildBanesePixImageFixture, buildBanesePixPayloadFixture } from "../banese/internal/testing/pix-fixture.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import type { GatewayChargeResult } from "../gateways/router.ts";
import { processServiceBolepix } from "./worker.ts";
import { handleServiceBolepixRequest } from "./handler.ts";
import type { Material } from "./contract.ts";
import { retainBaneseCreationEvidence } from "../banese/core/adapter/creation-evidence.ts";
import { recoverServiceBolepix } from "./bank.ts";

const id = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12,"0")}`;
const job = { jobId:id(1),leaseToken:id(2),receivableId:bank.receivableId };
const fixture = (action: "CREATE" | "GET" = "CREATE") => {
  const calls: Array<{name:string;args?:Record<string,unknown>}> = [];
  const material: Material = { ...job,action,credentialId:id(3),fiscalNumber:"999",fiscalDescription:"Descrição fiscal autorizada",
    payer:{ id:id(4),nome:"Pessoa sintética" },metadata:{},receivable:{ id:bank.receivableId,cliente_id:id(4),polo_id:id(5),
      categoria:"OUTROS_CREDITOS",tipo_lancamento:"OUTRO_CREDITO",valor:bank.amount,data_vencimento:bank.dueDate,
      descricao:"Descrição fiscal autorizada · NFS-e 999 · Parcela 1/1",gateway_issuer_polo_id:id(6),
      gateway_creation_token:job.leaseToken,
      gateway_financial_terms:normalizeBaneseFinancialTerms(bank.financialTerms!),gateway_boleto_nosso_numero:bank.ourNumber } };
  const result: GatewayChargeResult = { providerCode:"banese_card",remotePaymentId:bank.ourNumber,remotePaymentLinkId:null,
    remoteCustomerId:null,remoteStatus:"PENDING",invoiceUrl:null,bankSlipUrl:null,
    bankSlipOurNumber:bank.ourNumber,bankSlipDigitableLine:bank.digitableLine,bankSlipBarcode:bank.barcode,
    pixPayload:buildBanesePixPayloadFixture("SERVICEFIXTURE",bank.amount),pixEncodedImage:buildBanesePixImageFixture(1),
    issuerPoloId:id(6),financialTerms:normalizeBaneseFinancialTerms(bank.financialTerms!),rawPayload:{response:{fixture:true}} };
  let claimed: unknown = job,materialError: unknown=null;
  const admin={ rpc:async(name:string,args?:Record<string,unknown>)=>{
    calls.push({name,args});
    if(name==="claim_nfse_service_bolepix_job_internal")return {data:claimed,error:null};
    if(name==="get_nfse_service_bolepix_material_internal")return {data:material,error:materialError};
    if(name==="complete_nfse_service_bolepix_job_internal")return {data:{persisted:true,complete:Boolean((args?.p_result as GatewayChargeResult)?.pixPayload)
      && (args?.p_result as GatewayChargeResult)?.remoteStatus==="PENDING",receivableId:job.receivableId},error:null};
    if(name==="fail_nfse_service_bolepix_job_internal")return {data:null,error:null};
    if(name==="preserve_nfse_service_bolepix_creation_internal")return {data:null,error:null};
    throw new Error("Unexpected RPC");
  }};
  return {admin,calls,material,result,setClaim:(value:unknown)=>claimed=value,setMaterialError:(value:unknown)=>materialError=value};
};

Deno.test("durable first issue uses exact fiscal description and a single canonical POST branch",async()=>{
  const f=fixture();let issued=0;
  assert.deepEqual(await processServiceBolepix(f.admin,"https://synthetic.supabase.co",{
    create:async(_admin,_url,material)=>{issued++;assert.equal(material.receivable.descricao,f.material.receivable.descricao);return f.result;},
    recover:()=>{throw new Error("Unexpected GET");},
  }),{handled:true,result:"DONE"});
  assert.equal(issued,1);
  const persisted=f.calls.find(call=>call.name==="complete_nfse_service_bolepix_job_internal")!;
  assert.equal((persisted.args!.p_result as GatewayChargeResult).pixPayload,f.result.pixPayload);
});
Deno.test("ambiguous and registered retries are GET-only even across repeated worker invocations",async()=>{
  const f=fixture("GET");let gets=0;
  const dependencies={create:()=>{throw new Error("A second POST is forbidden");},recover:async()=>{gets++;return f.result;}};
  await processServiceBolepix(f.admin,"https://synthetic.supabase.co",dependencies);
  await processServiceBolepix(f.admin,"https://synthetic.supabase.co",dependencies);
  assert.equal(gets,2);
});
Deno.test("accepted POST whose confirmation fails preserves private evidence before GET-only recovery",async()=>{
  const first=fixture(),error=new TypeError("fetch failed");let posts=0,preserves=0;
  const admin={rpc:async(name:string,args?:Record<string,unknown>)=>{
    if(name==="preserve_nfse_service_bolepix_creation_internal"&&++preserves===1)return {data:null,error:{code:"55P03",message:"cancellation row is locked"}};
    return await first.admin.rpc(name,args);
  }};
  retainBaneseCreationEvidence(error,{request:{NossoNumero:bank.ourNumber},creationResponse:{Id:"accepted-post"},
    pixPayload:first.result.pixPayload,pixEncodedImage:first.result.pixEncodedImage});
  assert.equal((await processServiceBolepix(admin,"https://synthetic.supabase.co",{
    create:()=>{posts++;return Promise.reject(error);},
  })).result,"RETRY");
  assert.deepEqual(first.calls.slice(-2).map(call=>call.name),[
    "preserve_nfse_service_bolepix_creation_internal","fail_nfse_service_bolepix_job_internal"]);
  assert.equal((first.calls.at(-2)!.args?.p_evidence as any).creationResponse.Id,"accepted-post");
  const next=fixture("GET");
  assert.equal((await processServiceBolepix(next.admin,"https://synthetic.supabase.co",{
    create:()=>{posts++;throw new Error("No second POST");},recover:async()=>next.result,
  })).result,"DONE");
  assert.equal(posts,1);
  assert.equal(preserves,2,"The private WeakMap recovery retries only evidence persistence after the brief lock.");
  assert(!JSON.stringify(error).includes("accepted-post"));
});
Deno.test("missing Pix preserves the registered title and retries only snapshots; transport never clears intent",async()=>{
  const f=fixture();
  assert.deepEqual(await processServiceBolepix(f.admin,"https://synthetic.supabase.co",{
    create:async()=>({...f.result,pixPayload:null,pixEncodedImage:null}),
  }),{handled:true,result:"PIX_PENDING"});
  const pending=fixture("GET");
  assert.deepEqual(await processServiceBolepix(pending.admin,"https://synthetic.supabase.co",{
    create:()=>{throw new Error("No POST");},recover:()=>Promise.reject(new TypeError("fetch failed")),
  }),{handled:true,result:"RETRY"});
  assert.deepEqual(pending.calls.at(-1)?.args,{p_job_id:job.jobId,p_lease_token:job.leaseToken,p_transient:true,p_code:"TRANSPORT"});
  assert(!pending.calls.some(call=>/reserve|clear|reset/.test(call.name)));
  const registering=fixture();
  assert.equal((await processServiceBolepix(registering.admin,"https://synthetic.supabase.co",{
    create:async()=>({...registering.result,remoteStatus:"REGISTERING"}),
  })).result,"PIX_PENDING");
  assert(registering.calls.some(call=>call.name==="complete_nfse_service_bolepix_job_internal"),"Keep the original accepted POST while waiting for a final bank state.");
});
Deno.test("bank provenance, partial Pix, actor denial and academic EAD/Technical titles fail before persistence or sending",async()=>{
  for(const changes of [{matricula_id:id(10)},{turma_id:id(10)},{categoria:"TECNICO"},{tipo_lancamento:"MENSALIDADE"}]){
    const f=fixture();Object.assign(f.material.receivable,changes);
    const forbidden=()=>{throw new Error("Academic titles must not reach the bank");};
    assert.equal((await processServiceBolepix(f.admin,"https://synthetic.supabase.co",{create:forbidden,recover:forbidden})).result,"REVIEW");
    assert(!f.calls.some(call=>call.name==="complete_nfse_service_bolepix_job_internal"));
  }
  for(const changes of [{pixEncodedImage:null},{bankSlipOurNumber:"999999999"},{remoteStatus:"PAID"},
    {financialTerms:{...normalizeBaneseFinancialTerms(bank.financialTerms!),nominalAmount:1}}]){
    const f=fixture();
    assert.equal((await processServiceBolepix(f.admin,"https://synthetic.supabase.co",{create:async()=>({...f.result,...changes})})).result,"REVIEW");
    assert(!f.calls.some(call=>call.name==="complete_nfse_service_bolepix_job_internal"));
  }
  const denied=fixture();denied.setMaterialError({code:"42501",message:"private detail"});
  assert.equal((await processServiceBolepix(denied.admin,"https://synthetic.supabase.co",{create:()=>{throw new Error("Forbidden bank access");}})).result,"REVIEW");
});
Deno.test("GET registering waits until pending without another POST or skipping effective payments",async()=>{
  const f=fixture("GET");let gets=0;
  Object.assign(f.material.payer,{cpf_cnpj:bank.payer.document,endereco:"Rua sintética",numero:"1",cep:"49000000",bairro:"Centro",cidade:"Aracaju",uf:"SE"});
  Object.assign(f.material.metadata,{baneseAgencia:bank.beneficiary.agency,baneseConta:bank.beneficiary.account,baneseBoletoConvenio:bank.beneficiary.agreement});
  const query=async(_admin:unknown,_environment:unknown,input:any)=>{
    gets++;assert.equal(input.nossoNumero,bank.ourNumber);assert.equal(input.strictEffectivePayments,true);
    return { paid:false,payments:[],paymentsError:null,financialTermsError:null,
      remoteStatus:gets===1?"REGISTERING":"PENDING",financialTerms:normalizeBaneseFinancialTerms(bank.financialTerms!),
      pixPayload:f.result.pixPayload,pixEncodedImage:f.result.pixEncodedImage,
      raw:{NumeroLinhaDigitavel:bank.digitableLine,NumeroCodigoBarras:bank.barcode} } as any;
  };
  const dependencies={create:()=>{throw new Error("No POST after the initial registration");},
    recover:(admin:any,url:string,material:Material)=>recoverServiceBolepix(admin,url,material,query)};
  assert.equal((await processServiceBolepix(f.admin,"https://synthetic.supabase.co",dependencies)).result,"RETRY");
  assert.equal((await processServiceBolepix(f.admin,"https://synthetic.supabase.co",dependencies)).result,"DONE");
  assert.equal(gets,2);
});
Deno.test("worker refuses unauthenticated, wrong-secret, unsupported body and public GET requests",async()=>{
  const calls: string[]=[];
  const runtime={getEnv:(name:string)=>name==="SUPABASE_URL"?"https://synthetic.supabase.co":"synthetic-service-key",
    createAdmin:()=>({}) as any,readSecret:async()=>({ok:true as const,secret:"x".repeat(32),metadata:{stage:"WORKER_SECRET" as const,attempts:1,status:200,code:"OK",durationMs:0}}),
    process:async()=>{calls.push("process");return {handled:false};}};
  assert.equal((await handleServiceBolepixRequest(new Request("https://synthetic.test"),runtime)).status,405);
  assert.equal((await handleServiceBolepixRequest(new Request("https://synthetic.test",{method:"POST"}),runtime)).status,401);
  const request=(body:string)=>new Request("https://synthetic.test",{method:"POST",headers:{"X-Banese-Worker-Token":"x".repeat(32)},body});
  assert.equal((await handleServiceBolepixRequest(request('{"receivableId":"forged"}'),runtime)).status,400);
  assert.equal(calls.length,0);
  assert.equal((await handleServiceBolepixRequest(request('{}'),runtime)).status,200);assert.equal(calls.length,1);
});
