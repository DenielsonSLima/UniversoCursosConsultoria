import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = readFileSync(new URL(
  '../../docs/operations/sql/caixa-composition-invoice-index.concurrent.sql', import.meta.url), 'utf8');
const runMigration = readFileSync(new URL(
  '../../docs/operations/sql/caixa-composition-full-run-index.concurrent.sql', import.meta.url), 'utf8');
const invoice = `SELECT * FROM internal_proesc.v2_invoice_observations
  WHERE unit_id='3145' AND invoice_id='42'
  ORDER BY observed_at DESC, recorded_at DESC, id DESC LIMIT 1`;
const fullRun = `SELECT id FROM internal_proesc.v2_runs
  WHERE mode='FULL' AND status='COMPLETE'
  ORDER BY finished_at DESC, id DESC LIMIT 1`;
const rows = async (sql) => (await db.query(sql)).rows;
const plan = async (sql) => (await rows('EXPLAIN (ANALYZE, FORMAT JSON) ' + sql))[0]['QUERY PLAN'][0];
const nodes = (node) => [node, ...(node.Plans ?? []).flatMap(nodes)];
const fingerprint = async () => rows(`SELECT
  (SELECT md5(string_agg(to_jsonb(o)::text,'' ORDER BY id))
    FROM internal_proesc.v2_invoice_observations o) observations,
  (SELECT md5(string_agg(to_jsonb(r)::text,'' ORDER BY id))
    FROM internal_proesc.v2_runs r) runs`);
try {
  await db.exec(`
    CREATE SCHEMA internal_proesc;
    CREATE TABLE internal_proesc.v2_runs(
      id uuid PRIMARY KEY,mode text,status text,finished_at timestamptz);
    CREATE TABLE internal_proesc.v2_invoice_observations(
      id uuid PRIMARY KEY,run_id uuid,unit_id text,invoice_id text,link_id uuid,
      observed_at timestamptz,recorded_at timestamptz,result text,snapshot_id uuid,
      normalized jsonb,UNIQUE(run_id,unit_id,invoice_id));
    CREATE INDEX proesc_v2_invoice_link_time
      ON internal_proesc.v2_invoice_observations(link_id,observed_at DESC);
    INSERT INTO internal_proesc.v2_runs
      SELECT md5(n::text)::uuid,
        CASE WHEN n%2=0 THEN 'FULL' ELSE 'RECENT' END,
        CASE WHEN n%3=0 THEN 'FAILED' ELSE 'COMPLETE' END,
        '2026-10-01'::timestamptz+n*interval '1 second'
      FROM generate_series(1,2000) n;
    INSERT INTO internal_proesc.v2_invoice_observations
      SELECT md5(n::text)::uuid,md5((n/100)::text)::uuid,
        '3145',(n%100)::text,md5((n%100)::text)::uuid,
        '2026-10-01'::timestamptz+(n/100)*interval '1 second',
        '2026-10-01'::timestamptz+(n/100)*interval '1 second',
        'PRESERVED',md5((n%100)::text)::uuid,'{}'::jsonb
      FROM generate_series(1,30000) n;
    ANALYZE internal_proesc.v2_invoice_observations;
    ANALYZE internal_proesc.v2_runs;
  `);
  const before = await fingerprint();
  const expectedInvoice = await rows(invoice);
  const expectedRun = await rows(fullRun);
  const beforePlan = await plan(invoice);
  assert.ok(nodes(beforePlan.Plan).some(n => n['Node Type'] === 'Sort'));
  // WASM validates identical keys/predicate and query results, not concurrent
  // production build mechanics. Keep deployment SQL explicitly nontransactional.
  for (const source of [migration, runMigration]) {
    assert.match(source, /CREATE INDEX CONCURRENTLY/);
    assert.doesNotMatch(source.replace(/^--.*$/gm, ''), /\b(?:BEGIN|COMMIT)\s*;/);
    await db.exec(source.replace('CREATE INDEX CONCURRENTLY', 'CREATE INDEX'));
  }
  assert.deepEqual(await fingerprint(), before, 'Indexes must not mutate evidence');
  assert.deepEqual(await rows(invoice), expectedInvoice);
  assert.deepEqual(await rows(fullRun), expectedRun);
  const afterPlan = await plan(invoice);
  const afterNodes = nodes(afterPlan.Plan);
  assert.ok(afterNodes.some(n => n['Index Name'] === 'proesc_v2_invoice_source_latest'));
  assert.ok(afterNodes.every(n => n['Node Type'] !== 'Sort'));
  assert.equal(afterNodes.find(n => n['Index Name'])['Actual Rows'], 1);
  const runPlan = await plan(fullRun);
  assert.ok(nodes(runPlan.Plan).some(n => n['Index Name'] === 'proesc_v2_runs_full_complete_latest'));
  assert.ok(nodes(runPlan.Plan).every(n => n['Node Type'] !== 'Sort'));
  for (let i=0; i<3; i++) assert.deepEqual(await rows(invoice), expectedInvoice);
  assert.deepEqual(await rows(invoice.replace("invoice_id='42'", "invoice_id='absent'")), []);
  // New incompatible evidence with no link must win over an older valid row.
  await db.exec(`INSERT INTO internal_proesc.v2_invoice_observations
    (id,unit_id,invoice_id,observed_at,recorded_at,result,normalized)
    VALUES('ffffffff-ffff-4fff-8fff-fffffffffff1','3145','42',
      '2026-10-02','2026-10-02','UNLINKED','{}'),
      ('ffffffff-ffff-4fff-8fff-fffffffffff2','3145','42',
      '2026-10-02','2026-10-02','REVIEW','{}')`);
  assert.equal((await rows(invoice))[0].result, 'REVIEW', 'ID tie-break is preserved');
  assert.equal((await rows(invoice))[0].link_id, null);
  await db.exec(`UPDATE internal_proesc.v2_invoice_observations
    SET recorded_at='2026-10-03' WHERE id='ffffffff-ffff-4fff-8fff-fffffffffff1'`);
  assert.equal((await rows(invoice))[0].result, 'UNLINKED', 'Recorded-time tie-break is preserved');
  // A newer RECENT/FAILED run cannot replace completed FULL identity evidence.
  await db.exec(`INSERT INTO internal_proesc.v2_runs VALUES
    ('ffffffff-ffff-4fff-8fff-fffffffffff1','RECENT','COMPLETE','2026-10-03'),
    ('ffffffff-ffff-4fff-8fff-fffffffffff2','FULL','FAILED','2026-10-03')`);
  assert.deepEqual(await rows(fullRun), expectedRun);
  await db.exec(`INSERT INTO internal_proesc.v2_runs VALUES
    ('ffffffff-ffff-4fff-8fff-fffffffffff3','FULL','COMPLETE','2026-10-04'),
    ('ffffffff-ffff-4fff-8fff-fffffffffff4','FULL','COMPLETE','2026-10-04')`);
  assert.equal((await rows(fullRun))[0].id, 'ffffffff-ffff-4fff-8fff-fffffffffff4',
    'Completed FULL run timestamp ties preserve descending UUID order');
  console.log(JSON.stringify({
    result:'PASS evidence parity, empty/repeated reads, all-status latest evidence, tie-breaks, FULL predicate',
    rows:30000, beforePlan:beforePlan.Plan, afterPlan:afterPlan.Plan,
    beforeMs:beforePlan['Execution Time'],afterMs:afterPlan['Execution Time']
  },null,2));
} finally { await db.close(); }
