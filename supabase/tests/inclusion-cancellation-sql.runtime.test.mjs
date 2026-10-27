import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const base=process.env.INCLUSION_BASE_REPO || fileURLToPath(new URL('../../',import.meta.url));
const {loadIntegrationDatabase}=await import(`${base}/supabase/tests/bounded-integration-setup.mjs`);
const {actor,uid}=await import(`${base}/supabase/tests/bounded-seed.mjs`);
let db,ids,manifest,claim;
const op=uid(80001),enrollment=uid(6),cycleRequest=uid(512);
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[]) => (await q(sql,args))[0].value;
const invoke=(name,args=[])=>scalar(`select ${name}(${args.map((_,n)=>`$${n+1}`).join(',')}) value`,args);
const call=(name,args=[])=>invoke(`public.${name}_inclusion_cancellation_service`,args);
const priv=(name,args=[])=>invoke(`internal_inclusion_cancellation.${name}`,args);
const scope=()=>[op,claim.item.receivableId,manifest.fingerprint,claim.leaseToken];
const evidence=(already=true)=>({confirmedAt:new Date().toISOString(),evidenceFingerprint:'b'.repeat(64),
 bankResult:{convenio:claim.item.convenio,nossoNumero:claim.item.nossoNumero,situationCode:5,
 remoteStatus:'CANCELED',alreadyCanceled:already,mutationAttempted:!already,raw:{CodigoSituacaoBoleto:5},
 proof:{strictEffectivePayments:true,paymentsCount:0,identityValidated:true,termsValidated:true}}});
