// ONLY the dedicated GitHub Actions postgres:17 service, with synthetic fixtures.
// Never loads .env, service keys, connection URLs, pgpass, or production data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,relative} from 'node:path';
import {loadIntegrationDatabase} from './bounded-integration-setup.mjs';
import {actor,operation,bankIds,localIds,uid} from './bounded-seed.mjs';

assert.equal(process.env.GITHUB_ACTIONS,'true','Requires GitHub Actions ephemeral service');
assert.equal(process.env.BOUNDED_EPHEMERAL_POSTGRES,'synthetic-postgres-17-only');
assert.ok(process.env.RUNNER_TEMP,'Requires GitHub runner temp');
const deps=resolve(process.env.BOUNDED_PG_MODULE ?? '');
const relativeDeps=relative(resolve(process.env.RUNNER_TEMP),deps);
assert.ok(relativeDeps && !relativeDeps.startsWith('..') && !relativeDeps.startsWith('/'));
// Ignore connection-related process environment by passing every connection field.
const {Client}=createRequire(import.meta.url)(deps);
const config={host:'127.0.0.1',port:5432,user:'bounded_ci',
 password:'synthetic_ephemeral_ci_only',database:'bounded_correction_ci',ssl:false,
 connectionTimeoutMillis:10000,query_timeout:25000,statement_timeout:20000,
 lock_timeout:15000,application_name:'bounded-synthetic-concurrency'};
const clients=new Set();
async function connect(database=config.database) {
 assert.match(database,/^bounded_correction_ci(?:_case_\d+)?$/);
 const c=new Client({...config,database});
 await c.connect();clients.add(c);
 await c.query(`set test.jwt.role='service_role'; set test.actor='${actor}'`);
 return c;
}
const q=async(c,sql,args=[]) => (await c.query(sql,args)).rows;
const value=async(c,sql,args=[]) => (await q(c,sql,args))[0].value;
const invoke=(c,name,args=[])=>value(c,
 `select ${name}(${args.map((_,n)=>`$${n+1}`).join(',')}) value`,args);
const internal=(c,name,args)=>invoke(c,'internal_financial_correction.'+name,args);
const service=(c,name,args)=>invoke(c,'public.'+name+'_financial_correction_service',args);
const prepare=c=>internal(c,'prepare_operation',
 [operation,actor,bankIds,localIds,'synthetic-concurrent-approval','a'.repeat(64)]);
const approve=(c,m)=>internal(c,'approve_operation',[operation,m.planFingerprint]);
const claim=(c,m)=>service(c,'claim',[operation,bankIds[0],m.fingerprint]);
const scope=(m,lease)=>[operation,bankIds[0],m.fingerprint,lease.leaseToken];
const evidence=lease=>({confirmedAt:new Date().toISOString(),evidenceFingerprint:'b'.repeat(64),
 bankResult:{convenio:lease.item.convenio,nossoNumero:lease.item.nossoNumero,
 situationCode:5,remoteStatus:'CANCELED',alreadyCanceled:true,mutationAttempted:false,
 raw:{CodigoSituacaoBoleto:5},proof:{strictEffectivePayments:true,paymentsCount:0,
 identityValidated:true,termsValidated:true}}});
const finalize=(c,m)=>internal(c,'finalize_operation',[operation,m.planFingerprint]);
async function approved(c) {const m=await prepare(c);await approve(c,m);return m;}
async function confirmed(c) {
 const m=await approved(c);
 for(const id of bankIds) {
  const lease=await service(c,'claim',[operation,id,m.fingerprint]);
  await service(c,'complete',[operation,id,m.fingerprint,lease.leaseToken,evidence(lease)]);
 }
 return m;
}
function pending(promise) {
 // Attach both handlers immediately: a fast unexpected error is never unhandled.
 const state={done:false};
 state.result=promise.then(result=>{state.done=true;return {result};},error=>{
  state.done=true;return {error};});
 return state;
}
async function blocked(observer,waiter,holder,state) {
 const deadline=Date.now()+10000;
 while(Date.now()<deadline) {
  const rows=await q(observer,`select wait_event_type,pg_blocking_pids(pid) blockers
   from pg_stat_activity where pid=$1`,[waiter.processID]);
  if(rows[0]?.wait_event_type==='Lock' && rows[0].blockers.includes(holder.processID)) return;
  if(state.done) {
   const r=await state.result;
   throw new Error(`Expected genuine cross-session lock wait, got ${r.error?.message ?? 'early success'}`);
  }
  // Scheduling yield only; correctness depends on observed server locks, not delay.
  await new Promise(resolve=>setImmediate(resolve));
 }
 throw new Error('Timed out waiting for PostgreSQL lock barrier');
}
async function succeeds(state) {const r=await state.result;if(r.error) throw r.error;return r.result;}
async function rejects(state,pattern) {
 const r=await state.result;assert.ok(r.error,'Expected rejection after the concurrent commit');
 assert.match(r.error.message,pattern);return r.error;
}
const ledger=c=>c.query('insert into public.receivable_manual_settlements(id,receivable_id) values($1,$2)',
 [uid(99001),bankIds[0]]);
