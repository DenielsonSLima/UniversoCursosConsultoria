import {boundedDraftDirectory} from './bounded-draft-paths.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEligibilityDatabase} from './bounded-eligibility-setup.mjs';
import {actor,operation,bankIds,localIds,paidLocal,uid} from './bounded-seed.mjs';
let db;
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[]) => (await q(sql,args))[0].value;
const call=(name,args=[])=>scalar(`select ${name}(${args.map((_,n)=>`$${n+1}`).join(',')}) value`,args);
const state=id=>call('internal_academic.technical_manual_cycle_state',[id]);
const eligible=s=>{assert.equal(s.estado,'ELEGIVEL');assert.equal(s.podeGerar,true);assert.equal(s.proximoCicloNumero,2);};
const blocked=s=>assert.equal(s.podeGerar,false);
async function isolated(run) {await db.exec('begin');try {await run();}finally {await db.exec('rollback');}}
async function applyNativeWaiverDraft() {
 const draft=await readFile(new URL('14_exact_local_waiver_native_eligibility.draft.sql',boundedDraftDirectory),'utf8');
 await db.exec(draft.replace(/^begin;$/m,'').replace(/^commit;$/m,''));
}
async function finalize() {
 const manifest=await call('internal_financial_correction.prepare_operation',
  [operation,actor,bankIds,localIds,'synthetic-full-plan-approval','a'.repeat(64)]);
 await call('internal_financial_correction.approve_operation',[operation,manifest.planFingerprint]);
 for(const id of bankIds) {
  const claim=await call('public.claim_financial_correction_service',[operation,id,manifest.fingerprint]);
  await call('public.complete_financial_correction_service',[operation,id,manifest.fingerprint,claim.leaseToken,{
   confirmedAt:new Date().toISOString(),evidenceFingerprint:'b'.repeat(64),
   bankResult:{convenio:claim.item.convenio,nossoNumero:claim.item.nossoNumero,situationCode:5,
    remoteStatus:'CANCELED',alreadyCanceled:true,mutationAttempted:false,raw:{CodigoSituacaoBoleto:5},
    proof:{strictEffectivePayments:true,paymentsCount:0,identityValidated:true,termsValidated:true}}}]);
 }
 return call('internal_financial_correction.finalize_operation',[operation,manifest.planFingerprint]);
}
before(async()=>{db=await createEligibilityDatabase();});
after(async()=>await db?.close());
test('production core baseline is exact and pending LOCAL allows canonical C2',()=>isolated(async()=>{
 assert.equal(await scalar("select md5(pg_get_functiondef('internal_academic.technical_manual_cycle_state_before_external_history(uuid)'::regprocedure)) value"),'ed683615bd0bdf62415ebe056d763b8d');
 for(let m=2;m<=6;m++) eligible(await state(uid(5+m)));
}));
test('exact finalized five waivers reproduce native C2 regression; narrow predicate preserves canonical protections',()=>isolated(async()=>{
 const runs=await q('select to_jsonb(r) value from internal_academic.technical_manual_cycle_runs r order by request_id');
 const paid=await q('select to_jsonb(r) value from public.contas_receber r where id=$1',[paidLocal]);
 const unrelated=await q('select to_jsonb(r) value from public.contas_receber r where id>=$1 order by id',[uid(20000)]);
 assert.equal(unrelated.length,168);
 const result=await finalize();
 assert.deepEqual(await q('select to_jsonb(r) value from public.contas_receber r where id>=$1 order by id',[uid(20000)]),unrelated);
 assert.equal(result.resetCount,36);assert.equal(result.canceledC2Count,13);assert.equal(result.waivedLocalCount,5);
 assert.deepEqual(await q('select to_jsonb(r) value from internal_academic.technical_manual_cycle_runs r order by request_id'),runs);
 assert.deepEqual(await q('select to_jsonb(r) value from public.contas_receber r where id=$1',[paidLocal]),paid);
 assert.equal(await scalar("select count(*)::int value from internal_financial_correction.items i where kind='LOCAL_WAIVER' and exists(select 1 from internal_financial_correction.items r where r.kind='RESET_C1' and r.matricula_id=i.matricula_id)"),2);
 for(let m=2;m<=6;m++) blocked(await state(uid(5+m)));
 await applyNativeWaiverDraft();
 // Waiver-only three regain the same preexisting eligibility. Reset cohorts
 // remain blocked until their banking items satisfy ordinary canonical rules.
 for(let m=4;m<=6;m++) eligible(await state(uid(5+m)));
 for(let m=2;m<=3;m++) {
  const s=await state(uid(5+m));blocked(s);assert.equal(s.bloqueio.codigo,'CICLO_ANTERIOR_EMISSAO_PENDENTE');
 }
 const terminal=await state(uid(6));blocked(terminal);assert.equal(terminal.proximoCicloNumero,null);
 assert.equal(terminal.estado,'JA_GERADO');
 // Eligibility never generates an obligation or bank operation.
 assert.deepEqual(await q('select to_jsonb(r) value from internal_academic.technical_manual_cycle_runs r order by request_id'),runs);
}));
test('arbitrary CANCELADO local cannot pass candidate eligibility',()=>isolated(async()=>{
 await applyNativeWaiverDraft();
 await db.exec('alter table public.contas_receber disable trigger user');
 await db.query("update public.contas_receber set status='CANCELADO' where id=$1",[localIds[2]]);
 await db.exec('alter table public.contas_receber enable trigger user');
 assert.equal(await scalar('select internal_financial_correction.local_waiver_complete(r) value from public.contas_receber r where id=$1',[localIds[2]]),false);
 blocked(await state(uid(9)));
}));
for(const [name,sql,code] of [
 ['academic status',"update public.matriculas set status='TRANCADO' where id=$1",'STATUS_ACADEMICO'],
 ['missing configuration','delete from public.matriculas_tecnicas_financeiro_config where matricula_id=$1','SEM_CONFIGURACAO'],
 ['imported conflicting identity',"insert into internal_academic.technical_imported_cycle_facts(matricula_id,cycle_number,identity_hash) values($1,1,'conflicting-identity')",'HISTORICO_IMPORTADO_IDENTIDADE_DIVERGENTE'],
 ['imported second cycle',"insert into internal_academic.technical_imported_cycle_facts(matricula_id,cycle_number,identity_hash) values($1,2,'conflicting-identity')",'CICLO_IMPORTADO_ORIGENS_CONFLITANTES'],
 ['protected run',"update internal_academic.technical_manual_cycle_runs set state='PROTECTED_EXISTING' where matricula_id=$1",null],
]) test(`finalized waiver does not bypass ${name}`,()=>isolated(async()=>{
 await finalize();await applyNativeWaiverDraft();await db.query(sql,[uid(9)]);
 const s=await state(uid(9));blocked(s);if(code) assert.equal(s.bloqueio.codigo,code);
}));

