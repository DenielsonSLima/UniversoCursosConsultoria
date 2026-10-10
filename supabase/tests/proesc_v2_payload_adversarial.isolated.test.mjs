import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFixture } from './fixtures/proesc-v2-growth.fixture.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const file = `${root}/supabase/review-drafts/proesc-v2-growth/01_payload_storage.draft.sql`;
const migration = readFileSync(file, 'utf8');
const { db, id, actor, revision } = await createFixture();
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].v;
const row = { unitId: '3145', invoiceId: '901', sourceStatus: 'EM ABERTO', principalCents: 27990,
  paidCents: 0, paymentDate: null, reviewReasons: [], financialConfiguration: { fineRate: '2.0' } };
const intern = (payload = row, unit = payload.unitId, invoice = payload.invoiceId) => scalar(
  'select internal_proesc.v2_intern_invoice_payload($1,$2,$3::jsonb) as v', [unit, invoice, JSON.stringify(payload)]);
let assertions = 0;
async function test(name, body) { await body(); assertions++; console.log(`PASS ${name}`); }

try {
  await db.query(`insert into internal_proesc.v2_runs(id,actor_id,credential_revision,mode,status,finished_at)
    values($1,$2,$3,'FULL','COMPLETE',now())`, [id(100), actor, revision]);
  await db.query(`insert into internal_proesc.v2_tasks(id,run_id,resource,unit_id,source_year,source_month)
    values($1,$2,'invoices','3145',2026,9)`, [id(101), id(100)]);
  await db.query(`insert into internal_proesc.v2_invoice_observations(id,run_id,task_id,unit_id,invoice_id,
    source_status,normalized,result,observed_at)
    values($1,$2,$3,'3145','901','EM ABERTO',$4,'STAGED','2026-09-15')`,
    [id(102), id(100), id(101), JSON.stringify(row)]);
  const oldHash = await scalar(`select md5(to_jsonb(o)::text) as v from internal_proesc.v2_invoice_observations o where id='${id(102)}'`);
  const oldEvidence = await scalar(`select to_jsonb(o) as v from internal_proesc.v2_invoice_observations o where id='${id(102)}'`);
  await db.exec(migration);

  await test('feature flag starts OFF; prior payload remains inline', async () => {
    assert.equal(await scalar('select enabled as v from internal_proesc.v2_payload_storage_control'), false);
    assert.deepEqual(await scalar(`select normalized as v from internal_proesc.v2_invoice_observations where id='${id(102)}'`), row);
    assert.equal(await scalar(`select normalized_payload_id as v from internal_proesc.v2_invoice_observations where id='${id(102)}'`), null);
  });
  await test('legacy evidence and MD5 preserved despite added column', async () => {
    assert.deepEqual(await scalar(`select internal_proesc.v2_invoice_evidence(o) as v from internal_proesc.v2_invoice_observations o where id='${id(102)}'`), oldEvidence);
    assert.equal(await scalar(`select md5(internal_proesc.v2_invoice_evidence(o)::text) as v from internal_proesc.v2_invoice_observations o where id='${id(102)}'`), oldHash);
  });
  const a = await intern();
  await test('same JSON object reordered deduplicates', async () => {
    assert.equal(await intern(Object.fromEntries(Object.entries(row).reverse())), a);
  });
  const b = await intern({ ...row, principalCents: 27991 });
  await test('A to B to A canonicalizes A without losing a distinct B', async () => {
    assert.notEqual(b, a); assert.equal(await intern(), a);
  });
  await test('JSON null, zero, omitted value, string numeric and array order stay distinct', async () => {
    const variants = [
      { ...row, paidCents: null },
      Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'paidCents')),
      { ...row, paidCents: '0' },
      { ...row, reviewReasons: ['A', 'B'] },
      { ...row, reviewReasons: ['B', 'A'] },
    ];
    const ids = [a, ...await Promise.all(variants.map((r) => intern(r)))];
    assert.equal(new Set(ids).size, ids.length);
  });
  await test('same payload cannot be interned under mismatching identity', async () => {
    await assert.rejects(intern(row, '9999', '901'), /Invalid canonical invoice identity/);
    await assert.rejects(intern(row, '3145', '902'), /Invalid canonical invoice identity/);
    await assert.rejects(scalar(`select internal_proesc.v2_intern_invoice_payload('3145','901',null) as v`), /Invalid canonical invoice identity/);
  });
  await test('same invoice in another unit and different invoice remain isolated', async () => {
    assert.notEqual(await intern({ ...row, unitId: '3146' }), a);
    assert.notEqual(await intern({ ...row, invoiceId: '902' }), a);
  });

  await db.query(`insert into internal_proesc.v2_runs(id,actor_id,credential_revision,mode,status,finished_at)
    values($1,$2,$3,'RECENT','COMPLETE',now())`, [id(200), actor, revision]);
  await db.query(`insert into internal_proesc.v2_tasks(id,run_id,resource,unit_id,source_year,source_month)
    values($1,$2,'invoices','3145',2026,9)`, [id(201), id(200)]);
  const insertCanonical = (obsId, invoice, normalized, payloadId) => db.query(`
    insert into internal_proesc.v2_invoice_observations(id,run_id,task_id,unit_id,invoice_id,
      source_status,normalized,normalized_payload_id,result,observed_at)
    values($1,$2,$3,'3145',$4,'EM ABERTO',$5,$6,'STAGED','2026-09-16')`,
    [obsId, id(200), id(201), invoice, normalized, payloadId]);
  await insertCanonical(id(202), '901', null, a);
  await test('canonical resolver equals original payload; metadata and FULL/RECENT identities preserved', async () => {
    assert.deepEqual(await scalar(`select internal_proesc.v2_invoice_normalized(o) as v from internal_proesc.v2_invoice_observations o where id='${id(202)}'`), row);
    assert.equal(await scalar('select count(*)::int as v from internal_proesc.v2_invoice_observations'), 2);
    assert.deepEqual((await db.query('select mode from internal_proesc.v2_runs order by id')).rows.map((r) => r.mode), ['FULL', 'RECENT']);
  });
  await test('new canonical FK refuses cross-invoice pointer and nonexistent payload', async () => {
    await assert.rejects(insertCanonical(id(203), '902', null, a), /foreign key/);
    await assert.rejects(insertCanonical(id(204), '903', null, id(9999)), /foreign key/);
  });
  await test('exactly one representation required and JSON-null inline rejected', async () => {
    await assert.rejects(insertCanonical(id(205), '904', null, null), /v2_invoice_one_payload/);
    await assert.rejects(insertCanonical(id(206), '905', JSON.stringify(row), a), /v2_invoice_one_payload/);
    await assert.rejects(insertCanonical(id(207), '906', 'null', null), /check constraint/);
  });
  await test('canonical payload immutability enforced for update and delete', async () => {
    await assert.rejects(db.query('update internal_proesc.v2_invoice_payloads set normalized=$1 where id=$2', [JSON.stringify({ ...row, paidCents: 1 }), a]), /immutable/);
    await assert.rejects(db.query('delete from internal_proesc.v2_invoice_payloads where id=$1', [a]), /immutable/);
  });
  await test('resolver fails closed on synthetic malformed composite/reference', async () => {
    await assert.rejects(scalar(`select internal_proesc.v2_invoice_normalized(jsonb_populate_record(null::internal_proesc.v2_invoice_observations,
      jsonb_build_object('unit_id','3145','invoice_id','901','normalized_payload_id','${id(9999)}'))) as v`), /no rows/);
    await assert.rejects(scalar(`select internal_proesc.v2_invoice_normalized(null::internal_proesc.v2_invoice_observations) as v`), /Invalid V2 payload representation/);
  });
  await test('SQL rollback removes newly interned payload and adds no observation', async () => {
    const count = await scalar('select count(*)::int as v from internal_proesc.v2_invoice_payloads');
    await db.exec('begin');
    await intern({ ...row, invoiceId: '990' });
    await db.exec('rollback');
    assert.equal(await scalar('select count(*)::int as v from internal_proesc.v2_invoice_payloads'), count);
  });
  await test('all exposed roles denied direct helper, table and control access', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const table of ['v2_invoice_payloads', 'v2_payload_storage_control']) {
        assert.equal(await scalar(`select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as v`, [role, `internal_proesc.${table}`]), false);
      }
      for (const fn of ['v2_intern_invoice_payload(text,text,jsonb)', 'v2_invoice_normalized(internal_proesc.v2_invoice_observations)', 'v2_invoice_evidence(internal_proesc.v2_invoice_observations)']) {
        assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\') as v', [role, `internal_proesc.${fn}`]), false);
      }
    }
  });
  await test('simulated digest collision fails closed rather than aliasing wrong payload', async () => {
    const digest = await scalar(`select encode(content_hash,'hex') as v from internal_proesc.v2_invoice_payloads where id='${a}'`);
    await db.exec(`create or replace function extensions.digest(text,text) returns bytea language sql immutable as $$ select decode('${digest}','hex') $$`);
    await assert.rejects(intern({ ...row, principalCents: 42 }), /hash collision/);
  });
  console.log(JSON.stringify({ result: 'PASS', groups: assertions,
    storageDraftSHA256: createHash('sha256').update(migration).digest('hex'),
    limitations: ['PGlite single backend; no real concurrent transactions', 'Only storage draft tested here; adapter/writer and full financial path tested separately', 'Fixture authorization is isolated, not production RBAC'] }, null, 2));
} finally { await db.close(); }
