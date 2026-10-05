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
    create table public.banese_ead_checkout_expiration_jobs(state text,remote_mutation_started_at timestamptz,canceled_at timestamptz);
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
    insert into public.banese_ead_checkout_expiration_jobs values('DONE',null,now())`);
  await db.exec(command);
  assert.equal(await scalar('select count(*) value from public.test_http_requests'),1,'Observation continues after disabling new cancellations');
  await db.exec(migration);
  assert.equal(await scalar("select count(*) value from cron.job where jobname='banese-ead-checkout-expiration-every-minute'"),1);
  console.log('PASS: independent authenticated cron, idle disabled lane, runtime secret and continued canceled-title observation.');
} finally {await db.close();}