async function prepare(approve=true){
 manifest=await priv('prepare_operation',[op,enrollment,2,cycleRequest,ids,
  'Synthetic erroneous inclusion cancellation','synthetic-owner-approval','a'.repeat(64)]);
 if(approve) await priv('approve_operation',[op,manifest.planFingerprint]);
 return manifest;
}
async function isolated(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function rejects(fn,pattern){await db.exec('savepoint expected_error');try{await assert.rejects(fn,pattern);}
 finally{await db.exec('rollback to expected_error; release expected_error');}}
const snapshot=table=>q(`select to_jsonb(x) row from ${table} x order by to_jsonb(x)::text`);
before(async()=>{
 const {PGlite}=await import(process.env.INCLUSION_PGLITE_MODULE || '@electric-sql/pglite');
 db=await loadIntegrationDatabase(new PGlite());
 // Newer ledger tables are shape fixtures, not a claim of full production schema.
 await db.exec(`create schema if not exists internal_receivable_payments;
 create table if not exists internal_receivable_payments.attempts(id uuid primary key,receivable_id uuid,state text);
 create table if not exists public.financial_payment_events(id uuid primary key,source_kind text,source_id uuid);
 create table if not exists public.banese_ead_title_replacement_archive(id uuid primary key,environment text,convenio text,canceled_nosso_numero text);
 create table if not exists internal_financial_correction.normal_cycle_reset_archive(id uuid primary key,bank_environment text,bank_convenio text,canceled_nosso_numero text);`);

 for(const file of ['20261027183200_inclusion_cancel_only_storage_prepare.sql','20261027183201_inclusion_cancel_only_guards_runtime.sql','20261027183202_inclusion_cancel_only_completion_fences.sql','20261027183203_inclusion_cancel_only_dispatch.sql','20261027183205_inclusion_cancel_only_receipt_ledger_guards.sql'])
  await db.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 ids=(await q('select receivable_ids from internal_academic.technical_manual_cycle_runs where matricula_id=$1 and cycle_number=2',[enrollment]))[0].receivable_ids;
});
after(async()=>await db?.close());
test('exact whole native run and immutable full-plan approval',()=>isolated(async()=>{
 await prepare(false);assert.equal(manifest.items.length,13);
 assert.equal(createHash('sha256').update(manifest.canonicalText).digest('hex'),manifest.fingerprint);
 await rejects(()=>call('load',[op]),/NOT_APPROVED/);
 await rejects(()=>priv('approve_operation',[op,manifest.fingerprint]),/PLAN_CHANGED/);
 await priv('approve_operation',[op,manifest.planFingerprint]);
 assert.equal((await call('load',[op])).state,'APPROVED');
 await rejects(()=>db.query("update internal_inclusion_cancellation.operations set reason='another reason' where id=$1",[op]),/IMMUTABLE/);
}));
test('partial run, wrong enrollment and mismatched replay are refused',()=>isolated(async()=>{
 await rejects(()=>priv('prepare_operation',[op,enrollment,2,cycleRequest,ids.slice(1),'Synthetic reason long','synthetic-approval','a'.repeat(64)]),/EXACT_NATIVE_RUN/);
 await rejects(()=>priv('prepare_operation',[op,uid(987),2,cycleRequest,ids,'Synthetic reason long','synthetic-approval','a'.repeat(64)]),/SCOPE_NOT_FOUND/);
 await prepare();
 await rejects(()=>priv('prepare_operation',[op,enrollment,2,cycleRequest,ids,'Different synthetic reason','synthetic-owner-approval','a'.repeat(64)]),/IDEMPOTENCY/);
}));
test('fresh confirmations cancel 13 only, preserve IDs, bank identity, run, authorization and academic history',()=>isolated(async()=>{
 const runs=await snapshot('internal_academic.technical_manual_cycle_runs');
 const auth=await snapshot('internal_academic.technical_manual_receivable_issuance_authorizations');
 const academic=await snapshot('public.matriculas');
 const outsiders=await q('select to_jsonb(r) row from contas_receber r where not(id=any($1::uuid[])) order by id',[ids]);
 const keys=await q('select id,gateway_payment_id,gateway_boleto_nosso_numero from contas_receber order by id');
 await prepare();
 for(const id of ids){claim=await call('claim',[op,id,manifest.fingerprint]);await call('complete',[...scope(),evidence()]);}
 assert.equal((await call('load',[op])).state,'COMPLETE');
 assert.equal(await scalar("select count(*)::int value from contas_receber where id=any($1::uuid[]) and status='CANCELADO' and gateway_status='CANCELED'",[ids]),13);
 assert.deepEqual(await snapshot('internal_academic.technical_manual_cycle_runs'),runs);
 assert.deepEqual(await snapshot('internal_academic.technical_manual_receivable_issuance_authorizations'),auth);
 assert.deepEqual(await snapshot('public.matriculas'),academic);
 assert.deepEqual(await q('select to_jsonb(r) row from contas_receber r where not(id=any($1::uuid[])) order by id',[ids]),outsiders);
 assert.deepEqual(await q('select id,gateway_payment_id,gateway_boleto_nosso_numero from contas_receber order by id'),keys);
 assert.equal((await call('claim',[op,ids[0],manifest.fingerprint])).mode,'COMPLETE');
}));
test('intent is durable, repeated PUT is forbidden, uncertain completion resumes confirm-only',()=>isolated(async()=>{
 await prepare();claim=await call('claim',[op,ids[0],manifest.fingerprint]);
 await call('start',scope());
 await rejects(()=>call('start',scope()),/INTENT_LEASE_OR_REPLAY/);
 await call('review',[...scope(),'REMOTE_AMBIGUOUS']);
 claim=await call('claim',[op,ids[0],manifest.fingerprint]);assert.equal(claim.mode,'CONFIRM_ONLY');
 await rejects(()=>call('start',scope()),/INTENT_LEASE_OR_REPLAY/);
 await call('complete',[...scope(),evidence(true)]);
}));
test('paid or partial evidence blocks before claim and post-GET before intent',()=>isolated(async()=>{
 await prepare();claim=await call('claim',[op,ids[0],manifest.fingerprint]);
 await db.query('update contas_receber set valor_pago=0.01 where id=$1',[ids[0]]);
 await rejects(()=>call('start',scope()),/PAYMENT_OR_SETTLEMENT/);
 await call('review',[...scope(),'REMOTE_OR_GUARD_REVIEW']);
 assert.equal(await scalar('select valor_pago value from contas_receber where id=$1',[ids[0]]),'0.01');
}));
test('wrong target, active lease, missing bank proof and stale proof cannot mutate',()=>isolated(async()=>{
 await prepare();await rejects(()=>call('claim',[op,uid(20000),manifest.fingerprint]),/OUTSIDE_MANIFEST/);
 claim=await call('claim',[op,ids[0],manifest.fingerprint]);
 await rejects(()=>call('claim',[op,ids[0],manifest.fingerprint]),/LEASE_ACTIVE/);
 await rejects(()=>call('complete',[...scope(),{}]),/EVIDENCE_MISSING/);
 const old=evidence();old.confirmedAt='2020-01-01T00:00:00Z';
 await rejects(()=>call('complete',[...scope(),old]),/BANK_CONFIRMATION_INVALID/);
 assert.equal(await scalar('select status value from contas_receber where id=$1',[ids[0]]),'PENDENTE');
}));
test('approved scope fences reconciliation, local settlement, reissue and identity changes',()=>isolated(async()=>{
 await prepare();
 await rejects(()=>db.query("update banese_reconciliation_queue set state='LEASED',lease_run_id=$2 where receivable_id=$1",[ids[0],uid(889)]),/RECONCILIATION_FENCED/);
 await rejects(()=>db.query('insert into receivable_manual_settlements(id,receivable_id) values($1,$2)',[uid(899),ids[0]]),/OTHER_OPERATION_FENCED/);
 await rejects(()=>db.query('update contas_receber set valor=1 where id=$1',[ids[0]]),/FENCED/);
 await rejects(()=>db.query('insert into payment_gateway_transactions(id,receivable_id) values($1,$2)',[uid(898),ids[0]]),/OTHER_OPERATION_FENCED/);
 await rejects(()=>db.query('update internal_academic.technical_manual_receivable_issuance_authorizations set claim_count=claim_count+1 where receivable_id=$1',[ids[0]]),/OTHER_OPERATION_FENCED/);
 await rejects(()=>db.query('update internal_academic.technical_manual_cycle_runs set total_amount=999 where matricula_id=$1 and cycle_number=2',[enrollment]),/SOURCE_RUN_IMMUTABLE/);
 await rejects(()=>db.query('delete from contas_receber where id=$1',[ids[0]]),/HISTORY_IMMUTABLE/);
}));
test('non-service cannot claim and wrappers/maintenance have zero public grants',()=>isolated(async()=>{
 await prepare();await db.exec("set local test.jwt.role='authenticated'");
 await rejects(()=>call('claim',[op,ids[0],manifest.fingerprint]),/SERVICE_ONLY/);
 const bad=await scalar(`select count(*)::int value from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where (n.nspname='internal_inclusion_cancellation' or p.proname like '%inclusion_cancellation_service')
 and a.grantee in(0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='service_role'))`);
 assert.equal(bad,0);
}));
test('payment arriving after durable intent is retained and prevents local cancellation',()=>isolated(async()=>{
 await prepare();claim=await call('claim',[op,ids[0],manifest.fingerprint]);await call('start',scope());
 await db.query("update contas_receber set status='PAGO',valor_pago=valor,data_pagamento=current_date where id=$1",[ids[0]]);
 await rejects(()=>call('complete',[...scope(),evidence(false)]),/TITLE_STATE|PAYMENT_OR_SETTLEMENT/);
 await call('review',[...scope(),'LOCAL_SYNC_AFTER_REMOTE']);
 assert.equal(await scalar('select status value from contas_receber where id=$1',[ids[0]]),'PAGO');
}));
test('lease expiry never permits another mutation after recorded intent',()=>isolated(async()=>{
 await prepare();claim=await call('claim',[op,ids[0],manifest.fingerprint]);await call('start',scope());
 await db.query("update internal_inclusion_cancellation.items set lease_until=clock_timestamp()-interval '1 second' where receivable_id=$1",[ids[0]]);
 await rejects(()=>call('complete',[...scope(),evidence(false)]),/LEASE_EXPIRED/);
 claim=await call('claim',[op,ids[0],manifest.fingerprint]);assert.equal(claim.mode,'CONFIRM_ONLY');
 await rejects(()=>call('start',scope()),/INTENT_LEASE_OR_REPLAY/);
 await call('complete',[...scope(),evidence(true)]);
}));
test('execution capability revoked after intent prevents completion but audit-only review survives',()=>isolated(async()=>{
 await prepare();claim=await call('claim',[op,ids[0],manifest.fingerprint]);await call('start',scope());
 await db.query("update internal_inclusion_cancellation.operations set execution_enabled=false where id=$1",[op]);
 await rejects(()=>call('complete',[...scope(),evidence(false)]),/NOT_APPROVED/);
 await call('review',[...scope(),'LOCAL_SYNC_AFTER_REMOTE']);
 assert.equal(await scalar('select state value from internal_inclusion_cancellation.items where receivable_id=$1',[ids[0]]),'REVIEW');
 assert.equal(await scalar('select status value from contas_receber where id=$1',[ids[0]]),'PENDENTE');
}));
test('wrong identity, effective payment and incomplete proof rejected atomically',()=>isolated(async()=>{
 await prepare();claim=await call('claim',[op,ids[0],manifest.fingerprint]);
 for(const edit of [e=>e.bankResult.nossoNumero='000999999',e=>e.bankResult.proof.paymentsCount=1,
  e=>delete e.bankResult.proof.identityValidated,e=>e.bankResult.situationCode=2,e=>e.bankResult.raw={}]){
  const value=evidence();edit(value);await rejects(()=>call('complete',[...scope(),value]),/BANK_CONFIRMATION_INVALID/);
 }
 assert.equal(await scalar('select status value from contas_receber where id=$1',[ids[0]]),'PENDENTE');
}));
test('completion identical replay is idempotent and divergent evidence is refused',()=>isolated(async()=>{
 await prepare();claim=await call('claim',[op,ids[0],manifest.fingerprint]);const value=evidence();
 await call('complete',[...scope(),value]);
 assert.equal((await call('complete',[...scope(),value])).replayed,true);
 await rejects(()=>call('complete',[...scope(),{...value,evidenceFingerprint:'c'.repeat(64)}]),/REPLAY_CONFLICT/);
 assert.equal(await scalar("select count(*)::int value from internal_inclusion_cancellation.events where receivable_id=$1 and event='COMPLETE'",[ids[0]]),1);
}));
test('source CAS changed after prepare blocks approval without financial mutation',()=>isolated(async()=>{
 await prepare(false);await db.query("update contas_receber set gateway_last_error='synthetic changed source' where id=$1",[ids[0]]);
 await rejects(()=>priv('approve_operation',[op,manifest.planFingerprint]),/CAS_CHANGED/);
 assert.equal(await scalar('select state value from internal_inclusion_cancellation.operations where id=$1',[op]),'PREPARED');
}));
test('service_role cannot create/approve/expand the maintenance capability',()=>isolated(async()=>{
 await prepare(false);
 await db.exec('set local role service_role');
 await rejects(()=>priv('approve_operation',[op,manifest.planFingerprint]),/permission denied/i);
 await rejects(()=>priv('prepare_operation',[uid(80002),enrollment,2,cycleRequest,ids,
  'Another synthetic reason','synthetic-owner-approval','a'.repeat(64)]),/permission denied/i);
 await rejects(()=>db.query('insert into internal_inclusion_cancellation.items(operation_id,receivable_id) values($1,$2)',[op,uid(20000)]),/permission denied/i);
 await db.exec('reset role');
}));
test('approval pauses only target reconciliation queue and leaves external scope untouched',()=>isolated(async()=>{
 const outsider=await q('select to_jsonb(x) row from banese_reconciliation_queue x where not(receivable_id=any($1::uuid[])) order by receivable_id',[ids]);
 await prepare();
 assert.equal(await scalar("select count(*)::int value from banese_reconciliation_queue where receivable_id=any($1::uuid[]) and state='DONE' and last_result='CANCELLATION_IN_PROGRESS'",[ids]),13);
 assert.deepEqual(await q('select to_jsonb(x) row from banese_reconciliation_queue x where not(receivable_id=any($1::uuid[])) order by receivable_id',[ids]),outsider);
 const authority=(await q('select execution_actor_kind,requester_channel from internal_inclusion_cancellation.operations where id=$1',[op]))[0];
 assert.deepEqual(authority,{execution_actor_kind:'SYSTEM_MAINTENANCE',requester_channel:'CHAT_OWNER'});
}));

test('reviewed runtime grants expose only five service RPCs; capability preparation stays private',()=>isolated(async()=>{
 const grants=(await readFile(new URL('../migrations/20261027183204_inclusion_cancel_only_runtime_grants.sql',import.meta.url),'utf8'))
  .replace(/^begin;$/gm,'').replace(/^commit;$/gm,'');
 await db.exec(grants); await prepare(false);
 const serviceOid=await scalar("select oid::int value from pg_roles where rolname='service_role'");
 const allowed=await q(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where (n.nspname='internal_inclusion_cancellation' or p.proname like '%inclusion_cancellation_service')
  and a.grantee=$1 order by p.proname`,[serviceOid]);
 assert.deepEqual(allowed.map(x=>x.proname),['claim','complete','load','review','start'].sort()
  .map(x=>`${x}_inclusion_cancellation_service`));
 await db.exec('set local role service_role');
 await rejects(()=>call('load',[op]),/NOT_APPROVED/);
 await rejects(()=>priv('approve_operation',[op,manifest.planFingerprint]),/permission denied/);
 await rejects(()=>priv('prepare_operation',[op,enrollment,2,cycleRequest,ids,
  'Synthetic reason long','synthetic-approval','a'.repeat(64)]),/permission denied/);
 await db.exec('reset role');
 await priv('approve_operation',[op,manifest.planFingerprint]);
 await db.exec('set local role service_role');
 assert.equal((await call('load',[op])).state,'APPROVED');
 await db.exec('reset role');
}));

test('new receipt-attempt admission and failed-attempt reactivation are fenced after approval',()=>isolated(async()=>{
 await db.query("insert into internal_receivable_payments.attempts(id,receivable_id,state) values($1,$2,'FAILED_SAFE')",[uid(955),ids[0]]);
 await prepare();
 await rejects(()=>db.query("insert into internal_receivable_payments.attempts(id,receivable_id,state) values($1,$2,'PREPARED')",[uid(956),ids[0]]),/OTHER_OPERATION_FENCED/);
 await rejects(()=>db.query("update internal_receivable_payments.attempts set state='PREPARED' where id=$1",[uid(955)]),/OTHER_OPERATION_FENCED/);
}));
test('existing active receipt attempt or any ledger history blocks preparation before bank',()=>isolated(async()=>{
 await db.query("insert into internal_receivable_payments.attempts(id,receivable_id,state) values($1,$2,'PREPARED')",[uid(957),ids[0]]);
 await rejects(()=>prepare(),/PAYMENT_LEDGER_OR_ACTIVE_ATTEMPT/);
 await db.query('delete from internal_receivable_payments.attempts where id=$1',[uid(957)]);
 await db.query("insert into financial_payment_events(id,source_kind,source_id) values($1,'RECEIVABLE',$2)",[uid(958),ids[0]]);
 await rejects(()=>prepare(),/PAYMENT_LEDGER_OR_ACTIVE_ATTEMPT/);
}));
test('late ledger evidence remains recorded and blocks cancellation reconciliation',()=>isolated(async()=>{
 await prepare();claim=await call('claim',[op,ids[0],manifest.fingerprint]);await call('start',scope());
 await db.query("insert into financial_payment_events(id,source_kind,source_id) values($1,'RECEIVABLE',$2)",[uid(959),ids[0]]);
 await rejects(()=>call('complete',[...scope(),evidence(false)]),/PAYMENT_LEDGER_OR_ACTIVE_ATTEMPT/);
 await call('review',[...scope(),'LOCAL_SYNC_AFTER_REMOTE']);
 assert.equal(await scalar('select count(*)::int value from financial_payment_events where id=$1',[uid(959)]),1);
 assert.equal(await scalar('select status value from contas_receber where id=$1',[ids[0]]),'PENDENTE');
}));
