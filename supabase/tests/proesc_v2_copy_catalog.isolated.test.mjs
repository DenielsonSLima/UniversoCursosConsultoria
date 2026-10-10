import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCopyFixture, syntheticCopyReceipt } from './fixtures/proesc-v2-copy.fixture.mjs';

const f = await createCopyFixture();
const { db, id, run, task, observationIds: ids, scalar } = f;
const prepare = (batch = id(4000), selected = ids, sourceRun = run, unit = '3145') => scalar(
  'SELECT internal_proesc.v2_prepare_copy_archive($1,$2,$3,$4::uuid[]) value', [batch, sourceRun, unit, selected]);
const exportBatch = (batch = id(4000)) => scalar('SELECT public.proesc_v2_export_copy_service($1) value', [batch]);
const record = (receipt, batch = id(4000)) => scalar('SELECT public.proesc_v2_record_copy_receipt_service($1,$2::jsonb) value', [batch, JSON.stringify(receipt)]);
let checks = 0;
async function check(name, body) { await body(); checks++; console.log(`PASS ${name}`); }
const sourceState = () => scalar(`SELECT jsonb_build_object('observations',
  (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM internal_proesc.v2_invoice_observations o),
  'snapshots',(SELECT count(*) FROM internal_proesc.financial_snapshots),
  'receivables',(SELECT count(*) FROM public.contas_receber)) value`);
