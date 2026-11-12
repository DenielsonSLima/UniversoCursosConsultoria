import { NfseContractError } from '../_shared/nfse-national/xml.ts';
import type { WorkerMaterial } from './executor.ts';
export interface ReconciliationJob {jobId:string;leaseToken:string;targetKind:'ISSUE'|'CANCEL';targetId:string;operationId:string;leaseUntil:string}
interface Dependencies {
 claim():Promise<ReconciliationJob[]>;
 material(job:ReconciliationJob):Promise<WorkerMaterial>;
 reconcile(material:WorkerMaterial):Promise<Record<string,unknown>>;
 complete(job:ReconciliationJob,result:Record<string,unknown>):Promise<boolean>;
 finish(job:ReconciliationJob,outcome:'PENDING'|'RETRY'|'BLOCKED',code:string,retryAfter?:number):Promise<void>;
 now?:()=>number;
}
/** One leased target per invocation; cron/short kickoff can overlap safely through database leases. */
export async function runReconciliationWorker(deps:Dependencies) {
 const jobs=await deps.claim();
 if(jobs.length>1) throw new Error('WORKER_BATCH_LIMIT');
 let confirmed=0;
 for(const job of jobs){
  try{
   if(Date.parse(job.leaseUntil)<=(deps.now??Date.now)()+46_000) throw new Error('WORKER_LEASE_TOO_SHORT');
   const material=await deps.material(job);
   if(material.targetKind!==job.targetKind) throw new Error('WORKER_SCOPE_MISMATCH');
   const result=await deps.reconcile(material);
   const terminal=result.state==='AUTHORIZED'||result.state==='CONFIRMED'&&result.cancellationState==='CANCELLED';
   if(terminal){if(await deps.complete(job,result)) confirmed++;continue;}
   const limited=result.code==='WORKER_RATE_LIMITED';
   await deps.finish(job,'PENDING',limited?'THROTTLED':'PENDING',limited?300:undefined);
  }catch(error){
   const code=error instanceof NfseContractError?error.code:'';
   const blocked=code==='WORKER_INVALID_EVIDENCE';
   // Missing/expired credential is retried slowly; every retry revalidates current scoped material.
   // Invalid fiscal proof remains blocked for explicit investigation, never auto-confirmed.
   // Finishing with an expired/stolen lease must fail closed; it never changes fiscal records.
   await deps.finish(job,blocked?'BLOCKED':'RETRY',code==='WORKER_AUTH_BLOCKED'?'AUTH_BLOCKED':code==='WORKER_INVALID_EVIDENCE'?'INVALID_EVIDENCE':code==='WORKER_RATE_LIMITED'?'THROTTLED':'TRANSPORT',code==='WORKER_RATE_LIMITED'?300:code==='WORKER_AUTH_BLOCKED'?900:undefined).catch(()=>{});
  }
 }
 return {processed:jobs.length,confirmed};
}
