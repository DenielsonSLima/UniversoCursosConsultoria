import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createIntegrationDatabase} from './bounded-integration-setup.mjs';
import {actor,operation,bankIds,localIds,paidLocal,uid} from './bounded-seed.mjs';
let db,manifest;
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[]) => (await q(sql,args))[0].value;
const invoke=(name,args=[])=>scalar(`select ${name}(${args.map((_,n)=>`$${n+1}`).join(',')}) value`,args);
const bank=(name,args=[])=>invoke('public.'+name+'_financial_correction_service',args);
async function prepare() {
 manifest=await invoke('internal_financial_correction.prepare_operation',
  [operation,actor,bankIds,localIds,'synthetic-full-plan-approval','a'.repeat(64)]);
 await invoke('internal_financial_correction.approve_operation',[operation,manifest.planFingerprint]);
}
async function confirmAll() {
 await prepare();
 for(const id of bankIds) {
  const claim=await bank('claim',[operation,id,manifest.fingerprint]);
  await bank('complete',[operation,id,manifest.fingerprint,claim.leaseToken,{
   confirmedAt:new Date().toISOString(),evidenceFingerprint:'b'.repeat(64),
   bankResult:{convenio:claim.item.convenio,nossoNumero:claim.item.nossoNumero,situationCode:5,
    remoteStatus:'CANCELED',alreadyCanceled:true,mutationAttempted:false,raw:{CodigoSituacaoBoleto:5},
    proof:{strictEffectivePayments:true,paymentsCount:0,identityValidated:true,termsValidated:true}}}]);
 }
}
const finalize=()=>invoke('internal_financial_correction.finalize_operation',[operation,manifest.planFingerprint]);
async function isolated(run) {
 await db.exec('begin'); try {await run();} finally {await db.exec('rollback');}
}
async function rejectsAtomically(run,pattern) {
 await db.exec('savepoint expected_rejection');
 try {await assert.rejects(run,pattern);} finally {await db.exec('rollback to expected_rejection; release expected_rejection');}
}
const rows=table=>q(`select to_jsonb(r) value from ${table} r order by to_jsonb(r)::text`);
before(async()=>{db=await createIntegrationDatabase();});
after(async()=>await db?.close());
test('49 confirmations -> atomic finalization preserves IDs/runs/auth and 168 unrelated rows',()=>isolated(async()=>{
 await confirmAll();
 const runs=await rows('internal_academic.technical_manual_cycle_runs');
 const auth=await rows('internal_academic.technical_manual_receivable_issuance_authorizations');
 const untouched=await q("select to_jsonb(r) value from public.contas_receber r where id >= $1 order by id",[uid(20000)]);
 const paid=await q('select to_jsonb(r) value from public.contas_receber r where id=$1',[paidLocal]);
 const beforeIds=await q('select id from public.contas_receber order by id');
 const result=await finalize(); assert.equal(result.emitted,0); assert.equal(result.resetCount,36);
 assert.equal(result.canceledC2Count,13); assert.equal(result.waivedLocalCount,5);
 assert.deepEqual(await q('select id from public.contas_receber order by id'),beforeIds);
 assert.deepEqual(await rows('internal_academic.technical_manual_cycle_runs'),runs);
 assert.deepEqual(await rows('internal_academic.technical_manual_receivable_issuance_authorizations'),auth);
 assert.deepEqual(await q("select to_jsonb(r) value from public.contas_receber r where id >= $1 order by id",[uid(20000)]),untouched);
 assert.deepEqual(await q('select to_jsonb(r) value from public.contas_receber r where id=$1',[paidLocal]),paid);
 const reset=await q(`select r.*,i.corrected_terms from public.contas_receber r
  join internal_financial_correction.items i on i.receivable_id=r.id where i.kind='RESET_C1'`);
 assert.equal(reset.length,36);
 for(const r of reset) {assert.equal(new Date(r.data_vencimento).getUTCDate(),15);
  assert.deepEqual(r.gateway_financial_terms,r.corrected_terms); assert.equal(r.gateway_payment_id,null);
  assert.equal(r.gateway_creation_token,null);assert.equal(r.status,'PENDENTE');}
 assert.equal(await scalar("select count(*)::int value from internal_academic.technical_manual_banese_reissue_archive"),36);
 assert.equal(await scalar("select count(*)::int value from internal_academic.technical_manual_banese_reissue_jobs where status='RESET_COMPLETE'"),36);
 assert.equal(await scalar("select count(*)::int value from public.payment_gateway_transactions where receivable_id is null and remote_status='CANCELED'"),36);
 assert.equal(await scalar(`select count(*)::int value from public.payment_gateway_transactions t
  join internal_financial_correction.items i on i.transaction_id=t.id
  where i.kind='CANCEL_C2' and t.receivable_id=i.receivable_id and t.remote_status='CANCELED'`),13);
 assert.equal((await finalize()).replayed,true);
}));
test('incomplete bank confirmations cannot finalize anything',()=>isolated(async()=>{
 await prepare();const before=await rows('public.contas_receber');
 await rejectsAtomically(finalize,/ALL_49/);
 assert.deepEqual(await rows('public.contas_receber'),before);
 assert.equal(await scalar('select count(*)::int value from internal_academic.technical_manual_banese_reissue_jobs'),0);
}));
for(const [label,sql] of [
 ['payment',"update public.contas_receber set valor_pago=0.01 where id=$1"],
 ['receipt observation',"update public.contas_receber set gateway_last_error='changed' where id=$1"],
 ['run',"update internal_academic.technical_manual_cycle_runs set total_amount=999 where $1=any(receivable_ids)"],
 ['transaction',"update public.payment_gateway_transactions set raw_payload=raw_payload||'{\"unexpected\":true}' where receivable_id=$1"],
]) test(`finalizer rejects ${label} drift with no partial reset`,()=>isolated(async()=>{
 await confirmAll();await db.query(sql,[bankIds[0]]);const before=await rows('public.contas_receber');
 await rejectsAtomically(finalize);
 assert.deepEqual(await rows('public.contas_receber'),before);
 assert.equal(await scalar('select count(*)::int value from internal_academic.technical_manual_banese_reissue_archive'),0);
}));
test('actual first-claim guards reject all36 without fresh consent',()=>isolated(async()=>{
 await confirmAll();await finalize();
 const reset=await q("select receivable_id,authorization_snapshot from internal_financial_correction.items where kind='RESET_C1'");
 for(const r of reset) await rejectsAtomically(()=>db.query(`update public.contas_receber
   set gateway_creation_token=$2,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS'
   where id=$1`,[r.receivable_id,r.authorization_snapshot.request_id]),/CONSENT|autorização/);
 assert.equal(await scalar("select count(*)::int value from public.contas_receber where gateway_creation_token is not null"),0);
}));
test('actual archive mutation trigger protects canceled banking history',()=>isolated(async()=>{
 await confirmAll();await finalize();
 await rejectsAtomically(()=>db.exec('delete from internal_academic.technical_manual_banese_reissue_archive'),/imutável/);
 assert.equal(await scalar('select count(*)::int value from internal_academic.technical_manual_banese_reissue_archive'),36);
}));