try {
  const before = await sourceState();
  await check('IDs must be explicit, unique, bounded and found in one completed run/unit', async () => {
    for (const selected of [null, [], [ids[0], ids[0]], [null], Array(101).fill(ids[0]), [id(9999)]]) await assert.rejects(prepare(id(4001), selected));
    await assert.rejects(prepare(id(4001), ids, run, '3146'), /scope/);
    await assert.rejects(prepare(id(4001), ids, id(9999)), /no rows/);
    assert.equal(await scalar('SELECT count(*)::int value FROM internal_proesc.v2_copy_archive_plans'), 0);
  });
  await check('RUNNING, FAILED, staged observations and incomplete tasks are excluded', async () => {
    await db.query("UPDATE internal_proesc.v2_runs SET status='FAILED' WHERE id=$1", [run]);
    await assert.rejects(prepare(), /complete source run/);
    await db.query("UPDATE internal_proesc.v2_runs SET status='RUNNING',finished_at=NULL WHERE id=$1", [run]);
    await assert.rejects(prepare(), /complete source run/);
    await db.query("UPDATE internal_proesc.v2_runs SET status='COMPLETE',finished_at='2026-09-02Z' WHERE id=$1", [run]);
    await db.query("UPDATE internal_proesc.v2_tasks SET status='COLLECTED' WHERE id=$1", [task]);
    await assert.rejects(prepare(), /scope/);
    await db.query("UPDATE internal_proesc.v2_tasks SET status='COMPLETE' WHERE id=$1", [task]);
    await db.query("UPDATE internal_proesc.v2_tasks SET resource='people',source_year=0,source_month=0 WHERE id=$1", [task]);
    await assert.rejects(prepare(), /scope/);
    await db.query("UPDATE internal_proesc.v2_tasks SET resource='invoices',source_year=2026,source_month=9 WHERE id=$1", [task]);
    await db.query("UPDATE internal_proesc.v2_invoice_observations SET result='STAGED' WHERE id=$1", [ids[0]]);
    await assert.rejects(prepare(), /scope/);
    await db.query("UPDATE internal_proesc.v2_invoice_observations SET result='UNLINKED' WHERE id=$1", [ids[0]]);
  });
  await check('plan replay canonicalizes IDs and rejects changed selections', async () => {
    assert.deepEqual(await prepare(), await prepare(id(4000), [...ids].reverse()));
    await assert.rejects(prepare(id(4000), [ids[0]]), /replay conflict/);
  });
  const source = await exportBatch();
  const receipt = syntheticCopyReceipt(source);
  await check('future run/observation columns are not silently exported', async () => {
    await db.exec("ALTER TABLE internal_proesc.v2_runs ADD COLUMN future_sensitive text DEFAULT 'not-approved'; ALTER TABLE internal_proesc.v2_invoice_observations ADD COLUMN future_sensitive text DEFAULT 'not-approved'");
    assert.equal((await exportBatch()).payloadText.includes('future_sensitive'), false);
    assert.deepEqual(await exportBatch(), source);
    await db.exec('ALTER TABLE internal_proesc.v2_runs DROP COLUMN future_sensitive; ALTER TABLE internal_proesc.v2_invoice_observations DROP COLUMN future_sensitive');
  });
  await check('export resolves inline/canonical and preserves exact numeric JSON text', async () => {
    assert.equal(source.rowCount, 3); assert.deepEqual(source.observationIds, ids);
    assert.equal(source.rawBytes, Buffer.byteLength(source.payloadText));
    assert.equal(source.payloadSha256, createHash('sha256').update(source.payloadText).digest('hex'));
    const envelope = JSON.parse(source.payloadText);
    for (const row of envelope.rows) {
      assert.match(row.normalizedJson, /9007199254740993/);
      assert.match(row.normalizedJson, /1234567890\.12345678901234567890/);
      assert.equal(Object.hasOwn(row.observation, 'normalized'), false);
    }
    assert.equal(envelope.rows[1].observation.normalized_payload_id !== null, true);
  });
  await check('unknown batches cannot be exported and post-plan source drift fails closed', async () => {
    await assert.rejects(exportBatch(id(9999)), /no rows/);
    await db.query("UPDATE internal_proesc.v2_invoice_observations SET reason='changed' WHERE id=$1", [ids[0]]);
    await assert.rejects(exportBatch(), /changed after approved plan/);
    await db.query('UPDATE internal_proesc.v2_invoice_observations SET reason=NULL WHERE id=$1', [ids[0]]);
    assert.deepEqual(await exportBatch(), source);
  });
  await check('receipt rejects wrong destination, IDs, hash, shape and limits before insertion', async () => {
    const variants = [
      { ...receipt, batchId: id(9999) }, { ...receipt, copyOnly: false }, { ...receipt, payloadSha256: 'd'.repeat(64) },
      { ...receipt, rawBytes: receipt.rawBytes + 1 }, { ...receipt, rowCount: 2 }, { ...receipt, extra: true },
      { ...receipt, storageScope: { ...receipt.storageScope, tenantId: '3146' } },
      { ...receipt, objectName: `${id(9999)}.${receipt.compressedSha256}.jsonl.gz` },
      { ...receipt, compressedBytes: 4194305 }, { ...receipt, manifestJsonBytes: 65537 },
      { ...receipt, manifestCompressedBytes: 0 }, { ...receipt, compressedBytes: '600' },
    ];
    for (const v of variants) await assert.rejects(record(v));
    assert.equal(await scalar('SELECT count(*)::int value FROM internal_proesc.v2_copy_archive_receipts'), 0);
  });
  await check('receipt replay is idempotent, divergent replay refuses and sources never change', async () => {
    const first = await record(receipt); assert.deepEqual(await record(receipt), first);
    await assert.rejects(record({ ...receipt, compressedBytes: 601 }), /replay conflict/);
    assert.equal(await scalar('SELECT count(*)::int value FROM internal_proesc.v2_copy_archive_receipts'), 1);
    assert.deepEqual(await sourceState(), before);
  });
  await check('authorization precedes replay and exposed users cannot use service RPCs', async () => {
    await db.exec(`SELECT set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
    await assert.rejects(record(receipt), /autorizado/); await assert.rejects(exportBatch(), /autorizado/);
    await db.exec(`SELECT set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const relation of ['plans', 'receipts']) assert.equal(await scalar(
        "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') value", [role, `internal_proesc.v2_copy_archive_${relation}`]), false);
      assert.equal(await scalar("SELECT has_function_privilege($1,'internal_proesc.v2_prepare_copy_archive(uuid,uuid,text,uuid[])','EXECUTE') value", [role]), false);
      assert.equal(await scalar("SELECT has_function_privilege($1,'public.proesc_v2_export_copy_service(uuid)','EXECUTE') value", [role]), role === 'service_role');
    }
    await db.exec('SET ROLE service_role');
    assert.deepEqual(await exportBatch(), source); assert.deepEqual(await record(receipt), { batchId: id(4000), status: 'COPY_RECEIPT_RECORDED', copyOnly: true });
    await assert.rejects(prepare(), /permission denied/); await db.exec('RESET ROLE');
  });
  await check('catalog entries cannot be changed/deleted and rollback leaves no plan', async () => {
    for (const relation of ['plans', 'receipts']) {
      await assert.rejects(db.exec(`DELETE FROM internal_proesc.v2_copy_archive_${relation}`), /immutable/);
      await assert.rejects(db.exec(`UPDATE internal_proesc.v2_copy_archive_${relation} SET ${relation === 'plans' ? 'unit_id=unit_id' : 'receipt=receipt'}`), /immutable/);
    }
    await db.exec('BEGIN'); await prepare(id(4002)); await db.exec('ROLLBACK');
    assert.equal(await scalar('SELECT count(*)::int value FROM internal_proesc.v2_copy_archive_plans'), 1);
  });
  await check('strict reader gate permits exact reviewed exporter and still detects drift', async () => {
    await db.exec('SELECT internal_proesc.v2_assert_payload_readers()');
    await db.exec('SELECT internal_proesc.v2_set_payload_storage_enabled(true)');
    await db.exec('SELECT internal_proesc.v2_set_payload_storage_enabled(false)');
    assert.equal(await scalar('SELECT provolatile value FROM pg_proc WHERE oid=\'internal_proesc.v2_copy_archive_source(uuid,text,uuid[])\'::regprocedure'), 's');
    const fn = await scalar("SELECT pg_get_functiondef('internal_proesc.v2_copy_archive_source(uuid,text,uuid[])'::regprocedure) value");
    await db.exec(fn.replace('Invalid bounded copy selection', 'Changed copy selection'));
    await assert.rejects(db.exec('SELECT internal_proesc.v2_set_payload_storage_enabled(true)'), /adapter drift/);
    await db.exec('SELECT internal_proesc.v2_set_payload_storage_enabled(false)');
  });
  console.log(JSON.stringify({ result: 'PASS', checks, limitations: ['Synthetic SQL fixtures, no production export or upload', 'Receipt asserts trusted worker verification; SQL cannot attest remote bytes', 'Multi-session copy concurrency is pending native CI'] }));
} finally { await db.close(); }
