import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';

const runs = 20, invoices = 100;
const draft = name => readFileSync(new URL(`../review-drafts/proesc-v2-growth/${name}.draft.sql`, import.meta.url), 'utf8');
async function measure(enabled) {
  const { db, id, actor, revision } = await createFixture();
  const scalar = async sql => (await db.query(sql)).rows[0].value;
  try {
    for (const name of ['01_payload_storage', '02_payload_readers', '03_payload_writer']) await db.exec(draft(name));
    await db.query('update internal_proesc.v2_payload_storage_control set enabled=$1', [enabled]);
    const start = performance.now();
    for (let run = 1; run <= runs; run++) {
      await db.exec('BEGIN');
      await db.query(`insert into internal_proesc.v2_runs(id,actor_id,credential_revision,mode,status,finished_at)
        values($1,$2,$3,'FULL','COMPLETE',now());`, [id(10000 + run), actor, revision]);
      await db.query(`insert into internal_proesc.v2_tasks(id,run_id,resource,unit_id,source_year,source_month,status)
        values($1,$2,'invoices','3145',2026,9,'COMPLETE')`, [id(20000 + run), id(10000 + run)]);
      // Isolated storage microbenchmark, not a replacement for the runtime test.
      await db.query(`select internal_proesc.v2_stage_invoice(t,jsonb_build_object(
        'invoiceId',n::text,'personId','11','sourceEnrollmentId','22','sourceClassId','123',
        'personHash',repeat('a',64),'unitId','3145','dueDate','2026-09-15',
        'principalCents',27990,'paidCents',0,'paymentDate',null,'sourceStatus','VENCIDO',
        'groupId','99','order',1,'groupTotal',12,'financialConfiguration',
        '{"fineRate":"2","interestRate":"0.033","earlyDiscountCents":1990,"fixedDiscountCents":0}'::jsonb,
        'reviewReasons','[]'::jsonb),clock_timestamp())
        from internal_proesc.v2_tasks t cross join generate_series(1,$2::integer) n where t.id=$1`,
      [id(20000 + run), invoices]);
      await db.query(`update internal_proesc.v2_invoice_observations set result='UNLINKED',
        reason='SOURCE_OBLIGATION_NOT_LINKED' where run_id=$1`, [id(10000 + run)]);
      await db.exec('COMMIT');
    }
    const writeMs = performance.now() - start;
    const observations = Number(await scalar('select count(*) value from internal_proesc.v2_invoice_observations'));
    const payloads = Number(await scalar('select count(*) value from internal_proesc.v2_invoice_payloads'));
    const payloadColumnBytes = Number(await scalar(`select
      coalesce((select sum(pg_column_size(normalized)) from internal_proesc.v2_invoice_observations),0)
      +coalesce((select sum(pg_column_size(normalized)) from internal_proesc.v2_invoice_payloads),0) value`));
    const localRelationBytes = Number(await scalar(`select pg_total_relation_size('internal_proesc.v2_invoice_observations')
      +pg_total_relation_size('internal_proesc.v2_invoice_payloads') value`));
    const proof = await scalar(`select md5(string_agg(internal_proesc.v2_invoice_normalized(o)::text,''
      order by run_id,invoice_id)) value from internal_proesc.v2_invoice_observations o`);
    assert.equal(observations, runs * invoices);
    assert.equal(payloads, enabled ? invoices : 0);
    return { enabled, observations, payloads, payloadColumnBytes, localRelationBytes, writeMs, proof };
  } finally { await db.close(); }
}

try {
  const legacy = await measure(false), canonical = await measure(true);
  assert.equal(canonical.proof, legacy.proof, 'Every run/record resolves to identical evidence');
  assert.ok(canonical.payloadColumnBytes < legacy.payloadColumnBytes);
  assert.ok(canonical.localRelationBytes < legacy.localRelationBytes);
  console.log(JSON.stringify({ result: 'PASS', runs, invoices, legacy, canonical,
    payloadReduction: 1 - canonical.payloadColumnBytes / legacy.payloadColumnBytes,
    localRelationReduction: 1 - canonical.localRelationBytes / legacy.localRelationBytes,
    scope: 'Storage only; actual PostgreSQL in WASM; no snapshots or people changes; no maintenance',
    wal: 'Not measured: single-process WASM is not evidence of production WAL or multi-backend contention',
    timing: 'One cold sequential sample per mode, diagnostic only; not a production performance claim' }, null, 2));
} catch (error) { console.error(error.stack); process.exitCode = 1; }