const preview=(enrollment=uid(6))=>invoke('public.preview_bounded_financial_correction_secure',[operation,enrollment]);
const consent=(enrollment,batch,fingerprint)=>invoke('public.consent_bounded_financial_correction_secure',
 [operation,enrollment,batch,fingerprint]);
test('new real-user consent creates12 fresh per-title keys; same-batch replay is exact',()=>isolated(async()=>{
 await confirmAll();await finalize();await db.exec("set local test.jwt.role='authenticated'");
 const p=await preview(); assert.equal(p.status,'WAITING_CONSENT');assert.equal(p.installments.length,12);
 assert.equal(p.localFeeDisposition,'PRESERVED_PAID');
 const result=await consent(uid(6),uid(88001),p.fingerprint);assert.equal(result.replayed,false);
 const authorized=await preview();
 await writeFile(new URL('../../tmp/actual-consented-sql-preview.json',import.meta.url),JSON.stringify(authorized,null,2));
 assert.equal(authorized.status,'READY');assert.equal(authorized.consent.consented,true);
 assert.equal(authorized.cycleContext.ciclo.quantidadeItens,12);
 assert.equal(authorized.cycleContext.ciclo.quantidadeBancaria,12);
 assert.equal(authorized.cycleContext.ciclo.recebiveis.every(r=>r.tipo==='PARCELA'),true);
 assert.equal(Object.keys(authorized.authorizationRequestIds).length,12);
 for(const r of await q("select * from internal_financial_correction.items where matricula_id=$1 and kind='RESET_C1'",[uid(6)])) {
  assert.notEqual(r.consent_request_id,r.authorization_snapshot.request_id);
  assert.match(r.consent_request_id,/^[0-9a-f-]{14}4[0-9a-f-]{21}$/);
  assert.equal(r.consent_actor_id,actor);
 }
 const exact=await rows('internal_academic.technical_manual_receivable_issuance_authorizations');
 assert.equal((await consent(uid(6),uid(88001),p.fingerprint)).replayed,true);
 assert.deepEqual(await rows('internal_academic.technical_manual_receivable_issuance_authorizations'),exact);
 assert.equal((await preview(uid(7))).status,'WAITING_CONSENT');
 assert.equal((await preview(uid(8))).status,'WAITING_CONSENT');
}));
test('wrong actor cannot replay a different real actor consent',()=>isolated(async()=>{
 await confirmAll();await finalize();await db.exec("set local test.jwt.role='authenticated'");
 const p=await preview();await consent(uid(6),uid(88002),p.fingerprint);
 const other=uid(90001);
 await db.query('insert into auth.users values($1)',[other]);
 await db.query(`insert into public.usuarios_sistema select (jsonb_populate_record(null::public.usuarios_sistema,
  to_jsonb(u)||jsonb_build_object('id',$1::text,'auth_user_id',$1::text))).* from public.usuarios_sistema u where auth_user_id=$2`,[other,actor]);
 await db.exec(`set local test.actor='${other}'`);
 await rejectsAtomically(()=>consent(uid(6),uid(88002),p.fingerprint),/REPLAY_CONFLICT/);
}));
test('fresh consent unlocks canonical first-claim only for that enrollment',()=>isolated(async()=>{
 await confirmAll();await finalize();await db.exec("set local test.jwt.role='authenticated'");
 const p=await preview();await consent(uid(6),uid(88003),p.fingerprint);
 const targets=await q("select * from internal_financial_correction.items where kind='RESET_C1' order by receivable_id");
 for(const item of targets) {
  const update=()=>db.query(`update public.contas_receber set gateway_creation_token=$2,
   gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' where id=$1`,
   [item.receivable_id,item.consent_request_id??item.authorization_snapshot.request_id]);
  if(item.matricula_id===uid(6)) await update();else await rejectsAtomically(update,/CONSENT/);
 }
 assert.equal(await scalar('select count(*)::int value from public.contas_receber where gateway_creation_token is not null'),12);
 assert.equal(await scalar(`select count(*)::int value from internal_academic.technical_manual_receivable_issuance_authorizations
  where matricula_id=$1 and cycle_number=1 and first_claimed_at is not null and claim_count=1`,[uid(6)]),12);
}));
test('generic old deterministic authorization replay cannot unlock corrected receipts',()=>isolated(async()=>{
 await confirmAll();await finalize();await db.exec("set local test.jwt.role='authenticated'");
 const item=(await q("select * from internal_financial_correction.items where kind='RESET_C1' order by receivable_id limit 1"))[0];
 await rejectsAtomically(()=>invoke('public.authorize_technical_manual_receivable_issuance_secure',
  [item.receivable_id,item.authorization_snapshot.request_id]),/Replay|CONSENT|autorização/);
 assert.equal(await scalar('select count(*)::int value from internal_financial_correction.items where consent_at is not null'),0);
}));
test('all5 waived LOCAL titles satisfy exact canonical local-fee proof including other enrollments',()=>isolated(async()=>{
 await confirmAll();await finalize();
 for(const id of localIds) {
  assert.equal(await scalar('select internal_financial_correction.local_waiver_complete(r) value from public.contas_receber r where id=$1',[id]),true);
  assert.equal(await scalar('select internal_academic.manual_cycle_local_receivable_complete(r) value from public.contas_receber r where id=$1',[id]),true);
 }
 assert.equal(await scalar('select internal_financial_correction.local_waiver_complete(r) value from public.contas_receber r where id=$1',[paidLocal]),false);
 for(const enrollment of [uid(9),uid(10),uid(11)]) {
  const summary=await invoke('internal_academic.manual_cycle_local_fee_summary',[enrollment]);
  assert.equal(summary.localFeeWaiverProven,true);
 }
}));
test('private dispatch only records exact bank target and existing worker auth in local recorder',()=>isolated(async()=>{
 await prepare();
 const result=await invoke('internal_financial_correction.dispatch_cancel_item',[operation,bankIds[0],manifest.fingerprint]);
 assert.equal(result.queued,true);
 const [record]=await q('select * from net.mock_requests');
 assert.equal(record.body.receivableId,bankIds[0]);assert.equal(record.body.action,'cancel_approved_financial_correction_item');
 assert.equal(record.body.manifestFingerprint,manifest.fingerprint);
 await rejectsAtomically(()=>invoke('internal_financial_correction.dispatch_cancel_item',
  [operation,localIds[0],manifest.fingerprint]),/BANK_TARGET/);
 await rejectsAtomically(()=>invoke('internal_financial_correction.dispatch_cancel_item',
  [operation,bankIds[0],manifest.fingerprint]),/ALREADY_PENDING/);
 assert.equal(await scalar('select count(*)::int value from net.mock_requests'),1);
}));
test('new-operation and queue fences reject racing work while preserving incoming payment evidence',()=>isolated(async()=>{
 await prepare();
 await rejectsAtomically(()=>db.query('insert into public.receivable_manual_settlements(id,receivable_id) values($1,$2)',[uid(99001),bankIds[0]]),/OTHER_OPERATION_FENCED/);
 await rejectsAtomically(()=>db.query("update public.banese_reconciliation_queue set state='LEASED' where receivable_id=$1",[bankIds[0]]),/RECONCILIATION_FENCED/);
 await db.query("update public.banese_reconciliation_queue set state='READY' where receivable_id=$1",[bankIds[0]]);
 assert.equal(await scalar('select state value from public.banese_reconciliation_queue where receivable_id=$1',[bankIds[0]]),'DONE');
 await db.query("update public.contas_receber set status='PAGO',valor_pago=279.9,data_pagamento=current_date where id=$1",[bankIds[0]]);
 await db.query("update public.banese_reconciliation_queue set state='LEASED' where receivable_id=$1",[bankIds[0]]);
 assert.equal(await scalar('select state value from public.banese_reconciliation_queue where receivable_id=$1',[bankIds[0]]),'LEASED');
}));
test('actual global canceled-number guard forbids reusing old Nosso Numero after fresh consent',()=>isolated(async()=>{
 await confirmAll();await finalize();await db.exec("set local test.jwt.role='authenticated'");
 const p=await preview();await consent(uid(6),uid(88004),p.fingerprint);
 const item=(await q("select * from internal_financial_correction.items where matricula_id=$1 and kind='RESET_C1' order by receivable_id limit 1",[uid(6)]))[0];
 await rejectsAtomically(()=>db.query('update public.contas_receber set gateway_boleto_nosso_numero=$2 where id=$1',
  [item.receivable_id,item.identity_snapshot.nossoNumero]),/cancelado não pode ser reutilizado/);
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
test('actual atomic completion and persist issue all36 mock BolePix on same IDs with fresh terms',()=>isolated(async()=>{
 const paidBefore=await q('select to_jsonb(r) value from public.contas_receber r where id=$1',[paidLocal]);
 const ledgerBefore=await q('select to_jsonb(s) value from public.receivable_manual_settlements s where receivable_id=$1',[paidLocal]);
 assert.equal(ledgerBefore.length,1);
 assert.equal(await scalar('select internal_academic.manual_cycle_local_receivable_complete(r) value from public.contas_receber r where id=$1',[paidLocal]),true);
 await confirmAll();await finalize();await db.exec("set local test.jwt.role='authenticated'");
 assert.equal(await scalar(`select count(*)::int value from internal_financial_correction.items local
   where local.kind='LOCAL_WAIVER' and exists(select 1 from internal_financial_correction.items bank
    where bank.kind='RESET_C1' and bank.matricula_id=local.matricula_id)`),2);
 assert.equal(await scalar(`select count(*)::int value from internal_financial_correction.items local
   where local.kind='LOCAL_WAIVER' and not exists(select 1 from internal_financial_correction.items bank
    where bank.kind='RESET_C1' and bank.matricula_id=local.matricula_id)`),3);
 assert.equal(await scalar(`select count(*)::int value from internal_financial_correction.items bank
   join public.contas_receber paid on paid.matricula_id=bank.matricula_id
   where bank.kind='CANCEL_C2' and paid.id=$1`,[paidLocal]),13);

 for(const [index,enrollment] of [uid(6),uid(7),uid(8)].entries()) {
  const p=await preview(enrollment);await consent(enrollment,uid(89000+index),p.fingerprint);
 }
 const items=await q("select * from internal_financial_correction.items where kind='RESET_C1' order by receivable_id");
 const runs=await rows('internal_academic.technical_manual_cycle_runs');
 for(const [index,item] of items.entries()) {
  const number=String(900000000+index);
  await db.query(`update public.contas_receber set gateway_creation_token=$2,gateway_status='CREATING',
   gateway_boleto_nosso_numero=$3,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS'
   where id=$1`,[item.receivable_id,item.consent_request_id,number]);
  const payload=syntheticBankResult(number,item.corrected_terms);
  await db.exec("set local test.jwt.role='service_role'");
  const result=await invoke('public.persist_technical_manual_cycle_banese_issuance',
   [item.receivable_id,item.consent_request_id,item.consent_request_id,payload]);
  assert.equal(result.success,true);
  assert.equal(await scalar('select internal_academic.technical_manual_banese_receivable_complete(r) value from public.contas_receber r where id=$1',[item.receivable_id]),true);
  const replay=await invoke('public.persist_technical_manual_cycle_banese_issuance',
   [item.receivable_id,item.consent_request_id,item.consent_request_id,payload]);assert.equal(replay.replayed,true);
 }
 assert.deepEqual(await rows('internal_academic.technical_manual_cycle_runs'),runs);
 assert.equal(await scalar("select count(*)::int value from internal_academic.technical_manual_banese_reissue_archive"),36);
 assert.equal(await scalar("select count(*)::int value from public.payment_gateway_transactions where remote_status='PENDING'"),36);
 for(const enrollment of [uid(6),uid(7),uid(8)]) {
  const p=await preview(enrollment);assert.equal(p.status,'COMPLETE');assert.equal(p.cycleContext.ciclo.emitidosBanese,12);
  assert.equal(p.cycleContext.ciclo.total,'3358.80');
  assert.equal(p.localFeeDisposition,enrollment===uid(6)?'PRESERVED_PAID':'WAIVED');
  assert.equal(p.cycleContext.ciclo.recebiveis.every(r=>r.emissaoBanese==='EMITIDO'),true);
 }
 assert.deepEqual(await q('select to_jsonb(r) value from public.contas_receber r where id=$1',[paidLocal]),paidBefore);
 assert.deepEqual(await q('select to_jsonb(s) value from public.receivable_manual_settlements s where receivable_id=$1',[paidLocal]),ledgerBefore);
 assert.equal(await scalar('select internal_academic.manual_cycle_local_receivable_complete(r) value from public.contas_receber r where id=$1',[paidLocal]),true);
 assert.equal(await scalar('select manual_settlement_reversed_at value from public.contas_receber where id=$1',[paidLocal]),null);
}));
test('actual atomic completion refuses direct registered state without canonical persist transaction',()=>isolated(async()=>{
 await confirmAll();await finalize();await db.exec("set local test.jwt.role='authenticated'");
 const p=await preview();await consent(uid(6),uid(89500),p.fingerprint);
 const item=(await q("select * from internal_financial_correction.items where matricula_id=$1 and kind='RESET_C1' order by receivable_id limit 1",[uid(6)]))[0];
 await rejectsAtomically(()=>db.query("update public.contas_receber set gateway_submission_status='API_REGISTERED' where id=$1",[item.receivable_id]),/Conclusão BolePix/);
}));
test('late archive conflict rolls back earlier resets, local waivers, jobs and transaction detaches',()=>isolated(async()=>{
 await confirmAll();
 const last=(await q("select identity_snapshot from internal_financial_correction.items where kind='RESET_C1' order by receivable_id desc limit 1"))[0].identity_snapshot;
 await db.query('insert into public.banese_ead_title_replacement_archive values($1,$2,$3)',
  [last.environment,last.convenio,last.nossoNumero]);
 const receipts=await rows('public.contas_receber'),transactions=await rows('public.payment_gateway_transactions');
 await rejectsAtomically(finalize,/arquivado no fluxo EAD/);
 assert.deepEqual(await rows('public.contas_receber'),receipts);
 assert.deepEqual(await rows('public.payment_gateway_transactions'),transactions);
 assert.equal(await scalar('select count(*)::int value from internal_academic.technical_manual_banese_reissue_jobs'),0);
 assert.equal(await scalar('select count(*)::int value from internal_academic.technical_manual_banese_reissue_archive'),0);
 assert.equal(await scalar("select count(*)::int value from internal_financial_correction.items where state='FINALIZED'"),0);
}));
test('actual issuance-progress projection preserves original13 items and subtracts only approved waiver',()=>isolated(async()=>{
 await confirmAll();await finalize();
 for(const enrollment of [uid(6),uid(7),uid(8)]) {
  const progress=await invoke('internal_academic.manual_cycle_issuance_progress',[enrollment,1]);
  assert.equal(progress.ciclo.quantidadeItens,13);
  assert.equal(progress.ciclo.quantidadeBancaria,12);assert.equal(progress.ciclo.quantidadeLocal,1);
  assert.equal(progress.ciclo.total,'3558.80');
  assert.equal(progress.ciclo.activeTotal,enrollment===uid(6)?'3558.80':'3358.80');
  const [local]=progress.ciclo.recebiveis.filter(r=>r.destinoCobranca==='LOCAL');
  assert.equal(local.localFeeWaiverProven,enrollment!==uid(6));
  assert.equal(local.status,enrollment===uid(6)?'PAGO':'CANCELADO');
  assert.equal(progress.ciclo.recebiveis.filter(r=>r.tipo==='PARCELA').length,12);
 }
}));