const queueClaim=c=>c.query("update public.banese_reconciliation_queue set state='LEASED',lease_run_id=$2,lease_until=clock_timestamp()+interval '1 minute' where receivable_id=$1",
 [bankIds[0],uid(99002)]);
async function unchangedFinalization(c,before) {
 assert.deepEqual(await q(c,'select to_jsonb(r) row from public.contas_receber r order by id'),before);
 assert.equal(await value(c,'select count(*)::int value from internal_academic.technical_manual_banese_reissue_archive'),0);
 assert.equal(await value(c,"select count(*)::int value from internal_financial_correction.items where state='FINALIZED'"),0);
}
let sequence=0;
const admin=await connect();
try {
 const version=await value(admin,"select current_setting('server_version_num')::int value");
 assert.ok(version>=170000 && version<180000,'Expected ephemeral PostgreSQL 17');
 await loadIntegrationDatabase({exec:sql=>admin.query(sql),query:(sql,args)=>admin.query(sql,args)});
 // Baseline becomes an immutable template only after its sole session closes.
 await admin.end();clients.delete(admin);
 const control=new Client({...config,database:'postgres'});
 await control.connect();clients.add(control);
 async function scenario(name,run) {
  const database=`bounded_correction_ci_case_${++sequence}`;
  await control.query(`create database ${database} template bounded_correction_ci`);
  const group=[];
  try {
   for(let n=0;n<3;n++) group.push(await connect(database));
   assert.equal(new Set(group.map(c=>c.processID)).size,3);
   await run(...group);
   console.log(`PASS ${sequence}: ${name}`);
  } finally {
   for(const c of group) {await c.query('rollback').catch(()=>{});await c.end();clients.delete(c);}
   await control.query(`drop database ${database}`);
  }
 }
 await scenario('concurrent operation preparation is one immutable idempotent plan',async(a,b,o)=>{
  await a.query('begin');const first=await prepare(a);
  const second=pending(prepare(b));await blocked(o,b,a,second);await a.query('commit');
  assert.equal((await succeeds(second)).planFingerprint,first.planFingerprint);
  assert.equal(await value(o,'select count(*)::int value from internal_financial_correction.operations'),1);
  assert.equal(await value(o,'select count(*)::int value from internal_financial_correction.items'),54);
 });
 await scenario('two bank claimants cannot own one live lease',async(a,b,o)=>{
  const m=await approved(a);await a.query('begin');const first=await claim(a,m);
  const second=pending(claim(b,m));await blocked(o,b,a,second);await a.query('commit');
  await rejects(second,/LEASE_ACTIVE/);
  assert.equal(await value(o,'select lease_token value from internal_financial_correction.items where receivable_id=$1',[bankIds[0]]),first.leaseToken);
 });
 await scenario('ledger insertion committed first invalidates concurrent approval',async(a,b,o)=>{
  const m=await prepare(a);await a.query('begin');await ledger(a);
  const approval=pending(approve(b,m));await blocked(o,b,a,approval);await a.query('commit');
  await rejects(approval,/PAYMENT_OR_SETTLEMENT_EVIDENCE/);
  assert.equal(await value(o,'select state value from internal_financial_correction.operations'),'PREPARED');
  assert.equal(await value(o,'select count(*)::int value from public.receivable_manual_settlements where receivable_id=$1',[bankIds[0]]),1);
 });
 await scenario('approval committed first fences a waiting ledger insertion',async(a,b,o)=>{
  const m=await prepare(a);await a.query('begin');await approve(a,m);
  const insertion=pending(ledger(b));await blocked(o,b,a,insertion);await a.query('commit');
  await rejects(insertion,/OTHER_OPERATION_FENCED/);
  assert.equal(await value(o,'select count(*)::int value from public.receivable_manual_settlements where receivable_id=$1',[bankIds[0]]),0);
 });
 await scenario('durable intent fences concurrent new settlement operation',async(a,b,o)=>{
  const m=await approved(a);const lease=await claim(a,m);
  await a.query('begin');await service(a,'start',scope(m,lease));
  const insertion=pending(ledger(b));await blocked(o,b,a,insertion);await a.query('commit');
  await rejects(insertion,/OTHER_OPERATION_FENCED/);
  assert.equal(await value(o,'select state value from internal_financial_correction.items where receivable_id=$1',[bankIds[0]]),'INTENT');
 });
 await scenario('queue lease committed first invalidates waiting approval',async(a,b,o)=>{
  const m=await prepare(a);await a.query('begin');await queueClaim(a);
  const approval=pending(approve(b,m));await blocked(o,b,a,approval);await a.query('commit');
  await rejects(approval,/RECONCILIATION_IN_PROGRESS/);
  assert.equal(await value(o,'select state value from internal_financial_correction.operations'),'PREPARED');
  assert.equal(await value(o,'select state value from public.banese_reconciliation_queue where receivable_id=$1',[bankIds[0]]),'LEASED');
 });
 await scenario('approval committed first fences a waiting queue claim',async(a,b,o)=>{
  const m=await prepare(a);await a.query('begin');await approve(a,m);
  const queued=pending(queueClaim(b));await blocked(o,b,a,queued);await a.query('commit');
  await rejects(queued,/RECONCILIATION_FENCED/);
  assert.equal(await value(o,'select state value from public.banese_reconciliation_queue where receivable_id=$1',[bankIds[0]]),'DONE');
 });
 await scenario('delayed evidence loses to a committed replacement lease',async(a,b,o)=>{
  const m=await approved(a),old=await claim(a,m);
  await service(a,'start',scope(m,old));
  await a.query("update internal_financial_correction.items set lease_until=clock_timestamp()-interval '1 second' where receivable_id=$1",[bankIds[0]]);
  await a.query('begin');const fresh=await claim(a,m);assert.equal(fresh.mode,'CONFIRM_ONLY');
  const completion=pending(service(b,'complete',[...scope(m,old),evidence(old)]));
  await blocked(o,b,a,completion);await a.query('commit');await rejects(completion,/LEASE_MISMATCH/);
  assert.notEqual(fresh.leaseToken,old.leaseToken);
  await service(b,'complete',[...scope(m,fresh),evidence(fresh)]);
  assert.equal(await value(o,'select state value from internal_financial_correction.items where receivable_id=$1',[bankIds[0]]),'BANK_CONFIRMED');
 });
 await scenario('concurrent source-run drift aborts the whole internal finalization',async(a,b,o)=>{
  const m=await confirmed(a);
  const before=await q(o,'select to_jsonb(r) row from public.contas_receber r order by id');
  await a.query('begin');
  await a.query('update internal_academic.technical_manual_cycle_runs set total_amount=999 where $1=any(receivable_ids)',[bankIds[0]]);
  const finishing=pending(finalize(b,m));await blocked(o,b,a,finishing);await a.query('commit');
  await rejects(finishing,/SNAPSHOT_IDENTITY_CHANGED/);await unchangedFinalization(o,before);
 });
 await scenario('competing consent batches cannot rotate fresh authorization twice',async(a,b,o)=>{
  const m=await confirmed(a);await finalize(a,m);
  for(const c of [a,b]) await c.query("set test.jwt.role='authenticated'");
  const preview=await invoke(a,'public.preview_bounded_financial_correction_secure',[operation,uid(6)]);
  const consent=(c,id)=>invoke(c,'public.consent_bounded_financial_correction_secure',[operation,uid(6),id,preview.fingerprint]);
  await a.query('begin');const first=await consent(a,uid(88001));assert.equal(first.replayed,false);
  const competing=pending(consent(b,uid(88002)));await blocked(o,b,a,competing);
  await a.query('commit');await rejects(competing,/CONSENT_REPLAY_CONFLICT|STALE_CONSENT_PREVIEW/);
  const saved=await q(o,"select consent_batch_id,consent_request_id from internal_financial_correction.items where matricula_id=$1 and kind='RESET_C1'",[uid(6)]);
  assert.equal(saved.length,12);assert.ok(saved.every(r=>r.consent_batch_id===uid(88001)));
  assert.equal(new Set(saved.map(r=>r.consent_request_id)).size,12);
  assert.equal((await consent(b,uid(88001))).replayed,true);
  assert.deepEqual(await q(o,"select consent_batch_id,consent_request_id from internal_financial_correction.items where matricula_id=$1 and kind='RESET_C1'",[uid(6)]),saved);
 });
 console.log(`Verified ${sequence} independent-session synthetic PostgreSQL concurrency scenarios.`);
} finally {
 for(const c of clients) await c.end().catch(()=>{});
}
