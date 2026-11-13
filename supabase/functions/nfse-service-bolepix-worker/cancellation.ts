import { type Admin, leaseArgs, parseJob, record, rpc } from "./contract.ts";
import { cancelServiceBolepix, type CancellationBankDependencies } from "./cancellation-bank.ts";
import { type CancellationProof, cancellationFingerprint, parseCancellationMaterial } from "./cancellation-contract.ts";

const failure = (error: unknown, ambiguousIssue: boolean) => {
  const item=record(error),message=String(item.message||""),code=String(item.code||"");
  if (/PAYMENT_HISTORY/.test(message))return {transient:false,code:"PAYMENT_HISTORY"};
  if (["42501","55000"].includes(code))return {transient:false,code:"AUTH_BLOCKED"};
  if (/INVALID_EVIDENCE|diverg|incompat|identidade|parcial|snapshot/i.test(message))return {transient:false,code:"INVALID_EVIDENCE"};
  const transient=/network|fetch failed|failed to fetch|timeout|timed out|abort|TRANSPORT|\((429|5\d\d)\)/i.test(message)
    || ["57014","55P03","PGRST003"].includes(code) || ambiguousIssue && /\(404\)/.test(message)
    || item.name === "BaneseBoletoPaymentProcessingError";
  return {transient,code:transient?"TRANSPORT":"LOCAL_CONFLICT"};
};
export async function processServiceCancellation(admin: Admin, dependencies: CancellationBankDependencies = {}) {
  const claimed=await rpc(admin,"claim_nfse_service_cancellation_job_internal");
  if(claimed==null)return {handled:false};
  const job=parseJob(claimed);let ambiguousIssue=false;
  try {
    const material=parseCancellationMaterial(await rpc(admin,"get_nfse_service_cancellation_material_internal",leaseArgs(job)),job);
    ambiguousIssue=material.receivable.gateway_submission_status==="API_AMBIGUOUS";
    let result:CancellationProof;
    if(material.action==="LOCAL_CANCEL"||material.action==="PRESERVE_PAID"){
      const outcome=material.action==="LOCAL_CANCEL"?"LOCAL_CANCELLED":"PAID";
      result={outcome,remoteStatus:outcome==="PAID"?"PAID":"LOCAL",confirmedAt:new Date().toISOString(),
        evidenceFingerprint:await cancellationFingerprint({receivableId:job.receivableId,outcome,updatedAt:material.receivable.updated_at})};
    }else result=await cancelServiceBolepix(admin,material,async()=>{
      const ack=record(await rpc(admin,"begin_nfse_service_cancellation_bank_internal",leaseArgs(job)));
      if(ack.started!==true)throw new Error("INVALID_EVIDENCE");
    },dependencies);
    const receipt=record(await rpc(admin,"complete_nfse_service_cancellation_job_internal",{...leaseArgs(job),p_result:result}));
    if(receipt.completed!==true||receipt.receivableId!==job.receivableId)throw new Error("INVALID_EVIDENCE");
    return {handled:true,result:result.outcome};
  }catch(error){
    const decision=failure(error,ambiguousIssue);
    await rpc(admin,"fail_nfse_service_cancellation_job_internal",{...leaseArgs(job),p_transient:decision.transient,p_code:decision.code});
    return {handled:true,result:decision.transient?"RETRY":"REVIEW"};
  }
}
