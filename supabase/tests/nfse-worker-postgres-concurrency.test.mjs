import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pgModule=await import(pathToFileURL(process.env.NFSE_PG_MODULE).href);
const {Client}=pgModule.default??pgModule;
const clients=await Promise.all([0,1,2].map(async()=>{const c=new Client({connectionString:process.env.NFSE_TEST_DATABASE_URL});await c.connect();return c;}));
const [admin,a,b]=clients;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try{
 await admin.query(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA private;CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
 CREATE TABLE private.nfse_individual_operations(id uuid primary key,polo_id uuid,environment text,month text,state text,signed_dps_xml text,authorized_xml text);
 CREATE TABLE private.nfse_individual_cancellations(id uuid primary key,operation_id uuid,state text,signed_event_xml text);`);
 await admin.query(await readFile(new URL('../migrations/20261112220000_nfse_reconciliation_queue.sql',import.meta.url),'utf8'));
 for(const c of clients)await c.query("SELECT set_config('request.jwt.claim.role','service_role',false)");
 await admin.query(`INSERT INTO private.nfse_individual_operations VALUES($1,$2,'PRODUCAO','2026-11','AWAITING_CONFIRMATION','signed',NULL)`,[id(1),id(100)]);
 await admin.query("UPDATE private.nfse_reconciliation_jobs SET next_check_at=now()-interval '1 second'");
 await a.query('BEGIN');
 const first=(await a.query('SELECT public.claim_nfse_reconciliation_jobs_internal(1) v')).rows[0].v;
 assert.equal(first.length,1);
 // The first connection still owns the transaction/row lock: second must skip, not duplicate or wait.
 await b.query("SET statement_timeout='2s'");
 assert.deepEqual((await b.query('SELECT public.claim_nfse_reconciliation_jobs_internal(1) v')).rows[0].v,[]);
 await a.query('COMMIT');
 const old=first[0];
 await admin.query("UPDATE private.nfse_reconciliation_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[old.jobId]);
 const newer=(await b.query('SELECT public.claim_nfse_reconciliation_jobs_internal(1) v')).rows[0].v[0];
 assert.notEqual(newer.leaseToken,old.leaseToken);
 await assert.rejects(a.query("SELECT public.finish_nfse_reconciliation_job_internal($1,$2,'PENDING','PENDING',NULL)",[old.jobId,old.leaseToken]),/Stale/);
 await admin.query("UPDATE private.nfse_individual_operations SET state='AUTHORIZED',authorized_xml='proof' WHERE id=$1",[id(1)]);
 const final=(await b.query("SELECT public.finish_nfse_reconciliation_job_internal($1,$2,'PENDING','PENDING',NULL) v",[newer.jobId,newer.leaseToken])).rows[0].v;
 assert.equal(final.state,'DONE');
 console.log('PASS PostgreSQL: concurrent SKIP LOCKED, unique lease, expired lease fence, terminal wins.');
}finally{await Promise.all(clients.map(c=>c.end()));}
