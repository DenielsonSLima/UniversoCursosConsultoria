import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';
import { createCopyFixture, installCopyAuthorizerFixture, syntheticCopyReceipt } from './fixtures/proesc-v2-copy.fixture.mjs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
let checks = 0;
const pass = (label) => { checks++; console.log(`PASS ${label}`); };
const f = await createCopyFixture();
try {
  const { db, id, run, task, observationIds: ids, scalar } = f;
  const prepare = (batch = id(4900), selected = ids) => scalar(
    'SELECT internal_proesc.v2_prepare_copy_archive($1,$2,$3,$4::uuid[]) value', [batch, run, '3145', selected]);
  const exportOne = () => scalar('SELECT public.proesc_v2_export_copy_service($1) value', [id(4900)]);
  await prepare();
  const source = await exportOne();
  await db.exec("SET timezone='America/Maceio'; SET datestyle='SQL, DMY'");
  assert.deepEqual(await exportOne(), source);
  pass('exact source bytes survive caller timezone and DateStyle changes');

  await assert.rejects(prepare(id(4901), [[ids[0], ids[1]], [ids[1], ids[2]]]), /selection/);
  pass('multidimensional observation arrays fail closed');

  await db.exec('BEGIN');
  await db.query(`UPDATE internal_proesc.v2_invoice_observations SET normalized=
    jsonb_build_object('unitId','3145','invoiceId','901','large',repeat('x',1100000)) WHERE id=$1`, [ids[0]]);
  await assert.rejects(prepare(id(4902)), /byte limit/);
  await db.exec('ROLLBACK');
  pass('source above one MiB cannot produce a plan');

  await db.exec('BEGIN');
  await db.query("UPDATE internal_proesc.v2_tasks SET resource='people',source_year=0,source_month=0 WHERE id=$1", [task]);
  await assert.rejects(prepare(id(4903)), /scope/);
  await db.exec('ROLLBACK');
  pass('invoice incorrectly linked to a complete people task is excluded');

  const receipt = syntheticCopyReceipt(source);
  const digits = '1'.repeat(64);
  const numericDigest = JSON.stringify({ ...receipt, compressedSha256: digits,
    objectName: `${source.batchId}.${digits}.jsonl.gz` })
    .replace(`"compressedSha256":"${digits}"`, `"compressedSha256":${digits}`);
  await assert.rejects(scalar('SELECT public.proesc_v2_record_copy_receipt_service($1,$2::jsonb) value',
    [id(4900), numericDigest]), /Invalid receipt digest/);
  pass('numeric digest cannot masquerade as a 64-character SHA-256 string');

  await db.exec(`ALTER TABLE internal_proesc.v2_runs ADD COLUMN future_private_field text DEFAULT 'SYNTHETIC_FUTURE';
    ALTER TABLE internal_proesc.v2_invoice_observations ADD COLUMN future_private_field text DEFAULT 'SYNTHETIC_FUTURE'`);
  assert.deepEqual(await exportOne(), source);
  assert.equal(source.payloadText.includes('SYNTHETIC_FUTURE'), false);
  pass('future schema columns are not silently added to the fixed export contract');
  assert.equal(await scalar('SELECT count(*)::int value FROM internal_proesc.v2_copy_archive_plans'), 1);
  assert.equal(await scalar('SELECT count(*)::int value FROM internal_proesc.v2_copy_archive_receipts'), 0);
  pass('rejected adversaries leave no extra plans or receipts');
} finally { await f.db.close(); }

const baseline = await createFixture();
try {
  const { db } = baseline;
  const scalar = async (sql) => (await db.query(sql)).rows[0].value;
  for (const name of ['20261009224423_prepare_proesc_v2_payload_storage_off.sql',
    '20261009224508_validate_proesc_v2_payload_constraints_off.sql']) await db.exec(read(`../migrations/${name}`));
  await installCopyAuthorizerFixture(db);
  await db.exec('SELECT internal_proesc.v2_set_payload_storage_enabled(true)');
  const gateHash = await scalar("SELECT md5(prosrc) value FROM pg_proc WHERE oid='internal_proesc.v2_assert_payload_readers()'::regprocedure");
  const draft = read('../review-drafts/proesc-v2-growth/05_copy_only_catalog.draft.sql');
  const badSource = draft.replace('Copy source exceeds byte limit', 'Unreviewed source byte limit');
  const badGate = draft.replace(`IS DISTINCT FROM '${gateHash}'`, "IS DISTINCT FROM '00000000000000000000000000000000'");
  for (const [label, sql] of [['source hash drift', badSource], ['reader inventory drift', badGate]]) {
    assert.notEqual(sql, draft, 'Adversarial edit must actually alter the installation');
    await assert.rejects(db.exec(sql));
    await db.exec('ROLLBACK');
    for (const relation of ['plans', 'receipts']) assert.equal(await scalar(
      `SELECT to_regclass('internal_proesc.v2_copy_archive_${relation}') value`), null);
    for (const signature of ['internal_proesc.v2_copy_archive_source(uuid,text,uuid[])',
      'public.proesc_v2_export_copy_service(uuid)', 'public.proesc_v2_record_copy_receipt_service(uuid,jsonb)']) {
      assert.equal(await scalar(`SELECT to_regprocedure('${signature}') value`), null);
    }
    assert.equal(await scalar("SELECT md5(prosrc) value FROM pg_proc WHERE oid='internal_proesc.v2_assert_payload_readers()'::regprocedure"), gateHash);
    assert.equal(await scalar('SELECT enabled value FROM internal_proesc.v2_payload_storage_control WHERE singleton'), true);
    pass(`atomic rollback preserves the prior ON state, reader gate and absence of new objects: ${label}`);
  }
  await db.exec(draft);
  assert.equal(await scalar('SELECT enabled value FROM internal_proesc.v2_payload_storage_control WHERE singleton'), true);
  await db.exec('SELECT internal_proesc.v2_assert_payload_readers()');
  for (const relation of ['plans', 'receipts']) assert.equal(await scalar(
    `SELECT count(*)::int value FROM internal_proesc.v2_copy_archive_${relation}`), 0);
  pass('valid installation preserves ON and creates only an empty copy-only catalog');
} finally { await baseline.db.close(); }
console.log(JSON.stringify({ result: 'PASS', checks, limitations: [
  'PGlite single-session fixtures; does not establish native PostgreSQL concurrency',
  'No production export, Storage network, remote authorization or upload',
] }));
