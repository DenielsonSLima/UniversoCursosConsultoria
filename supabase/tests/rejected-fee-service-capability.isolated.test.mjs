import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupRejectedFee,approve,absence,call,operation,id} from './rejected-fee-setup.mjs';
const sql=()=>readFile(new URL('../migrations/20261027184900_rejected_fee_service_capability.sql',import.meta.url),'utf8');
const row=async(db,query,args=[])=>(await db.query(query,args)).rows[0];
const isolated=async(db,fn)=>{await db.exec('begin');try{await fn()}finally{await db.exec('rollback')}};
const denied=async(db,fn,re)=>{await db.exec('savepoint denied');try{await assert.rejects(fn,re)}finally{await db.exec('rollback to denied;release denied')}};
test('SYSTEM capability preserves historical auth, one claim permits only GET retry, canonical persistence completes exact fee',async()=>{
 const {db,fee,enrollment}=await setupRejectedFee();
 try{
 const approved=await approve(db,fee);await absence(db,approved);await call(db,'internal_academic.prepare_rejected_fee_correction',[operation,approved.manifestHash]);
 await db.exec(await readFile(new URL('../migrations/20260831174500_claim_banese_api_submission_before_post.sql',import.meta.url),'utf8'));
 await db.exec(await sql());
 const auth=await row(db,'select to_jsonb(a) value from internal_academic.technical_manual_receivable_issuance_authorizations a where receivable_id=$1',[fee]);
 const siblings=await db.query('select to_jsonb(c) value from public.contas_receber c where matricula_id=$1 and id<>$2 order by id',[enrollment,fee]);
 const approveService=()=>call(db,'internal_academic.approve_rejected_fee_service_issuance',[operation,approved.manifestHash,'synthetic-user-authorized-service']);
 assert.equal((await row(db,"select has_function_privilege('authenticated','internal_academic.approve_rejected_fee_service_issuance(uuid,text,text)','EXECUTE') ok")).ok,false);
 await isolated(db,async()=>{await db.query('update public.contas_receber set valor_pago=1 where id=$1',[fee]);await denied(db,approveService,/APPROVAL_SCOPE/)});
 assert.equal((await approveService()).approved,true);
 await assert.rejects(()=>db.exec('delete from internal_academic.rejected_fee_service_capabilities'),/HISTORY_IMMUTABLE/);
 await assert.rejects(()=>db.exec("update internal_academic.rejected_fee_service_capabilities set approval_reference='forged'"),/CONTEXT_REQUIRED|HISTORY_IMMUTABLE/);
 assert.deepEqual(await row(db,'select to_jsonb(a) value from internal_academic.technical_manual_receivable_issuance_authorizations a where receivable_id=$1',[fee]),auth);
 await isolated(db,async()=>{await db.query("update public.matriculas set status='TRANCADO' where id=$1",[enrollment]);await denied(db,()=>call(db,'public.claim_rejected_fee_service_issuance',[operation,approved.manifestHash]),/SCOPE_CHANGED/)});
 const claim=await call(db,'public.claim_rejected_fee_service_issuance',[operation,approved.manifestHash]);assert.equal(claim.recoveryOnly,false);
 await assert.rejects(()=>call(db,'public.claim_rejected_fee_service_issuance',[operation,approved.manifestHash]),/BUSY/);
 await assert.rejects(()=>call(db,'public.persist_rejected_fee_service_issuance',[operation,approved.manifestHash,id(99999),{}]),/LEASE_REQUIRED/);
 await assert.rejects(()=>call(db,'internal_academic.persist_rejected_fee_service_canonical',[fee,claim.requestId,claim.requestId,{}]),/CAPABILITY_REQUIRED/);
 const claimRow=(await row(db,'select to_jsonb(c) value from public.contas_receber c where id=$1',[fee])).value;
 assert.equal(await call(db,'public.claim_banese_api_submission_attempt',[fee,'production',claimRow.gateway_boleto_convenio,claimRow.gateway_boleto_agencia,claimRow.gateway_boleto_nosso_numero,100,'2026-10-30',claim.requestId]),true);
 const r=(await row(db,'select to_jsonb(c) value from public.contas_receber c where id=$1',[fee])).value;
 const nn=r.gateway_boleto_nosso_numero,barcode='0479'+'0'.repeat(26)+nn+'0'.repeat(5);
 const line=barcode.slice(0,4)+barcode.slice(19,24)+'0'+barcode.slice(24,34)+'0'+barcode.slice(34,44)+'0'+barcode[4]+barcode.slice(5,19);
 const result={providerCode:'banese_card',remotePaymentId:nn,remotePaymentLinkId:null,issuerPoloId:r.gateway_issuer_polo_id,
 bankSlipOurNumber:nn,bankSlipDigitableLine:line,bankSlipBarcode:barcode,pixPayload:`000201BR.GOV.BCB.PIX.SYNTHETIC${nn}53039865802BR6304ABCD`,
 pixEncodedImage:'data:image/png;base64,iVBORw0KGgoAAAAAAAAAAAAAAAAAAAAA',remoteStatus:'PENDING',financialTerms:r.gateway_financial_terms,rawPayload:{request:{synthetic:true},response:{synthetic:true}}};
 await call(db,'public.fail_rejected_fee_service_issuance',[operation,approved.manifestHash,claim.leaseToken,'private pii must not be logged']);
 await assert.rejects(()=>call(db,'public.persist_rejected_fee_service_issuance',[operation,approved.manifestHash,claim.leaseToken,result]),/LEASE_REQUIRED/);
 const retry=await call(db,'public.claim_rejected_fee_service_issuance',[operation,approved.manifestHash]);assert.equal(retry.recoveryOnly,true);
 assert.equal((await row(db,'select last_error from internal_academic.rejected_fee_service_capabilities where operation_id=$1',[operation])).last_error,'REVIEW_RETRY_GET_ONLY');
 await isolated(db,async()=>{await denied(db,()=>call(db,'public.persist_rejected_fee_service_issuance',[operation,approved.manifestHash,retry.leaseToken,{...result,bankSlipOurNumber:'000099002'}]),/BolePix/)});
 const complete=await call(db,'public.persist_rejected_fee_service_issuance',[operation,approved.manifestHash,retry.leaseToken,result]);assert.equal(complete.success,true);
 assert.deepEqual(await row(db,'select to_jsonb(a) value from internal_academic.technical_manual_receivable_issuance_authorizations a where receivable_id=$1',[fee]),auth);
 assert.deepEqual((await db.query('select to_jsonb(c) value from public.contas_receber c where matricula_id=$1 and id<>$2 order by id',[enrollment,fee])).rows,siblings.rows);
 assert.equal((await call(db,'public.persist_rejected_fee_service_issuance',[operation,approved.manifestHash,retry.leaseToken,result])).replayed,true);
 const replayClaim=await call(db,'public.claim_rejected_fee_service_issuance',[operation,approved.manifestHash]);assert.equal(replayClaim.completed,true);assert.equal(replayClaim.receivableId,fee);assert.equal(replayClaim.recoveryOnly,true);
 const progress=await call(db,'internal_academic.manual_cycle_issuance_progress',[enrollment,2]);assert.equal(progress.ciclo.emitidosBanese,13);
 for(const role of ['anon','authenticated','service_role'])assert.equal((await row(db,"select has_table_privilege($1,'internal_academic.rejected_fee_service_capabilities','INSERT,UPDATE,DELETE') ok",[role])).ok,false);
 for(const role of ['anon','authenticated'])assert.equal((await row(db,"select has_function_privilege($1,'public.claim_rejected_fee_service_issuance(uuid,text)','EXECUTE') ok",[role])).ok,false);
 }finally{await db.close()}
});
