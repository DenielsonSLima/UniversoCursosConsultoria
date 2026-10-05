import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const moduleUrl=process.env.PGLITE_MODULE_PATH
  ?pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href:'@electric-sql/pglite';
const {PGlite}=await import(moduleUrl);
const db=new PGlite();
const scalar=async sql=>(await db.query(sql)).rows[0]?.value;
try {
  await db.exec(`
    create schema cron; create schema net;
    create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
    declare v_id bigint;
    begin insert into cron.job(jobname,schedule,command) values($1,$2,$3)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command
      returning jobid into v_id; return v_id; end; $$;
    create table public.banese_ead_checkout_expiration_config(enabled boolean);
    create table public.banese_ead_checkout_expiration_jobs(state text,remote_mutation_started_at timestamptz,
      canceled_at timestamptz,processing_payment_detected_at timestamptz);
    create table public.test_http_requests(url text,headers jsonb,body jsonb,timeout_ms integer);
    create function public.get_banese_reconciliation_worker_secret() returns text language sql as $$ select repeat('s',32) $$;
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
    returns bigint language plpgsql as $$ begin
      insert into public.test_http_requests values(url,headers,body,timeout_milliseconds); return 42; end; $$;
    insert into cron.job(jobname,schedule,command) values('banese-reconciliation-every-minute','* * * * *',
      'select ''https://synthetic.supabase.co/functions/v1/banese-reconciliation-worker''');
    insert into public.banese_ead_checkout_expiration_config values(false);
  `);
  const migration=readFileSync(new URL('../migrations/20261005020048_schedule_ead_checkout_expiration.sql',import.meta.url),'utf8');
  await db.exec(migration);
  const command=await scalar("select command value from cron.job where jobname='banese-ead-checkout-expiration-every-minute'");
  assert.ok(command);
  assert.equal(await scalar("select count(*) value from cron.job where jobname='banese-reconciliation-every-minute'"),1);
  assert.ok(command.includes('get_banese_reconciliation_worker_secret()'));
  assert.ok(!command.includes('s'.repeat(32)),'Vault secret is not copied into cron text');
  await db.exec(command);
  assert.equal(await scalar('select count(*) value from public.test_http_requests'),0,'Disabled configuration is idle');
  await db.exec('update public.banese_ead_checkout_expiration_config set enabled=true');
  await db.exec(command);
  const request=(await db.query('select * from public.test_http_requests')).rows[0];
  assert.equal(request.url,'https://synthetic.supabase.co/functions/v1/banese-ead-checkout-expiration-worker');
  assert.equal(request.headers['X-Banese-Worker-Token'],'s'.repeat(32));
  assert.deepEqual(request.body,{});assert.equal(request.timeout_ms,25000);
  await db.exec(`truncate public.test_http_requests;update public.banese_ead_checkout_expiration_config set enabled=false;
    insert into public.banese_ead_checkout_expiration_jobs(state,remote_mutation_started_at,canceled_at)
      values('DONE',null,now())`);
  await db.exec(command);
  assert.equal(await scalar('select count(*) value from public.test_http_requests'),1,'Observation continues after disabling new cancellations');
  await db.exec(migration);
  assert.equal(await scalar("select count(*) value from cron.job where jobname='banese-ead-checkout-expiration-every-minute'"),1);
  const recovery=readFileSync(new URL('../migrations/20261005023342_preserve_ead_expiration_review_recovery.sql',import.meta.url),'utf8');
  // Execute the actual scheduler block here; the separate recovery harness
  // executes the complete migration against the real claim and financial guards.
  const schedulePatch=recovery.slice(recovery.indexOf('do $schedule$'),recovery.indexOf("notify pgrst"));
  const jobId=await scalar("select jobid value from cron.job where jobname='banese-ead-checkout-expiration-every-minute'");
  const normalCommand=await scalar("select command value from cron.job where jobname='banese-reconciliation-every-minute'");
  await db.exec(schedulePatch);
  const recoveredCommand=await scalar("select command value from cron.job where jobname='banese-ead-checkout-expiration-every-minute'");
  for(const [state,intent,canceled,processing,expected] of [
    ['REVIEW_REQUIRED',false,true,false,1],['REVIEW_REQUIRED',true,false,false,1],
    ['REVIEW_REQUIRED',false,false,true,1],['REVIEW_REQUIRED',false,false,false,0],
    ['RETRY',false,false,false,0],['PAID',true,true,true,0],
  ]) {
    await db.exec('truncate public.test_http_requests,public.banese_ead_checkout_expiration_jobs');
    await db.query(`insert into public.banese_ead_checkout_expiration_jobs values($1,
      case when $2 then now() end,case when $3 then now() end,case when $4 then now() end)`,
    [state,intent,canceled,processing]);
    await db.exec(recoveredCommand);
    assert.equal(await scalar('select count(*) value from public.test_http_requests'),expected,
      `Disabled scheduler preserves only recoverable bank witnesses: ${state}/${intent}/${canceled}/${processing}`);
  }
  assert.ok(recoveredCommand.includes('get_banese_reconciliation_worker_secret()'));
  assert.ok(!recoveredCommand.includes('s'.repeat(32)));
  await db.exec(schedulePatch);
  assert.equal(await scalar("select jobid value from cron.job where jobname='banese-ead-checkout-expiration-every-minute'"),jobId);
  assert.equal(await scalar("select command value from cron.job where jobname='banese-reconciliation-every-minute'"),normalCommand);
  await db.exec('begin');
  await db.query("update cron.job set command=replace(command,'processing_payment_detected_at','unknown_marker') where jobname=$1",
    ['banese-ead-checkout-expiration-every-minute']);
  await assert.rejects(()=>db.exec(schedulePatch),/predicate drift/);
  await db.exec('rollback');
  console.log('PASS: authenticated idempotent cron, runtime secret, disabled idle lane and continued durable bank review recovery.');
} finally {await db.close();}
