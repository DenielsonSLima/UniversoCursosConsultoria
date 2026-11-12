import assert from 'node:assert/strict';
import {NfseContractError} from '../_shared/nfse-national/xml.ts';
import {runReconciliationWorker} from './worker.ts';
import type {WorkerMaterial} from './executor.ts';
Deno.test('worker completes only verified terminal result, pending never issues another fiscal action',async()=>{
 const job={jobId:'j',leaseToken:'l',targetKind:'ISSUE' as const,targetId:'t',operationId:'o',leaseUntil:new Date(Date.now()+90_000).toISOString()};
 let complete=0;const finishes:unknown[]=[];
 const deps={claim:async()=>[job],material:async()=>({targetKind:'ISSUE'} as WorkerMaterial),reconcile:async()=>({state:'AWAITING_CONFIRMATION',code:'WORKER_RATE_LIMITED'}),
 complete:async()=>{complete++;return true;},finish:async(...args:unknown[])=>{finishes.push(args);}};
 assert.deepEqual(await runReconciliationWorker(deps),{processed:1,confirmed:0});assert.equal(complete,0);assert.deepEqual(finishes[0],[job,'PENDING','THROTTLED',300]);
 assert.deepEqual(await runReconciliationWorker({...deps,reconcile:async()=>({state:'AUTHORIZED'})}),{processed:1,confirmed:1});assert.equal(complete,1);
});
Deno.test('worker rejects mismatched scope and expired lease before remote consultation',async()=>{
 let calls=0;const job={jobId:'j',leaseToken:'l',targetKind:'ISSUE' as const,targetId:'t',operationId:'o',leaseUntil:new Date(0).toISOString()};
 await runReconciliationWorker({claim:async()=>[job],material:async()=>{calls++;return {} as WorkerMaterial;},reconcile:async()=>{calls++;return {};},complete:async()=>false,finish:async()=>{}});
 assert.equal(calls,0);
});
Deno.test('analysis event is not final cancellation and failed proof never marks job confirmed',async()=>{
 const job={jobId:'j',leaseToken:'l',targetKind:'CANCEL' as const,targetId:'t',operationId:'o',leaseUntil:new Date(Date.now()+90_000).toISOString()};
 let complete=0;const finishes:unknown[]=[];
 const deps={claim:async()=>[job],material:async()=>({targetKind:'CANCEL'} as WorkerMaterial),reconcile:async()=>({state:'CONFIRMED',cancellationState:'AWAITING_ANALYSIS'}),
 complete:async()=>{complete++;throw Error('proof');},finish:async(...args:unknown[])=>{finishes.push(args);}};
 await runReconciliationWorker(deps);assert.equal(complete,0);assert.deepEqual(finishes[0],[job,'PENDING','PENDING',undefined]);
 const result=await runReconciliationWorker({...deps,reconcile:async()=>({state:'CONFIRMED',cancellationState:'CANCELLED'})});
 assert.equal(result.confirmed,0);assert.equal(complete,1);assert.deepEqual(finishes[1],[job,'RETRY','TRANSPORT',undefined]);
});

Deno.test('credential failures retry slowly with fresh material, invalid proof remains blocked',async()=>{
 const job={jobId:'j',leaseToken:'l',targetKind:'ISSUE' as const,targetId:'t',operationId:'o',leaseUntil:new Date(Date.now()+90_000).toISOString()};
 const finishes:unknown[][]=[];let queries=0;let fixed=false;
 const deps={claim:async()=>[job],material:async()=>{if(!fixed)throw new NfseContractError('WORKER_AUTH_BLOCKED');return {targetKind:'ISSUE'} as WorkerMaterial;},reconcile:async()=>{queries++;return {state:'AUTHORIZED'};},complete:async()=>true,finish:async(...args:unknown[])=>{finishes.push(args);}};
 await runReconciliationWorker(deps);assert.equal(queries,0);assert.deepEqual(finishes[0],[job,'RETRY','AUTH_BLOCKED',900]);
 fixed=true;assert.deepEqual(await runReconciliationWorker(deps),{processed:1,confirmed:1});assert.equal(queries,1);
 await runReconciliationWorker({...deps,complete:async()=>{throw new NfseContractError('WORKER_INVALID_EVIDENCE');}});
 assert.deepEqual(finishes[1],[job,'BLOCKED','INVALID_EVIDENCE',undefined]);
});
