import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = readFileSync(new URL('../migrations/20261020003000_bound_caixa_latest_proesc_snapshot.sql', import.meta.url), 'utf8');
const query = (tag) => source.split(`$${tag}$`)[1]
  .replace(' into v_snapshot', '').replaceAll('p_receivable_id', '$1::uuid');
const oldQuery = query('old');
const newQuery = query('new');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rows = async (sql, receipt) => (await db.query(sql, [receipt])).rows;
const parity = async (receipt, expectedId) => {
  const before = await rows(oldQuery, receipt);
  assert.deepEqual(await rows(newQuery, receipt), before, 'Full snapshot parity');
  assert.equal(before[0]?.id, expectedId);
};
try {
  await db.exec(`CREATE SCHEMA internal_proesc;
    CREATE TABLE internal_proesc.obligation_links(id uuid PRIMARY KEY,receivable_id uuid UNIQUE);
    CREATE TABLE internal_proesc.financial_snapshots(id uuid PRIMARY KEY,link_id uuid,
      observed_at timestamptz,recorded_at timestamptz,verification text,components jsonb);
    CREATE INDEX snapshots_link_time ON internal_proesc.financial_snapshots(link_id,observed_at DESC);
    INSERT INTO internal_proesc.obligation_links VALUES('${id(1)}','${id(101)}'),
      ('${id(2)}','${id(102)}'),('${id(3)}',null);
    INSERT INTO internal_proesc.financial_snapshots VALUES
      ('${id(11)}','${id(1)}','2026-10-01','2026-10-01','VERIFIED','{"interestCents":100}'),
      ('${id(12)}','${id(1)}','2026-10-02','2026-10-02','REVIEW','{"interestCents":null}'),
      ('${id(13)}','${id(1)}','2026-10-02','2026-10-02','CONFLICT','{}'),
      ('${id(14)}','${id(3)}','2026-10-03','2026-10-03','VERIFIED','{}');`);
  await parity(id(101), id(13)); // Latest REVIEW/CONFLICT still supersedes old proof.
  await parity(id(102), undefined); // Link without observation.
  await parity(id(999), undefined); // Missing link.
  await parity(null, undefined); // Archived NULL receipt must not be matched.
  await db.exec(`UPDATE internal_proesc.financial_snapshots SET recorded_at='2026-10-04'
    WHERE id='${id(12)}'`);
  await parity(id(101), id(12)); // Recorded timestamp precedes the UUID tie-break.
  await db.exec(`UPDATE internal_proesc.financial_snapshots SET observed_at='2026-10-05'
    WHERE id='${id(11)}'`);
  for (let i = 0; i < 3; i++) await parity(id(101), id(11));
  // Many unrelated histories must not force a complete history sort per title.
  await db.exec(`INSERT INTO internal_proesc.financial_snapshots
    SELECT md5(n::text)::uuid,'${id(1)}','2026-09-01'::timestamptz+n*interval '1 second',
      '2026-09-01','REVIEW','{}' FROM generate_series(1,30000) n;
    ANALYZE internal_proesc.financial_snapshots; ANALYZE internal_proesc.obligation_links;`);
  const plan = (await rows(`EXPLAIN (ANALYZE, FORMAT JSON) ${newQuery}`, id(101)))[0]['QUERY PLAN'][0];
  const nodes = (node) => [node, ...(node.Plans ?? []).flatMap(nodes)];
  assert.ok(nodes(plan.Plan).some((n) => n['Parent Relationship'] === 'InitPlan'));
  const index = nodes(plan.Plan).find((n) => n['Index Name'] === 'snapshots_link_time');
  assert.ok(index, 'Existing link/time index is used');
  assert.ok(index['Actual Rows'] < 10, 'LIMIT reads only the newest timestamp group');
  await parity(id(101), id(11));
  console.log('PASS latest snapshot: full-row parity, status priority, ties, empty/null, bounded index plan');
} finally {
  await db.close();
}
