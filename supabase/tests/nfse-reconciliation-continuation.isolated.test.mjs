import assert from 'node:assert/strict';
import {continuationFixture,addSubmitted,calls,kick,enable} from './nfse-reconciliation-continuation.fixture.mjs';

const db=await continuationFixture(process.argv[2]);
try {
  assert.equal((await db.query('SELECT enabled FROM private.nfse_reconciliation_control')).rows[0].enabled,false);
  await addSubmitted(db,1); await addSubmitted(db,2);
  await db.exec(`UPDATE private.nfse_reconciliation_jobs SET next_check_at=clock_timestamp()-interval '1 second'`);
  await enable(db); await kick(db);
  assert.equal((await calls(db)).length,1);
  // Both trigger phases occur inside the original one-second debounce. The
  // claim must schedule one continuation; fast completion must reuse it.
  const job=(await db.query('SELECT public.claim_nfse_reconciliation_jobs_internal(1) jobs')).rows[0].jobs[0];
  await db.query(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED',authorized_xml='synthetic-proof' WHERE id=$1`,[job.operationId]);
  let requests=await calls(db);
  assert.equal(requests.length,2,'fast completion keeps exactly one short continuation');
  assert.equal(requests[1].body.delaySeconds,1);
  assert.equal(Number((await db.query(`SELECT count(*) n FROM private.nfse_reconciliation_jobs WHERE state='READY'`)).rows[0].n),1);
  await kick(db); await kick(db);
  assert.equal((await calls(db)).length,2,'repeated kicks reuse the pending continuation');
  assert(requests.every(call=>call.body.delaySeconds>=0 && call.body.delaySeconds<=10));

  // Finish the remaining target, then a slower short wake-up must not hold back
  // a newly submitted operation with an earlier due time.
  await db.exec(`UPDATE private.nfse_reconciliation_control SET enabled=false,last_kick_at=NULL,scheduled_kick_at=NULL;
    UPDATE private.nfse_individual_operations SET state='AUTHORIZED',authorized_xml='synthetic-proof';`);
  await addSubmitted(db,3);
  await db.exec(`UPDATE private.nfse_reconciliation_jobs SET next_check_at=clock_timestamp()+interval '9 seconds' WHERE state='READY'`);
  await enable(db); await kick(db);
  requests=await calls(db);
  assert.equal(requests.at(-1).body.delaySeconds,9);
  const beforeEarlier=requests.length;
  await addSubmitted(db,4);
  requests=await calls(db);
  assert.equal(requests.length,beforeEarlier+1,'earlier operation preempts a pending slower kickoff');
  assert(requests.at(-1).body.delaySeconds>=1 && requests.at(-1).body.delaySeconds<=3);
  const stable=requests.length; await kick(db);
  assert.equal((await calls(db)).length,stable);

  // A 30/60-second backoff remains in the queue. No worker is scheduled to
  // sleep through it; the minute cron can schedule it when due is near.
  await db.exec(`UPDATE private.nfse_reconciliation_control SET enabled=false,last_kick_at=NULL,scheduled_kick_at=NULL;
    UPDATE private.nfse_individual_operations SET state='AUTHORIZED',authorized_xml='synthetic-proof';`);
  await addSubmitted(db,5);
  for(const seconds of [30,60]) {
    await db.exec(`UPDATE private.nfse_reconciliation_control SET enabled=false;
      UPDATE private.nfse_reconciliation_jobs SET next_check_at=clock_timestamp()+interval '${seconds} seconds' WHERE state='READY'`);
    const before=(await db.query(`SELECT next_check_at FROM private.nfse_reconciliation_jobs WHERE state='READY'`)).rows[0].next_check_at;
    const count=(await calls(db)).length;
    await enable(db); await kick(db);
    assert.equal((await calls(db)).length,count,`${seconds}s uses durable fallback rather than a sleeping worker`);
    const after=(await db.query(`SELECT next_check_at FROM private.nfse_reconciliation_jobs WHERE state='READY'`)).rows[0].next_check_at;
    assert.equal(String(after),String(before),'kick does not shorten the job backoff');
  }
  await db.exec(`UPDATE private.nfse_reconciliation_control SET enabled=false;
    UPDATE private.nfse_reconciliation_jobs SET next_check_at=clock_timestamp()+interval '6 seconds' WHERE state='READY'`);
  const countBeforeFallback=(await calls(db)).length;
  await enable(db); await kick(db);
  assert.equal((await calls(db)).length,countBeforeFallback+1,'minute fallback starts a near-due job');
  assert.equal((await calls(db)).at(-1).body.delaySeconds,6);
  assert.equal((await db.query('SELECT schedule FROM cron.jobs')).rows[0].schedule,'* * * * *');

  // An active lease is not a reason to start another worker. After an actual
  // throttled consultation, its 300-second delay remains untouched.
  await db.exec(`UPDATE private.nfse_reconciliation_control SET enabled=false,last_kick_at=NULL,scheduled_kick_at=NULL;
    UPDATE private.nfse_reconciliation_jobs SET next_check_at=clock_timestamp()-interval '1 second' WHERE state='READY'`);
  const leased=(await db.query('SELECT public.claim_nfse_reconciliation_jobs_internal(1) jobs')).rows[0].jobs[0];
  const beforeLease=(await calls(db)).length; await enable(db); await kick(db);
  assert.equal((await calls(db)).length,beforeLease,'live lease is not reclaimed early');
  await db.query(`SELECT public.finish_nfse_reconciliation_job_internal($1,$2,'PENDING','THROTTLED',300)`,[leased.jobId,leased.leaseToken]);
  assert.equal((await calls(db)).length,beforeLease,'throttling is not bypassed by continuation');
  const throttled=(await db.query(`SELECT state,extract(epoch FROM next_check_at-clock_timestamp()) wait
    FROM private.nfse_reconciliation_jobs WHERE id=$1`,[leased.jobId])).rows[0];
  assert.equal(throttled.state,'READY'); assert(Number(throttled.wait)>299);

  // Enqueue failures must roll back the scheduled marker, so retry is possible
  // and valid fiscal rows are not rolled back by a failed network mock.
  await db.exec(`UPDATE private.nfse_reconciliation_control SET enabled=false,last_kick_at=NULL,scheduled_kick_at=NULL;
    UPDATE private.nfse_reconciliation_jobs SET next_check_at=clock_timestamp()-interval '1 second' WHERE state='READY';
    SELECT set_config('test.fail_net','true',false);`);
  await enable(db); await kick(db);
  const failed=(await db.query('SELECT last_kick_at,scheduled_kick_at FROM private.nfse_reconciliation_control')).rows[0];
  assert.equal(failed.last_kick_at,null); assert.equal(failed.scheduled_kick_at,null);
  await db.exec(`SELECT set_config('test.fail_net','false',false)`); await kick(db);
  assert.equal((await calls(db)).length,beforeLease+1);
  assert.equal((await db.query(`SELECT has_function_privilege('authenticated','private.kick_nfse_reconciliation_worker()','EXECUTE') allowed`)).rows[0].allowed,false);
  assert.equal((await db.query('SELECT enabled FROM private.nfse_reconciliation_control')).rows[0].enabled,true,'migration did not toggle runtime activation');
  console.log('PASS continuation: fast completion, dedupe, earlier due, 30/60s fallback, live lease, 429 backoff, enqueue failure, ACL. No network or fiscal calls.');
} finally {await db.close();}
