import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = readFileSync(new URL(
  '../migrations/20261021005000_index_caixa_snapshot_latest_order.sql', import.meta.url), 'utf8');
const nodes = (node) => [node, ...(node.Plans ?? []).flatMap(nodes)];
const scalar = async (sql) => (await db.query(sql)).rows[0].value;

try {
  await db.exec(`
    create schema internal_proesc;
    create role authenticated;
    create table internal_proesc.obligation_links(id uuid primary key);
    create table internal_proesc.financial_snapshots(
      id uuid primary key,link_id uuid not null,observed_at timestamptz not null,
      recorded_at timestamptz not null,verification text,source_status text,payload text);
    alter table internal_proesc.financial_snapshots enable row level security;
    revoke all on internal_proesc.financial_snapshots from public,authenticated;
    create index proesc_financial_snapshots_link_time_idx
      on internal_proesc.financial_snapshots(link_id,observed_at desc);
    insert into internal_proesc.obligation_links
      select md5('link-'||n)::uuid from generate_series(1,7143) n;
    insert into internal_proesc.financial_snapshots
      (id,link_id,observed_at,recorded_at,verification,source_status,payload)
      select md5('snapshot-'||n||'-'||position)::uuid,md5('link-'||n)::uuid,
        '2026-10-01'::timestamptz+least(position,12)*interval '1 hour',
        '2026-10-01'::timestamptz+least(position,13)*interval '1 hour',
        case when position=14 then 'REVIEW' else 'VERIFIED' end,
        case when position=14 then 'UNKNOWN' else 'OPEN' end,
        repeat(md5(n::text||'-'||position),16)
      from generate_series(1,7143) n cross join generate_series(1,14) position;
    analyze internal_proesc.obligation_links;
    analyze internal_proesc.financial_snapshots;
  `);
  // The full tie-break matches caixa_proesc_effective_snapshot. Fetch a value
  // outside the index so the benchmark cannot become a count-only index scan.
  const latest = `select l.id link_id,s.id,s.verification,s.source_status,s.payload
    from internal_proesc.obligation_links l
    left join lateral (
      select s.* from internal_proesc.financial_snapshots s where s.link_id=l.id
      order by s.observed_at desc,s.recorded_at desc,s.id desc limit 1
    ) s on true`;
  const resultQuery = `select count(*) count,
    md5(string_agg(row_to_json(r)::text,'|' order by link_id)) fingerprint
    from (${latest}) r`;
  const plan = async () => (await db.query(
    `explain(analyze,buffers,format json) ${resultQuery}`)).rows[0]['QUERY PLAN'][0];
  const blocks = (explanation) => explanation.Plan['Shared Hit Blocks']
    + explanation.Plan['Shared Read Blocks'];
  const tableMetadata = () => scalar(`select jsonb_build_object('acl',relacl,
    'rls',relrowsecurity,'owner',relowner,'lockTimeout',current_setting('lock_timeout'),
    'statementTimeout',current_setting('statement_timeout')) value
    from pg_class where oid='internal_proesc.financial_snapshots'::regclass`);
  const facts = () => scalar(`select md5(string_agg(row_to_json(s)::text,'|' order by id)) value
    from internal_proesc.financial_snapshots s`);
  const before = (await db.query(resultQuery)).rows;
  const planBefore = await plan();
  assert.equal(Number(before[0].count),7143);
  assert.ok(nodes(planBefore.Plan).some(node => node['Node Type']==='Incremental Sort'
    && node['Actual Loops']===7143),'existing index sorts each latest timestamp group');
  const expected = await scalar(`select count(*) value from (${latest}) r
    where r.id<>(select max(s.id::text)::uuid from internal_proesc.financial_snapshots s
      where s.link_id=r.link_id and s.observed_at='2026-10-01 12:00:00+00'
        and s.recorded_at='2026-10-01 13:00:00+00')`);
  assert.equal(Number(expected),0,'recorded_at and UUID resolve equal observed_at timestamps');
  const metadataBefore = await tableMetadata();
  const factsBefore = await facts();
  await db.exec(migration);
  const after = (await db.query(resultQuery)).rows;
  const planAfter = await plan();
  assert.deepEqual(after,before,'index preserves the latest snapshot, status and payload for all links');
  assert.equal(await facts(),factsBefore,'index leaves historical evidence unchanged');
  assert.deepEqual(await tableMetadata(),metadataBefore,'ACL/RLS and session timeout settings remain unchanged');
  const indexed = nodes(planAfter.Plan).find(node => node['Index Name']==='proesc_snapshots_latest_order_idx');
  assert.ok(indexed,'planner uses the complete ordering index');
  assert.equal(indexed['Actual Loops'],7143);
  assert.equal(indexed['Actual Rows'],1,'LIMIT 1 reads one snapshot per link');
  assert.ok(!nodes(planAfter.Plan).some(node => node['Node Type']==='Incremental Sort'));
  assert.ok(blocks(planAfter)<blocks(planBefore),'full ordering visits fewer buffers');
  console.log(`PASS latest snapshot ordering: 7143 links, 100002 snapshots, ties and evidence parity; `
    + `buffers ${blocks(planBefore)} -> ${blocks(planAfter)}; `
    + `execution ${planBefore['Execution Time']}ms -> ${planAfter['Execution Time']}ms`);
} finally {
  await db.close();
}
