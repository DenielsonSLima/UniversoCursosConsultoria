import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {manualDatabase,seedFinancial,settleTrustManual,grant,submit,state,scalar,source,
 enrollment,id,other} from './ead_trust_manual_payment.fixture.mjs';
import {newTrustPostgresDatabase,waitForPostgresLock} from './fixtures/ead-trust-postgres-adapter.mjs';

const enabled=Boolean(process.env.EAD_TEST_DATABASE_URL);
const observe=promise=>promise.then(value=>({value}),error=>({error}));
const unwrap=async promise=>{const result=await promise;if(result.error)throw result.error;return result.value;};

test('PostgreSQL: one local manual completion retries its real 40P01 victim without repeating bank cancellation',
 {skip:!enabled,timeout:45000},async t=>{
 const postgres=await newTrustPostgresDatabase();
 t.after(()=>postgres.close());
 const db=await manualDatabase({database:postgres.database});
 await seedFinancial(db,{managed:true});await grant(db);await submit(db);
 const original=await state(db),code=original.certificates[0].codigo_validacao;
 // The academic fixture contains one attempt. The real recovery owner orders
 // all attempts by this production column before locking the financial title.
 await db.exec('ALTER TABLE public.ead_checkout_attempts ADD COLUMN IF NOT EXISTS sequence_number integer DEFAULT 1');
 const recoverySource=await source('20261005015543_recover_optional_ead_payment.sql');
 assert.match(recoverySource,/perform 1 from public\.matriculas where id=v_j\.matricula_id for update;/);
 assert.match(recoverySource,/perform 1 from public\.ead_checkout_attempts where matricula_id=v_j\.matricula_id order by sequence_number for update;/);
 assert.match(recoverySource,/select \* into strict v_c from public\.contas_receber where id=v_j\.receivable_id for update;/);
 const worker=await postgres.connect('ead_manual_deadlock_recovery');
 const manual=await postgres.connect('ead_manual_deadlock_completion');
 await worker.exec("SET deadlock_timeout='5s'");
 await manual.exec("SET deadlock_timeout='1s'");
 await manual.query("SELECT set_config('test.actor',$1,false),set_config('test.gestor','true',false)",[other]);
 const temporary=await mkdtemp(resolve('tmp/ead-manual-deadlock-'));
 t.after(()=>rm(temporary,{recursive:true,force:true}));
 const output=resolve(temporary,'retry.mjs');
 const bundled=await build({entryPoints:[resolve('supabase/functions/_shared/sql-deadlock-retry.ts')],
  bundle:true,write:false,outfile:output,format:'esm',platform:'node',packages:'external'});
 await writeFile(output,bundled.outputFiles[0].contents);
 const {retrySqlDeadlock}=await import(pathToFileURL(output).href);
 let releaseWorker;
 const workerReleased=new Promise(done=>{releaseWorker=done;});
 const payload=Object.freeze({receivableId:id(1),eventId:id(901),principalCents:10000,paymentCents:10000,discountCents:0});
 const intent=Object.freeze({attemptId:id(930),leaseToken:id(931),payload});
 const calls=[],sqlErrors=[];
 let bankCancellations=0;
 // This counter represents already-completed external I/O. It is deliberately
 // outside the production retry helper and outside the retried SQL operation.
 bankCancellations+=1;
 await worker.exec('BEGIN');
 await worker.query('SELECT id FROM public.matriculas WHERE id=$1 FOR UPDATE',[enrollment]);
 const completion=observe(retrySqlDeadlock(async()=>{
  calls.push(intent);
  // Control only the test I/O schedule: the real helper still decides whether
  // a second call exists. Hold that call until the competing transaction ends.
  if(calls.length>1)await workerReleased;
  try{
   await settleTrustManual(manual,payload);
   return {data:{completed:true},error:null};
  }catch(error){
   // settleTrustManual rolls back its failed transaction before this RPC-shaped
   // I/O adapter returns the genuine PostgreSQL error to the production helper.
   sqlErrors.push(error.code);
   return {data:null,error};
  }
 }));
 try{
  await waitForPostgresLock(db,'ead_manual_deadlock_completion');
  const workerAttempts=observe(worker.query(
   'SELECT id FROM public.ead_checkout_attempts WHERE matricula_id=$1 ORDER BY sequence_number FOR UPDATE',[enrollment]));
  await waitForPostgresLock(db,'ead_manual_deadlock_recovery');
  // PostgreSQL's manual-session detector is first to detect the actual cycle:
  // recovery M->attempt waits for completion attempt->M. The SQL body rolls back.
  await unwrap(workerAttempts);
  await worker.query('SELECT * FROM public.contas_receber WHERE id=$1 FOR UPDATE',[id(1)]);
  await worker.exec('COMMIT');releaseWorker();
  assert.deepEqual(await unwrap(completion),{completed:true});
 }finally{
  await worker.exec('ROLLBACK').catch(()=>{});releaseWorker();
 }
 assert.deepEqual(sqlErrors,['40P01'],'The manual completion must be the real deadlock victim, not a synthetic throw');
 assert.equal(calls.length,2);assert(calls.every(call=>call===intent&&call.payload===payload));
 assert.equal(bankCancellations,1);
 const current=await state(db);
 assert.equal(current.enrollment.status,'ATIVO');assert.equal(current.certificates.length,1);assert.equal(current.documents.length,1);
 assert.equal(current.certificates[0].codigo_validacao,code);
 assert.deepEqual(current.certificates,original.certificates);assert.deepEqual(current.documents,original.documents);
 assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.financial_payment_events'),1);
 assert.equal(await scalar(db,'SELECT state value FROM internal_academic.ead_trust_certificate_issues'),'DEFINITIVE');
 assert.equal(await scalar(db,"SELECT count(*)::int value FROM internal_academic.ead_trust_certificate_audit WHERE event='PAYMENT_CONFIRMED'"),1);
 assert.equal(await scalar(db,'SELECT gateway_status value FROM public.contas_receber WHERE id=$1',[id(1)]),'CANCELED');
 assert.equal(await scalar(db,'SELECT remote_status value FROM public.payment_gateway_transactions WHERE id=$1',[id(3)]),'CANCELED');
});
