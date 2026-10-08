import {readFile} from 'node:fs/promises';
import {integrationSetupUrl,seedUrl} from './fixture-paths.mjs';
export const {actor,operation,bankIds,localIds,paidLocal,uid}=await import(seedUrl);
export const settlementId=uid(9001), eventId=uid(9100);
export const q=(db,sql,args=[])=>db.query(sql,args).then(x=>x.rows);
export const scalar=(db,sql,args=[])=>q(db,sql,args).then(x=>x[0].value);
export const invoke=(db,name,args=[])=>scalar(db,`select ${name}(${args.map((_,n)=>`$${n+1}`).join(',')}) value`,args);
export const sqlFile=file=>readFile(new URL(file,import.meta.url),'utf8');
export async function createFeeDatabase({db,finalize=true,proof=false}={}) {
 if(!db) {
  const {createIntegrationDatabase}=await import(integrationSetupUrl);
  db=await createIntegrationDatabase();
 }
 await db.exec(await sqlFile('./fixtures/canonical-fee-ledger.sql'));
 await db.exec(await sqlFile('./fixtures/canonical-fee-reversal.sql'));
 await db.exec(await sqlFile('./fixtures/canonical-ordinary-reversal.sql'));
 let manifest;
 if(finalize) {
  const targets=await q(db,'select id from public.contas_receber where id between $1 and $2 order by id',[uid(1001),uid(1049)]);
  const fees=await q(db,'select id from public.contas_receber where id between $1 and $2 order by id',[uid(202),uid(206)]);
  manifest=await invoke(db,'internal_financial_correction.prepare_operation',
   [operation,actor,targets.map(r=>r.id),fees.map(r=>r.id),'synthetic-full-plan-approval','a'.repeat(64)]);
  await invoke(db,'internal_financial_correction.approve_operation',[operation,manifest.planFingerprint]);
  for(const {id} of targets) {
   const claim=await invoke(db,'public.claim_financial_correction_service',[operation,id,manifest.fingerprint]);
   await invoke(db,'public.complete_financial_correction_service',[operation,id,manifest.fingerprint,claim.leaseToken,{
    confirmedAt:new Date().toISOString(),evidenceFingerprint:'b'.repeat(64),
    bankResult:{convenio:claim.item.convenio,nossoNumero:claim.item.nossoNumero,situationCode:5,
     remoteStatus:'CANCELED',alreadyCanceled:true,mutationAttempted:false,raw:{CodigoSituacaoBoleto:5},
     proof:{strictEffectivePayments:true,paymentsCount:0,identityValidated:true,termsValidated:true}}}]);
  }
  await invoke(db,'internal_financial_correction.finalize_operation',[operation,manifest.planFingerprint]);
 }
 if(proof) await db.exec(await sqlFile('../01_reversed_control_waiver_proof.sql'));
 return {db,manifest};
}
export async function inputFor(db) {
 return {
  eventId,parentOperationId:operation,
  expectedGuardHash:await scalar(db,"select md5(pg_get_functiondef('internal_academic.local_manual_reversal_authorized(public.contas_receber,public.contas_receber)'::regprocedure)) value"),
  expectedParentFingerprint:await scalar(db,'select plan_fingerprint value from internal_financial_correction.operations where id=$1',[operation]),
  approverAuthId:actor,approvalReference:'synthetic-owner-fee-reversal-approval',approvalHash:'e'.repeat(64),
  securityApprovalReference:'synthetic-explicit-temporary-guard-approval',securityApprovalHash:'f'.repeat(64),
  expectedReceipt:await scalar(db,'select to_jsonb(r) value from public.contas_receber r where id=$1',[paidLocal]),
  expectedSettlement:await scalar(db,'select to_jsonb(s) value from public.receivable_manual_settlements s where id=$1',[settlementId]),
  expectedRun:await scalar(db,'select to_jsonb(r) value from internal_academic.technical_manual_cycle_runs r where matricula_id=$1 and cycle_number=1',[uid(6)])
 };
}
export async function renderCandidate(input) {
 const source=await sqlFile('../02_oneoff_control_reversal.template.sql');
 return source.replaceAll('__MAINTENANCE_INPUT_JSON__',JSON.stringify(input).replaceAll("'","''"));
}
export async function executeCandidate(db,input) {
 try {return await db.exec(await renderCandidate(input));}
 catch(error) {await db.exec('rollback');throw error;}
}
export const rows=(db,table)=>q(db,`select to_jsonb(r) value from ${table} r order by to_jsonb(r)::text`);
export async function guardState(db) {
 return q(db,`select n.nspname,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text acl,
   pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where p.proname in ('local_manual_reversal_authorized','guard_local_manual_cycle_reversal',
   'protect_paid_financial_history','protect_receivable_manual_settlement_fields',
   'prevent_receivable_manual_settlement_event_mutation') order by n.nspname,p.proname`);
}
export async function protectedState(db) {
 const result={};
 for(const table of ['internal_financial_correction.operations','internal_financial_correction.items',
  'internal_academic.technical_manual_cycle_runs','internal_academic.technical_manual_receivable_issuance_authorizations',
  'internal_academic.technical_manual_banese_reissue_jobs','internal_academic.technical_manual_banese_reissue_archive',
  'public.payment_gateway_transactions','public.banese_reconciliation_queue']) result[table]=await rows(db,table);
 result.otherReceipts=await q(db,'select to_jsonb(r) value from public.contas_receber r where id<>$1 order by id',[paidLocal]);
 return result;
}
