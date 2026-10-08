import test,{before,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {integrationSetupUrl} from './fixture-paths.mjs';
import {createFeeDatabase,inputFor,executeCandidate,guardState,protectedState,rows,scalar,q,invoke,
 actor,operation,paidLocal,settlementId,uid} from './fee-reversal-setup.mjs';
const require=createRequire(integrationSetupUrl);
const {PGlite}=require('@electric-sql/pglite');
let image,db;
before(async()=>{const fixture=await createFeeDatabase({proof:true});image=await fixture.db.dumpDataDir();await fixture.db.close();});
beforeEach(async()=>{db=new PGlite({loadDataDir:image});await db.waitReady;});
afterEach(async()=>{await db?.close();});
const maintenance=()=>db.exec("reset role;set test.jwt.role='';set test.actor='';");
const authenticated=()=>db.exec(`set test.jwt.role='authenticated';set test.actor='${actor}';`);
const fee=()=>scalar(db,'select to_jsonb(r) value from public.contas_receber r where id=$1',[paidLocal]);
const ledger=()=>scalar(db,'select to_jsonb(s) value from public.receivable_manual_settlements s where id=$1',[settlementId]);
const reversalCount=()=>scalar(db,"select count(*)::integer value from public.receivable_manual_settlement_events where event_type='LOCAL_SETTLEMENT_REVERSED'");
const isWaived=()=>scalar(db,'select internal_financial_correction.local_waiver_complete(r) value from public.contas_receber r where id=$1',[paidLocal]);
async function entireState(){return {protected:await protectedState(db),receipts:await rows(db,'public.contas_receber'),ledger:await rows(db,'public.receivable_manual_settlements'),events:await rows(db,'public.receivable_manual_settlement_events'),guards:await guardState(db)};}
async function assertClean(){
 assert.equal(await scalar(db,"select to_regprocedure('internal_financial_correction._control_reversal_transition(public.contas_receber,public.contas_receber)')::text value"),null);
 for(const role of ['anon','authenticated','service_role']) {
  assert.equal(await scalar(db,"select has_function_privilege($1,'internal_financial_correction.reversed_control_waiver_complete(public.contas_receber)','execute') value",[role]),false);
 }
}
async function rejected(input,pattern){
 const before=await entireState();
 await maintenance();await assert.rejects(()=>executeCandidate(db,input),pattern);
 assert.deepEqual(await entireState(),before);await assertClean();
}
test('success preserves exact historical snapshots, all36 corrected receipts,168 unrelated, runs/auth/consent',async()=>{
 const input=await inputFor(db),before=await protectedState(db),guards=await guardState(db);
 const events=await rows(db,'public.receivable_manual_settlement_events');
 await maintenance();await executeCandidate(db,input);
 const r=await fee(),s=await ledger();
 assert.equal(s.state,'REVERSED');assert.equal(r.status,'CANCELADO');assert.equal(await isWaived(),true);
 assert.equal(r.manual_settlement_id,settlementId);assert.equal(r.manual_settlement_reversed_at,s.reversed_at);
 assert.equal(r.valor,200);assert.equal(r.valor_pago,null);assert.equal(r.data_pagamento,null);
 const changed=new Set(['status','conta_bancaria_id','valor_pago','data_pagamento','forma_pagamento','origem_pagamento','manual_settlement_reversed_at','updated_at']);
 assert.deepEqual(Object.fromEntries(Object.entries(r).filter(([k])=>!changed.has(k))),Object.fromEntries(Object.entries(input.expectedReceipt).filter(([k])=>!changed.has(k))));
 const ledgerChanged=new Set(['state','reversed_at','updated_at']);
 assert.deepEqual(Object.fromEntries(Object.entries(s).filter(([k])=>!ledgerChanged.has(k))),Object.fromEntries(Object.entries(input.expectedSettlement).filter(([k])=>!ledgerChanged.has(k))));
 const [e]=await q(db,"select * from public.receivable_manual_settlement_events where event_type='LOCAL_SETTLEMENT_REVERSED'");
 assert.deepEqual(e.details.receiptBefore,input.expectedReceipt);assert.deepEqual(e.details.settlementBefore,input.expectedSettlement);assert.deepEqual(e.details.runBefore,input.expectedRun);
 assert.equal(e.actor_id,uid(3));assert.equal(e.details.actorRole,'APPROVER');assert.equal(e.details.executionActorKind,'SERVICE_MAINTENANCE');assert.equal(e.details.moneyMoved,false);
 assert.equal(e.details.operation,'REVERSED_CONTROL_AND_WAIVED');assert.equal(e.details.authUserId,undefined);
 for(const old of events) assert.ok((await rows(db,'public.receivable_manual_settlement_events')).some(x=>JSON.stringify(x)===JSON.stringify(old)));
 assert.deepEqual(await protectedState(db),before);assert.deepEqual(await guardState(db),guards);await assertClean();
 assert.equal(before['internal_financial_correction.items'].filter(x=>x.value.kind==='RESET_C1').length,36);
 assert.equal(before.otherReceipts.filter(x=>x.value.id>=uid(20000)).length,168);
 await authenticated();const summary=await invoke(db,'public.preview_bounded_financial_correction_secure',[operation,uid(6)]);
 assert.equal(summary.localFeeDisposition,'WAIVED');assert.equal(summary.status,'WAITING_CONSENT');assert.equal(summary.consent.consented,false);
 assert.equal(await scalar(db,'select internal_academic.manual_cycle_local_receivable_complete(r) value from public.contas_receber r where id=$1',[paidLocal]),true);
});
test('same approved event replays without a second event or any row mutation',async()=>{
 const input=await inputFor(db);await maintenance();await executeCandidate(db,input);const first=await entireState();
 await executeCandidate(db,input);assert.equal(await reversalCount(),1);assert.deepEqual(await entireState(),first);await assertClean();
 await rejected({...input,approvalHash:'0'.repeat(64)},/CONTROL_REPLAY_CONFLICT/);
 await rejected({...input,eventId:uid(9101)},/CONTROL_EXACT_FEE_OR_SETTLEMENT_CHANGED/);
});
for(const [label,change,pattern] of [
 ['wrong target ID',i=>{i.expectedReceipt.id=uid(1001);},/CONTROL_EXACT_FEE_OR_SETTLEMENT_CHANGED/],
 ['wrong settlement ID',i=>{i.expectedSettlement.id=uid(9199);},/no rows/],
 ['receipt snapshot drift',i=>{i.expectedReceipt.descricao='tampered';},/CONTROL_EXACT_FEE_OR_SETTLEMENT_CHANGED/],
 ['settlement snapshot drift',i=>{i.expectedSettlement.receivable_snapshot.extra='tampered';},/CONTROL_EXACT_FEE_OR_SETTLEMENT_CHANGED/],
 ['run snapshot drift',i=>{i.expectedRun.total_amount=99;},/CONTROL_RUN_CHANGED/],
 ['wrong approver',i=>{i.approverAuthId=uid(999);},/CONTROL_PARENT_OR_APPROVER_CHANGED/],
 ['wrong parent fingerprint',i=>{i.expectedParentFingerprint='0'.repeat(64);},/CONTROL_PARENT_OR_APPROVER_CHANGED/],
 ['wrong guard definition hash',i=>{i.expectedGuardHash='0'.repeat(32);},/CONTROL_GUARD_BASELINE_DRIFT/],
 ['missing security approval evidence',i=>{i.securityApprovalHash='';},/CONTROL_MAINTENANCE_APPROVAL_REQUIRED/],
]) test(`${label} rejects atomically`,async()=>{const input=await inputFor(db);change(input);await rejected(input,pattern);});
test('new payment amount after review rejects without losing that payment evidence',async()=>{
 const input=await inputFor(db);await db.exec("set test.jwt.role='service_role';");
 await db.query('update public.contas_receber set valor_pago=201 where id=$1',[paidLocal]);
 await rejected(input,/CONTROL_EXACT_FEE_OR_SETTLEMENT_CHANGED/);assert.equal((await fee()).valor_pago,201);
});
test('late failure rolls back patched guard, reversed ledger, event and fee together',async()=>{
 const input=await inputFor(db);
 await db.exec(`create function public.synthetic_reject_cancel() returns trigger language plpgsql as $$begin
  if new.id='${paidLocal}' and new.status='CANCELADO' then raise exception 'SYNTHETIC_LATE_FAILURE';end if;return new;end$$;
 create trigger zz_synthetic_reject_cancel before update on public.contas_receber for each row execute function public.synthetic_reject_cancel();`);
 await rejected(input,/SYNTHETIC_LATE_FAILURE/);assert.equal(await reversalCount(),0);
});
test('authenticated/service claims cannot enter maintenance even with exact approved input',async()=>{
 const input=await inputFor(db),before=await entireState();
 for(const role of ['authenticated','service_role']) {
  await db.exec(`set test.jwt.role='${role}';set test.actor='${actor}';`);
  await assert.rejects(()=>executeCandidate(db,input),/CONTROL_MAINTENANCE_APPROVAL_REQUIRED/);
  assert.deepEqual(await entireState(),before);await assertClean();
 }
});
test('successful operation leaves immutable event history and no user/service mutation route',async()=>{
 const input=await inputFor(db);await maintenance();await executeCandidate(db,input);
 await assert.rejects(()=>db.query('update public.receivable_manual_settlement_events set details=$1 where id=$2',[{},input.eventId]),/imutáveis/);
 await assert.rejects(()=>db.query('delete from public.receivable_manual_settlement_events where id=$1',[input.eventId]),/imutáveis/);
 for(const role of ['anon','authenticated','service_role']) {
  await db.exec(`set role ${role};`);
  await assert.rejects(()=>db.query("update public.receivable_manual_settlements set state='COMPLETED' where id=$1",[settlementId]),/permission denied/);
  await assert.rejects(()=>db.query('select internal_financial_correction._control_reversal_transition(r,r) from public.contas_receber r where id=$1',[paidLocal]),/does not exist|permission denied/);
  await db.exec('reset role');
 }
 await assertClean();
});
test('canonical ordinary authenticated RPC still reverses/replays and never classifies as waived',async()=>{
 const guards=await guardState(db);await authenticated();await db.exec('set role authenticated');
 const result=await invoke(db,'public.estornar_matricula_local_sem_boleto_secure',[paidLocal,settlementId,'synthetic ordinary reversal']);
 assert.equal(result.success,true);assert.equal(result.replayed,false);assert.equal(result.receivable.status,'PENDENTE');
 const replay=await invoke(db,'public.estornar_matricula_local_sem_boleto_secure',[paidLocal,settlementId,'synthetic ordinary reversal']);assert.equal(replay.replayed,true);
 await db.exec('reset role');assert.equal(await isWaived(),false);assert.equal(await reversalCount(),1);assert.deepEqual(await guardState(db),guards);
 assert.equal(await scalar(db,'select internal_academic.manual_cycle_local_reversed_receivable_complete(r) value from public.contas_receber r where id=$1',[paidLocal]),true);
});
async function consent(){
 await authenticated();const p=await invoke(db,'public.preview_bounded_financial_correction_secure',[operation,uid(6)]);
 await invoke(db,'public.consent_bounded_financial_correction_secure',[operation,uid(6),uid(9200),p.fingerprint]);
}
test('existing consented/unissued twelve keys remain exact after fee waiver',async()=>{
 await consent();const input=await inputFor(db),before=await protectedState(db);await maintenance();await executeCandidate(db,input);
 assert.deepEqual(await protectedState(db),before);await authenticated();
 const p=await invoke(db,'public.preview_bounded_financial_correction_secure',[operation,uid(6)]);
 assert.equal(p.status,'READY');assert.equal(p.consent.consented,true);assert.equal(p.localFeeDisposition,'WAIVED');assert.equal(Object.keys(p.authorizationRequestIds).length,12);
});
test('in-flight C1 bank registration prevents fee reversal atomically',async()=>{
 await consent();const [item]=await q(db,"select * from internal_financial_correction.items where matricula_id=$1 and kind='RESET_C1' order by receivable_id",[uid(6)]);
 await db.query("update public.contas_receber set gateway_creation_token=$2,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' where id=$1",[item.receivable_id,item.consent_request_id]);
 const input=await inputFor(db);await rejected(input,/CONTROL_C1_BANK_WORK_IN_FLIGHT/);
});
function bankPayload(number,terms){
 const barcode='0479'+'0'.repeat(26)+number+'0'.repeat(5);
 const line=barcode.slice(0,4)+barcode.slice(19,24)+'0'+barcode.slice(24,34)+'0'+barcode.slice(34,44)+'0'+barcode.slice(4,5)+barcode.slice(5,19);
 return {providerCode:'banese_card',remotePaymentId:number,remoteStatus:'PENDING',issuerPoloId:uid(2),bankSlipOurNumber:number,
 bankSlipBarcode:barcode,bankSlipDigitableLine:line,pixPayload:`000201BR.GOV.BCB.PIX${number}53039865802BR6304ABCD`,
 pixEncodedImage:'data:image/png;base64,iVBORw0KGgo'+'A'.repeat(40),financialTerms:terms,rawPayload:{request:{synthetic:true},response:{synthetic:true}}};
}
for(const completed of [1,12]) test(`${completed}/12 completed C1 issuance stays exact with same consent, terms and keys`,async()=>{
 await consent();const items=await q(db,"select * from internal_financial_correction.items where matricula_id=$1 and kind='RESET_C1' order by receivable_id",[uid(6)]);
 for(const [index,item] of items.slice(0,completed).entries()){
  await authenticated();const number=String(900000000+index);
  await db.query("update public.contas_receber set gateway_creation_token=$2,gateway_status='CREATING',gateway_boleto_nosso_numero=$3,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' where id=$1",[item.receivable_id,item.consent_request_id,number]);
  await db.exec("set test.jwt.role='service_role';");
  const r=await invoke(db,'public.persist_technical_manual_cycle_banese_issuance',[item.receivable_id,item.consent_request_id,item.consent_request_id,bankPayload(number,item.corrected_terms)]);assert.equal(r.success,true);
 }
 const input=await inputFor(db),before=await protectedState(db);await maintenance();await executeCandidate(db,input);assert.deepEqual(await protectedState(db),before);
 await authenticated();const p=await invoke(db,'public.preview_bounded_financial_correction_secure',[operation,uid(6)]);
 assert.equal(p.status,completed===12?'COMPLETE':'PARTIAL');assert.equal(p.localFeeDisposition,'WAIVED');assert.equal(p.cycleContext.ciclo.emitidosBanese,completed);
});

for(const [name,sql] of [
 ['ledger result',"update public.receivable_manual_settlements set result=result||'{\"laterObservation\":true}' where id=$1"],
 ['ledger reversed state',"update public.receivable_manual_settlements set state='REVERSED',reversed_at=clock_timestamp() where id=$1"],
]) test(`actual ${name} drift after review is preserved by atomic rejection`,async()=>{
 const input=await inputFor(db);await db.query(sql,[settlementId]);
 await rejected(input,/CONTROL_EXACT_FEE_OR_SETTLEMENT_CHANGED/);
});
test('actual receipt observation drift after review is preserved by atomic rejection',async()=>{
 const input=await inputFor(db);await db.query("update public.contas_receber set descricao='new observation after review' where id=$1",[paidLocal]);
 await rejected(input,/CONTROL_EXACT_FEE_OR_SETTLEMENT_CHANGED/);
});
