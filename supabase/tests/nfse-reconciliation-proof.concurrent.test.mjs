// PostgreSQL-only race test. The fixture adapter rejects non-local/non-disposable databases.
import assert from 'node:assert/strict';
import { fixture, migration, issue, authProof, uid } from './nfse-reconciliation-fixture.mjs';
const db = await fixture(new URL('./nfse-worker-postgres-adapter.mjs', import.meta.url).href);
await migration(db, '20261112220100_nfse_reconciliation_material.sql');
await migration(db, '20261112220200_nfse_reconciliation_proof.sql');
const blocker = new db.constructor();
const executor = new db.constructor();
const workerPid = Number((await executor.query('SELECT pg_backend_pid() pid')).rows[0].pid);
const blockerPid = Number((await blocker.query('SELECT pg_backend_pid() pid')).rows[0].pid);
await executor.exec(`SELECT set_config('request.jwt.claim.role','service_role',false)`);
await blocker.exec(`SELECT set_config('request.jwt.claim.role','service_role',false)`);
async function waitForFiscalLock() {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const row = (await db.query(`SELECT wait_event_type, pg_blocking_pids(pid) blockers
      FROM pg_stat_activity WHERE pid=$1`, [workerPid])).rows[0];
    if (row?.wait_event_type === 'Lock' && row.blockers.map(Number).includes(blockerPid)) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Worker did not reach the observed fiscal row lock barrier');
}
async function race(n, change) {
  const job = await issue(db, n);
  assert(job, 'fresh job claimed');
  await blocker.exec('BEGIN');
  let resultPromise;
  try {
    await blocker.query('SELECT id FROM private.nfse_individual_operations WHERE id=$1 FOR UPDATE', [uid(n)]);
    resultPromise = executor.query(
      'SELECT public.complete_nfse_reconciliation_proof_internal($1,$2,$3) completed',
      [job.jobId, job.leaseToken, authProof(n)],
    ).then(value => ({ value }), error => ({ error }));
    await waitForFiscalLock(); // Proven wait, not a timing assumption.
    if (change === 'EXPIRE') {
      await db.query(`UPDATE private.nfse_reconciliation_jobs
        SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1`, [job.jobId]);
    } else if (change === 'ROTATE') {
      await db.query(`UPDATE private.nfse_reconciliation_jobs
        SET lease_token=$2,lease_until=clock_timestamp()+interval '90 seconds' WHERE id=$1`, [job.jobId, uid(9000+n)]);
    } else {
      // Another valid fiscal result wins while the late worker is waiting.
      await blocker.query(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED',
        authorized_xml='winning-existing-proof',result='{"winner":"other-executor"}' WHERE id=$1`, [uid(n)]);
    }
    await blocker.exec('COMMIT');
    const result = await resultPromise;
    assert(result.error, `${change}: late proof must reject`);
    assert.equal(result.error.code, '42501');
    assert.match(result.error.message, /lease unavailable/i);
    const canonical = (await db.query(`SELECT state,authorized_xml,result
      FROM private.nfse_individual_operations WHERE id=$1`, [uid(n)])).rows[0];
    if (change === 'TERMINAL') {
      assert.equal(canonical.state, 'AUTHORIZED');
      assert.equal(canonical.authorized_xml, 'winning-existing-proof');
      assert.deepEqual(canonical.result, { winner: 'other-executor' });
      assert.equal((await db.query('SELECT state FROM private.nfse_reconciliation_jobs WHERE id=$1', [job.jobId])).rows[0].state, 'DONE');
    } else {
      assert.equal(canonical.state, 'PROCESSING');
      assert.equal(canonical.authorized_xml, null);
      assert.equal(canonical.result, null);
      if (change === 'ROTATE') {
        assert.equal((await db.query('SELECT lease_token FROM private.nfse_reconciliation_jobs WHERE id=$1', [job.jobId])).rows[0].lease_token, uid(9000+n));
      }
    }
    console.log(`PASS real PostgreSQL race ${change}: stale proof rejected after observed fiscal lock wait`);
  } finally {
    await blocker.exec('ROLLBACK');
    if (resultPromise) await resultPromise;
  }
}
try {
  await race(1, 'EXPIRE');
  await race(2, 'ROTATE');
  await race(3, 'TERMINAL');
} finally {
  await executor.close();
  await blocker.close();
  await db.close();
}
