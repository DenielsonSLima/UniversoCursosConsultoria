// Synthetic GitHub Actions postgres:17 only. Never reads application credentials.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,relative} from 'node:path';
import {readFile} from 'node:fs/promises';
import {loadIntegrationDatabase} from './bounded-integration-setup.mjs';
import {uid} from './bounded-seed.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.INCLUSION_EPHEMERAL_POSTGRES,'synthetic-postgres-17-only');
assert.ok(process.env.RUNNER_TEMP);
const modulePath=resolve(process.env.INCLUSION_PG_MODULE??'');
const rel=relative(resolve(process.env.RUNNER_TEMP),modulePath);
assert.ok(rel&&!rel.startsWith('..')&&!rel.startsWith('/'));
const {Client}=createRequire(import.meta.url)(modulePath);
const clients=[];
async function connect(){
 const c=new Client({host:'127.0.0.1',port:5432,user:'inclusion_ci',
  password:'synthetic_ephemeral_ci_only',database:'inclusion_cancellation_ci',ssl:false,
  connectionTimeoutMillis:10000,query_timeout:20000,statement_timeout:18000,
  lock_timeout:12000,application_name:'inclusion-synthetic-concurrency'});
 await c.connect();clients.push(c);await c.query("set test.jwt.role='service_role'");return c;
}
const value=async(c,sql,args=[]) => (await c.query(sql,args)).rows[0].value;
const rpc=(c,name,args=[])=>value(c,`select ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args);
const privateRpc=(c,name,args)=>rpc(c,`internal_inclusion_cancellation.${name}`,args);
const service=(c,name,args)=>rpc(c,`public.${name}_inclusion_cancellation_service`,args);
const pending=promise=>promise.then(value=>({value}),error=>({error}));
async function locked(observer,client){
 const end=Date.now()+5000;
 while(Date.now()<end){
  const result=await observer.query("select wait_event_type from pg_stat_activity where pid=$1",[client.processID]);
  if(result.rows[0]?.wait_event_type==='Lock')return;
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 throw Error('Expected independently blocked PostgreSQL session');
}
const op=uid(80001),enrollment=uid(6),request=uid(512);
let c1,c2,observer;
try{
 c1=await connect();c2=await connect();observer=await connect();
 await loadIntegrationDatabase({exec:sql=>c1.query(sql),query:(sql,args)=>c1.query(sql,args)});
 await c1.query(`create schema internal_receivable_payments;
 create table internal_receivable_payments.attempts(id uuid primary key,receivable_id uuid,state text);
 create table public.financial_payment_events(id uuid primary key,source_kind text,source_id uuid);
 create table public.banese_ead_title_replacement_archive(id uuid primary key,environment text,convenio text,canceled_nosso_numero text);
 create table internal_financial_correction.normal_cycle_reset_archive(id uuid primary key,bank_environment text,bank_convenio text,canceled_nosso_numero text);`);
 for(const [n,name] of ['storage_prepare','guards_runtime','completion_fences','dispatch','runtime_grants','receipt_ledger_guards'].entries()){
  await c1.query(await readFile(new URL(`../migrations/2026102718320${n}_inclusion_cancel_only_${name}.sql`,import.meta.url),'utf8'));
 }
 const ids=(await c1.query('select receivable_ids from internal_academic.technical_manual_cycle_runs where matricula_id=$1 and cycle_number=2',[enrollment])).rows[0].receivable_ids;
 const manifest=await privateRpc(c1,'prepare_operation',[op,enrollment,2,request,ids,
  'Synthetic erroneous inclusion correction','synthetic-owner-chat-approval','a'.repeat(64)]);

 // An already-starting receipt attempt wins its lock; approval must then refuse.
 await c1.query('begin');
 await c1.query("insert into internal_receivable_payments.attempts values($1,$2,'PREPARED')",[uid(980),ids[0]]);
 const approval=pending(privateRpc(c2,'approve_operation',[op,manifest.planFingerprint]));
 await locked(observer,c2);await c1.query('commit');
 assert.match((await approval).error?.message??'',/PAYMENT_LEDGER_OR_ACTIVE_ATTEMPT/);
 await c1.query('delete from internal_receivable_payments.attempts where id=$1',[uid(980)]);
 await privateRpc(c1,'approve_operation',[op,manifest.planFingerprint]);
 console.log('PASS concurrent receipt attempt prevents approval');

 // Two claims cannot obtain different simultaneously valid mutation leases.
 await c1.query('begin');
 const first=await service(c1,'claim',[op,ids[0],manifest.fingerprint]);
 const duplicate=pending(service(c2,'claim',[op,ids[0],manifest.fingerprint]));
 await locked(observer,c2);await c1.query('commit');
 assert.match((await duplicate).error?.message??'',/LEASE_ACTIVE/);
 assert.equal(first.mode,'CANCEL_ALLOWED');
 console.log('PASS independently concurrent claim rejects second lease');

 // Durable intent and receipt lock fence a newly starting local payment attempt.
 const second=await service(c1,'claim',[op,ids[1],manifest.fingerprint]);
 await c1.query('begin');
 await service(c1,'start',[op,ids[1],manifest.fingerprint,second.leaseToken]);
 const attempt=pending(c2.query("insert into internal_receivable_payments.attempts values($1,$2,'PREPARED')",[uid(981),ids[1]]));
 await locked(observer,c2);await c1.query('commit');
 assert.match((await attempt).error?.message??'',/OTHER_OPERATION_FENCED/);
 assert.equal(await value(c1,'select count(*)::int value from internal_receivable_payments.attempts where id=$1',[uid(981)]),0);
 console.log('PASS concurrent receipt admission cannot cross intent fence');

 // Payment committed while completion waits is retained and blocks cancellation.
 const third=await service(c1,'claim',[op,ids[2],manifest.fingerprint]);
 await c1.query('begin');
 await c1.query("update contas_receber set status='PAGO',valor_pago=valor,data_pagamento=current_date where id=$1",[ids[2]]);
 const evidence={confirmedAt:new Date().toISOString(),evidenceFingerprint:'b'.repeat(64),
  bankResult:{convenio:third.item.convenio,nossoNumero:third.item.nossoNumero,
   situationCode:5,remoteStatus:'CANCELED',alreadyCanceled:true,mutationAttempted:false,
   raw:{CodigoSituacaoBoleto:5},proof:{strictEffectivePayments:true,paymentsCount:0,identityValidated:true,termsValidated:true}}};
 const completion=pending(service(c2,'complete',[op,ids[2],manifest.fingerprint,third.leaseToken,evidence]));
 await locked(observer,c2);await c1.query('commit');
 assert.match((await completion).error?.message??'',/TITLE_STATE|PAYMENT_OR_SETTLEMENT/);
 assert.equal(await value(c1,'select status value from contas_receber where id=$1',[ids[2]]),'PAGO');
 console.log('PASS concurrent payment wins over stale cancellation evidence');
 console.log('4/4 PostgreSQL independent-session races passed; no HTTP or real bank.');
}finally{
 for(const c of clients){try{await c.query('rollback');}catch{}try{await c.end();}catch{}}
}
