// PostgreSQL-only race test through the existing disposable local adapter.
import assert from 'node:assert/strict';
import {continuationFixture,addSubmitted,calls,kick,enable} from './nfse-reconciliation-continuation.fixture.mjs';

const db=await continuationFixture(new URL('./nfse-worker-postgres-adapter.mjs',import.meta.url).href);
const first=new db.constructor(),second=new db.constructor();
try {
  await addSubmitted(db,1);
  await db.exec(`UPDATE private.nfse_reconciliation_jobs SET next_check_at=clock_timestamp()+interval '5 seconds' WHERE state='READY'`);
  await enable(db);
  await first.exec('BEGIN');
  await kick(first); // Retain the advisory transaction lock after enqueue.
  assert.equal((await calls(first)).length,1);
  await second.exec(`SET statement_timeout='2s'`);
  await kick(second); // Must skip the held lock instead of waiting/enqueueing.
  assert.equal((await calls(second)).length,0,'uncommitted enqueue remains owned by the first transaction');
  await first.exec('COMMIT');
  await kick(second); await kick(db);
  assert.equal((await calls(db)).length,1,'concurrent/repeated kicks share the pending wake-up');
  assert.equal(Number((await db.query(`SELECT count(*) n FROM private.nfse_reconciliation_jobs WHERE state='READY'`)).rows[0].n),1);
  assert.equal(Number((await db.query(`SELECT count(*) n FROM private.nfse_reconciliation_jobs WHERE state='LEASED'`)).rows[0].n),0);
  console.log('PASS PostgreSQL continuation: held advisory lock skips a concurrent kickoff; committed pending wake-up is deduplicated.');
} finally {
  await first.exec('ROLLBACK');
  await first.close(); await second.close(); await db.close();
}
