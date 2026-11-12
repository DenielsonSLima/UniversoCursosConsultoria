import assert from 'node:assert/strict';
import {fixture,migration,issue,uid} from './nfse-reconciliation-fixture.mjs';
const db=await fixture(process.argv[2]);
await db.exec(`CREATE SCHEMA extensions; CREATE SCHEMA net; CREATE SCHEMA cron;
 CREATE FUNCTION extensions.gen_random_bytes(n int) RETURNS bytea LANGUAGE sql AS $$SELECT decode(repeat('ab',n),'hex')$$;
 CREATE FUNCTION vault.create_secret(secret text,name text) RETURNS uuid LANGUAGE plpgsql AS $$DECLARE id uuid:=gen_random_uuid(); BEGIN
 INSERT INTO vault.secrets(id,name,decrypted_secret) VALUES(id,name,secret); RETURN id; END$$;
 CREATE TABLE net.calls(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb,body jsonb,timeout integer);
 CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$DECLARE id bigint;BEGIN
 IF current_setting('test.fail_net',true)='true' THEN RAISE EXCEPTION 'synthetic network unavailable'; END IF;
 INSERT INTO net.calls(url,headers,body,timeout) VALUES(url,headers,body,timeout_milliseconds) RETURNING net.calls.id INTO id; RETURN id; END$$;
 CREATE TABLE cron.jobs(name text,schedule text,command text);
 CREATE FUNCTION cron.schedule(name text,schedule text,command text) RETURNS bigint LANGUAGE plpgsql AS $$BEGIN
 INSERT INTO cron.jobs VALUES(name,schedule,command); RETURN 1; END$$;`);
await migration(db,'20261112220300_nfse_reconciliation_scheduler.sql');
const count=async()=>Number((await db.query('SELECT count(*) n FROM net.calls')).rows[0].n);
const resetKick=()=>db.exec(`UPDATE private.nfse_reconciliation_control SET last_kick_at=now()-interval '2 seconds'`);
assert.equal((await db.query('SELECT enabled FROM private.nfse_reconciliation_control')).rows[0].enabled,false);
await assert.rejects(db.query('SELECT public.get_nfse_reconciliation_worker_secret_internal()'),/disabled/);
const a=await issue(db,1); assert.equal(await count(),0,'disabled does not send net');
await db.exec(`UPDATE private.nfse_reconciliation_control SET enabled=true`);
await db.query(`UPDATE private.nfse_reconciliation_jobs SET state='READY',lease_token=NULL,lease_until=NULL,next_check_at=now() WHERE id=$1`,[a.jobId]);
assert.equal(await count(),1,'ready wake enqueues one request');
await db.exec(`SELECT private.kick_nfse_reconciliation_worker()`); assert.equal(await count(),1,'kick debounce');
const call=(await db.query('SELECT * FROM net.calls LIMIT 1')).rows[0];
assert.equal(call.url,'https://kfekgwyqozhicpfuunpo.supabase.co/functions/v1/nfse-reconciliation-worker');
assert.deepEqual(Object.keys(call.body),['delaySeconds']); assert(call.body.delaySeconds>=0 && call.body.delaySeconds<=10);
assert.equal(call.headers['X-Nfse-Worker-Token'],'ab'.repeat(32));
const cron=(await db.query('SELECT * FROM cron.jobs')).rows[0];
assert.equal(cron.schedule,'* * * * *'); assert.equal(cron.command,'SELECT private.kick_nfse_reconciliation_worker()');
assert(!cron.command.includes('ab'.repeat(32)),'no secret embedded in cron');
await db.exec(`SELECT set_config('request.jwt.claim.role','authenticated',false)`);
await assert.rejects(db.query('SELECT public.get_nfse_reconciliation_worker_secret_internal()'),/Internal worker/);
assert.equal((await db.query(`SELECT has_function_privilege('authenticated','public.get_nfse_reconciliation_worker_secret_internal()','EXECUTE') ok`)).rows[0].ok,false);
assert.equal((await db.query(`SELECT has_table_privilege('authenticated','private.nfse_reconciliation_control','SELECT') ok`)).rows[0].ok,false);
await db.exec(`SELECT set_config('request.jwt.claim.role','service_role',false)`);
// Network failure in the kick must not roll back fiscal state or durable queue insertion.
await resetKick(); await db.exec(`SELECT set_config('test.fail_net','true',false)`);
await issue(db,2);
assert.equal((await db.query(`SELECT state FROM private.nfse_individual_operations WHERE id=$1`,[uid(2)])).rows[0].state,'PROCESSING');
assert.equal(Number((await db.query(`SELECT count(*) n FROM private.nfse_reconciliation_jobs WHERE operation_id=$1`,[uid(2)])).rows[0].n),1);
await db.exec(`SELECT set_config('test.fail_net','false',false)`);
// Terminal update wakes an independently ready item; the terminal item is never requeued.
await db.exec(`UPDATE private.nfse_reconciliation_control SET enabled=false`);
await db.query(`UPDATE private.nfse_reconciliation_jobs SET state='READY',lease_token=NULL,lease_until=NULL,next_check_at=now() WHERE operation_id=$1`,[uid(2)]);
await db.exec(`UPDATE private.nfse_reconciliation_control SET enabled=true,last_kick_at=now()-interval '2 seconds'`);
const before=await count();
await db.query(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED',authorized_xml='synthetic' WHERE id=$1`,[uid(1)]);
assert.equal(await count(),before+1,'terminal wakes next ready job');
assert.equal((await db.query(`SELECT state FROM private.nfse_reconciliation_jobs WHERE operation_id=$1`,[uid(1)])).rows[0].state,'DONE');
// No READY/recoverable lease means no needless request even with scheduler enabled.
await db.query(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED',authorized_xml='synthetic' WHERE id=$1`,[uid(2)]);
await resetKick(); const terminalCount=await count(); await db.exec(`SELECT private.kick_nfse_reconciliation_worker()`);
assert.equal(await count(),terminalCount);
console.log('PASS scheduler mocks: disabled default, secret isolation, authenticated denial, debounce, net failure durable, terminal wake, no idle requests. No network or production access.');
await db.close();
