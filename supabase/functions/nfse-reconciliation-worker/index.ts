import { NfseContractError } from '../_shared/nfse-national/xml.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import {createReconciliationWorkerHandler} from './handler.ts';
import {runReconciliationWorker,type ReconciliationJob} from './worker.ts';
import {reconcileSubmittedOperation,type WorkerMaterial} from './executor.ts';
const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
async function rpc(name:string,args:Record<string,unknown>={}){
 const {data,error}=await admin.rpc(name,args).abortSignal(AbortSignal.timeout(8_000));
 if(name==='get_nfse_reconciliation_material_internal' && ['42501','22023'].includes(error?.code??''))throw new NfseContractError('WORKER_AUTH_BLOCKED');
 if(error?.code==='42501')throw new NfseContractError('WORKER_AUTH_BLOCKED');
 if(error?.code==='22023')throw new NfseContractError('WORKER_INVALID_EVIDENCE');
 if(error||data===null)throw Error('WORKER_RPC_UNAVAILABLE');return data;
}
const lease=(job:ReconciliationJob)=>({p_job_id:job.jobId,p_lease_token:job.leaseToken});
Deno.serve(createReconciliationWorkerHandler({
 secret:async()=>String(await rpc('get_nfse_reconciliation_worker_secret_internal')),
 run:()=>runReconciliationWorker({
  claim:async()=>await rpc('claim_nfse_reconciliation_jobs_internal',{p_limit:1}) as ReconciliationJob[],
  material:async job=>await rpc('get_nfse_reconciliation_material_internal',lease(job)) as WorkerMaterial,
  reconcile:reconcileSubmittedOperation,
  complete:async(job,result)=>Boolean(await rpc('complete_nfse_reconciliation_proof_internal',{...lease(job),p_result:result})),
  finish:async(job,outcome,code,retryAfter)=>{await rpc('finish_nfse_reconciliation_job_internal',{...lease(job),p_outcome:outcome,p_code:code,p_retry_after_seconds:retryAfter??null});},
 }),
}));