test('draft14 refuses canonical baseline drift atomically',()=>isolated(async()=>{
 await applyNativeWaiverDraft();
 await db.exec('savepoint drift');
 await assert.rejects(applyNativeWaiverDraft,/BOUNDED_WAIVER_BASELINE_DRIFT/);
 await db.exec('rollback to drift');
}));

function syntheticBankResult(number,terms) {
 const barcode='0479'+'0'.repeat(26)+number+'0'.repeat(5);
 const line=barcode.slice(0,4)+barcode.slice(19,24)+'0'+barcode.slice(24,34)+'0'+barcode.slice(34,44)+'0'+barcode.slice(4,5)+barcode.slice(5,19);
 return {providerCode:'banese_card',remotePaymentId:number,remoteStatus:'PENDING',issuerPoloId:uid(2),
  bankSlipOurNumber:number,bankSlipBarcode:barcode,bankSlipDigitableLine:line,
  pixPayload:`000201BR.GOV.BCB.PIX${number}53039865802BR6304ABCD`,
  pixEncodedImage:'data:image/png;base64,iVBORw0KGgo'+'A'.repeat(40),
  financialTerms:terms,rawPayload:{request:{synthetic:true},response:{synthetic:true}}};
}

const preview=(enrollment)=>call('public.preview_bounded_financial_correction_secure',[operation,enrollment]);
const consent=(enrollment,batch,fingerprint)=>call('public.consent_bounded_financial_correction_secure',[operation,enrollment,batch,fingerprint]);
test('full canonical persistence restores native C2 only after completed C1-only correction',()=>isolated(async()=>{
 await finalize();await applyNativeWaiverDraft();await db.exec("set local test.jwt.role='authenticated'");
 for(const [index,enrollment] of [uid(6),uid(7),uid(8)].entries()) {
  const p=await preview(enrollment);await consent(enrollment,uid(89000+index),p.fingerprint);
 }
 const items=await q("select * from internal_financial_correction.items where kind='RESET_C1' order by receivable_id");
 const runs=await q('select to_jsonb(r) value from internal_academic.technical_manual_cycle_runs r order by request_id');
 for(const [index,item] of items.entries()) {
  const number=String(900000000+index);
  await db.query(`update public.contas_receber set gateway_creation_token=$2,gateway_status='CREATING',
   gateway_boleto_nosso_numero=$3,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS'
   where id=$1`,[item.receivable_id,item.consent_request_id,number]);
  const payload=syntheticBankResult(number,item.corrected_terms);
  await db.exec("set local test.jwt.role='service_role'");
  const result=await call('public.persist_technical_manual_cycle_banese_issuance',
   [item.receivable_id,item.consent_request_id,item.consent_request_id,payload]);
  assert.equal(result.success,true);
  assert.equal(await scalar('select internal_academic.technical_manual_banese_receivable_complete(r) value from public.contas_receber r where id=$1',[item.receivable_id]),true);
  const replay=await call('public.persist_technical_manual_cycle_banese_issuance',
   [item.receivable_id,item.consent_request_id,item.consent_request_id,payload]);assert.equal(replay.replayed,true);
 }

 for(const enrollment of [uid(7),uid(8)]) {
  const native=await call('internal_financial_correction.original_cycle_state',[enrollment]);
  eligible(native);
  const exposed=await state(enrollment);
  assert.equal(exposed.correcaoEmissao.status,'COMPLETE');
  // Completed C1-only corrections restore the unchanged native eligibility.
  eligible(exposed);
  const p=await preview(enrollment);
  assert.equal(p.status,'COMPLETE');eligible(p.cycleContext.cicloManual);
 }
 blocked(await state(uid(6)));
 assert.equal((await state(uid(6))).proximoCicloNumero,null);
 assert.deepEqual(await q('select to_jsonb(r) value from internal_academic.technical_manual_cycle_runs r order by request_id'),runs);
}));
