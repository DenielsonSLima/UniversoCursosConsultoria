// Opt-in, disposable PostgreSQL 17 only. Never point at Supabase or a user's DB.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
import { createFixture } from '../../../tests/fixtures/proesc-v2-growth.fixture.mjs';
const url = new URL(process.env.PROESC_SYNTHETIC_PG17_URL ?? 'postgres://invalid');
assert.equal(process.env.PROESC_SYNTHETIC_PG17, '1', 'Explicit disposable-test opt-in required');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname), 'Only loopback disposable database permitted');
assert.equal(url.pathname, '/proesc_payload_ci', 'Dedicated empty test DB required');
const connect = async () => { const c=new Client({connectionString:url.href});await c.connect();await c.query("SET statement_timeout='15s'");return c; };
const main=await connect(), a=await connect(), b=await connect();
const q=(sql,args=[])=>main.query(sql,args);
const value=async(sql,args=[]) => (await q(sql,args)).rows[0].value;
const adapter={query:q,exec:q,close:()=>Promise.resolve()};
let checks=0;
try {
 const actualVersion=Number((await q('show server_version_num')).rows[0].server_version_num);
 assert.ok(actualVersion>=170000&&actualVersion<180000,'PostgreSQL 17 required');
 assert.equal(Number(await value(`select count(*) value from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_%'
  and c.relkind in ('r','p','v','m')`)),0,'Refuse to touch any pre-existing application data');
 const {id,actor,revision,personHash}=await createFixture({db:adapter,nativePgcrypto:true});
 for(const name of ['01_payload_storage','02_payload_readers','03_payload_writer','04_payload_activation_gate'])
  await q(readFileSync(new URL(`../${name}.draft.sql`,import.meta.url),'utf8'));
 await q(`alter table internal_proesc.v2_invoice_observations validate constraint v2_invoice_payload_identity_fk;
  alter table internal_proesc.v2_invoice_observations validate constraint v2_invoice_one_payload;
  select internal_proesc.v2_set_payload_storage_enabled(true)`);
 const payload={invoiceId:'456',unitId:'3145',personId:'11',sourceEnrollmentId:'22',sourceClassId:'123',personHash,
  dueDate:'2026-09-15',principalCents:27990,paidCents:0,paymentDate:null,sourceStatus:'VENCIDO',reviewReasons:[]};
 const intern=(client,row)=>client.query('select internal_proesc.v2_intern_invoice_payload($1,$2,$3::jsonb) value',
  [row.unitId,row.invoiceId,JSON.stringify(row)]);
 const pidA=(await a.query('select pg_backend_pid() pid')).rows[0].pid;
 const pidB=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
 async function waitBlocked(promise){
  let done=false;promise.finally(()=>{done=true;}).catch(()=>{});
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
   const blocked=await value('select $1::int=ANY(pg_blocking_pids($2::int)) value',[pidA,pidB]);
   if(blocked){assert.equal(done,false);checks++;return;}
   assert.equal(done,false,'Rival completed before PostgreSQL reported the expected blocker');
   await delay(20);
  }
  assert.fail('PostgreSQL never reported rival blocked by owner');
 }
 await a.query('BEGIN');const first=(await intern(a,payload)).rows[0].value;
 await b.query('BEGIN');const rival=intern(b,payload);await waitBlocked(rival);await a.query('COMMIT');
 assert.equal((await rival).rows[0].value,first);await b.query('COMMIT');checks++;
 const next={...payload,invoiceId:'457'};
 await a.query('BEGIN');await intern(a,next);await b.query('BEGIN');const retry=intern(b,next);
 await waitBlocked(retry);await a.query('ROLLBACK');const afterRollback=(await retry).rows[0].value;
 await b.query('COMMIT');assert.ok(afterRollback);checks++;
 assert.equal(Number(await value('select count(*) value from internal_proesc.v2_invoice_payloads')),2);checks++;
 const rpc=(client,action,p={})=>client.query('select public.proesc_v2_runtime_service($1,$2,$3::jsonb) value',
  [action,actor,JSON.stringify(p)]);
 for(const client of [a,b]) await client.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
 await rpc(main,'start',{runId:id(6000),mode:'FULL'});
 let task=(await rpc(main,'claim')).rows[0].value;
 const lease=t=>({taskId:t.taskId,leaseId:t.leaseId,credentialRevision:revision});
 const page=t=>({...lease(t),page:1,lastPage:1,total:1,observedAt:new Date().toISOString(),records:[payload]});
 // A complete people-only FULL scope exists even with no linked obligations in this fixture.
 await rpc(main,'commit',{...lease(task),page:1,lastPage:1,total:0,observedAt:new Date().toISOString(),records:[]});
 await rpc(main,'start',{runId:id(6001),mode:'RECENT'});
 task=(await rpc(main,'claim')).rows[0].value;
 const month=task.month,year=task.year;
 const record={...payload,invoiceId:'458',dueDate:`${year}-${String(month).padStart(2,'0')}-15`};
 const commit={...page(task),records:[record]};
 const walBefore=await value('select pg_current_wal_insert_lsn() value');
 await a.query('BEGIN');await rpc(a,'commit',commit);await b.query('BEGIN');
 const secondCommit=rpc(b,'commit',commit);await waitBlocked(secondCommit);await a.query('COMMIT');
 assert.equal((await secondCommit).rows[0].value.replayed,true);await b.query('COMMIT');checks++;
 assert.equal(Number(await value("select count(*) value from internal_proesc.v2_invoice_observations where invoice_id='458'")),1);checks++;
 const walBytes=await value('select pg_wal_lsn_diff(pg_current_wal_insert_lsn(),$1)::text value',[walBefore]);
 assert.equal((await value('select internal_proesc.v2_set_payload_storage_enabled(false) value')).enabled,false);checks++;
 console.log(JSON.stringify({result:'PASS',checks,postgres:actualVersion,
  walBytesForIsolatedReplayScenario:walBytes,walScope:'Includes all writes in this isolated transaction window; not a savings estimate'}));
} finally {
 await Promise.allSettled([a.query('ROLLBACK'),b.query('ROLLBACK')]);
 await Promise.all([a.end(),b.end(),main.end()]);
}
