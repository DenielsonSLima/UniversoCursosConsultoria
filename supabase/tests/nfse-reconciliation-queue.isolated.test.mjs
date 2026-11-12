import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {testModule} from './nfse-reconciliation-fixture.mjs';
const { PGlite } = await import(testModule(process.argv[2]));
const db = new PGlite();
await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA private; CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
 CREATE TABLE private.nfse_individual_operations(id uuid primary key,polo_id uuid,environment text,month text,state text,signed_dps_xml text,authorized_xml text);
 CREATE TABLE private.nfse_individual_cancellations(id uuid primary key,operation_id uuid references private.nfse_individual_operations(id),state text,signed_event_xml text);
 SELECT set_config('request.jwt.claim.role','service_role',false);
`);
await db.exec(await fs.readFile(new URL('../migrations/20261112220000_nfse_reconciliation_queue.sql',import.meta.url),'utf8'));
const u=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function add(n,state='PREVIEWED',signed=null,polo=100){
 await db.query(`INSERT INTO private.nfse_individual_operations VALUES($1,$2,'PRODUCAO','2026-11',$3,$4,NULL)`,[u(n),u(polo),state,signed]);
}
async function claim(){return (await db.query(`SELECT public.claim_nfse_reconciliation_jobs_internal(10) AS value`)).rows[0].value;}
async function due(){await db.exec(`UPDATE private.nfse_reconciliation_jobs SET next_check_at=now()-interval '1 second' WHERE state='READY'`);}
async function finish(j,outcome='PENDING',code='PENDING',retry=null){return db.query(`SELECT public.finish_nfse_reconciliation_job_internal($1,$2,$3,$4,$5) AS value`,[j.jobId,j.leaseToken,outcome,code,retry]);}
await add(1); await add(2,'PROCESSING'); await add(3,'AUTHORIZED','signed');
assert.equal((await db.query('select count(*)::int n from private.nfse_reconciliation_jobs')).rows[0].n,0,'preview/unsigned/terminal excluded');
await add(4,'PROCESSING','signed'); await add(5,'AWAITING_CONFIRMATION','signed'); await add(6,'PROCESSING','signed');
await add(7,'PROCESSING','signed',101); await due();
let jobs=await claim(); assert.equal(jobs.length,3,'max2 per polo plus other polo');
assert.equal(jobs.filter(j=>j.poloId===u(100)).length,2);
assert.deepEqual(await claim(),[],'no duplicate lease or third per polo');
const j=jobs.find(x=>x.poloId===u(100));
const other=jobs.find(x=>x.jobId!==j.jobId && x.poloId===u(100));
await assert.rejects(db.query(`SELECT public.finish_nfse_reconciliation_job_internal($1,$2,'PENDING','PENDING',NULL)`,[j.jobId,u(999)]),/Stale/);
await assert.rejects(finish(j,'PENDING','CONFIRMED'),/Canonical state/);
await finish(j,'RETRY','THROTTLED',90000);
const delayed=(await db.query(`SELECT extract(epoch from next_check_at-now()) n FROM private.nfse_reconciliation_jobs WHERE id=$1`,[j.jobId])).rows[0];
assert(Number(delayed.n)>89900,'Retry-After not capped downward');
const rest=await claim(); assert.equal(rest.length,1,'released capacity admits third');
await db.query(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED',authorized_xml='xml' WHERE id=$1`,[rest[0].operationId]);
assert.equal((await finish(rest[0])).rows[0].value.state,'DONE','terminal trigger wins over stale finish');
await db.query(`UPDATE private.nfse_reconciliation_jobs SET lease_until=now()-interval '1 second' WHERE id=$1`,[other.jobId]);
const recovered=await claim(); assert.equal(recovered.length,1); assert.notEqual(recovered[0].leaseToken,other.leaseToken);
await assert.rejects(finish(other),/Stale/);
await finish(recovered[0],'BLOCKED','AUTH_BLOCKED');
await db.query(`INSERT INTO private.nfse_individual_cancellations VALUES($1,$2,'PREVIEWED',NULL)`,[u(20),rest[0].operationId]);
assert.equal((await db.query(`select count(*)::int n from private.nfse_reconciliation_jobs where target_kind='CANCEL'`)).rows[0].n,0);
await db.query(`UPDATE private.nfse_individual_cancellations SET state='CANCELLATION_PENDING',signed_event_xml='signed' WHERE id=$1`,[u(20)]);
await due(); const cancel=(await claim()).find(x=>x.targetKind==='CANCEL'); assert(cancel);
await db.query(`UPDATE private.nfse_individual_cancellations SET state='CANCELLED' WHERE id=$1`,[u(20)]);
assert.equal((await finish(cancel)).rows[0].value.state,'DONE');
await assert.rejects(db.exec(`DELETE FROM private.nfse_reconciliation_audit`),/append-only/);
await db.exec(`SELECT set_config('request.jwt.claim.role','authenticated',false)`);
await assert.rejects(claim(),/Internal executor/);
assert.equal((await db.query(`SELECT has_function_privilege('authenticated','public.claim_nfse_reconciliation_jobs_internal(integer)','EXECUTE') granted`)).rows[0].granted,false);
assert.equal((await db.query(`SELECT has_table_privilege('authenticated','private.nfse_reconciliation_jobs','SELECT') granted`)).rows[0].granted,false);
assert.equal((await db.query(`SELECT count(*)::int n FROM private.nfse_individual_operations`)).rows[0].n,7,'no fiscal removal');
console.log('PASS: excluded previews, scope concurrency budget, lease CAS/recovery, backoff, terminal stop, cancellation, auth/grants.');
await db.close();
