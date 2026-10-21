import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Extend the existing production-shaped harness and retain its 44 net-rule
// and 22 early-payment rejection cases, resolver parity and metadata checks.
const earlyHistorySetup = async () => {
  const signature = 'internal_proesc.v2_calculated_composition_candidate(uuid,uuid)';
  const patch = migration('20261021004000_index_caixa_early_composition_history.sql');
  const oldHistory = 'AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots h WHERE h.link_id=l.id AND (';
  const newHistory = 'AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots h WHERE h.link_id=l.id\n'
    + "        AND (h.evidence_kind='PORTAL_CONFIRMED' OR h.source_status='CANCELED'\n"
    + "          OR h.accounting_lines<>'[]'::jsonb)\n        AND (";
  const originalSource = await scalar('select prosrc value from pg_proc where oid=$1::regprocedure', [signature]);
  const sourceBefore = await candidateResults();
  const facts = () => scalar(`select md5(jsonb_build_object(
    'receipts',(select jsonb_agg(to_jsonb(c) order by id) from public.contas_receber c),
    'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from internal_proesc.financial_snapshots s),
    'observations',(select jsonb_agg(to_jsonb(o) order by id) from internal_proesc.v2_invoice_observations o))::text) value`);
  const factsBefore = await facts();
  await db.exec('BEGIN');
  await db.exec('ALTER FUNCTION internal_proesc.v2_calculated_composition_candidate(uuid,uuid) VOLATILE');
  await assert.rejects(() => db.exec(patch), /Early composition candidate drift/);
  await db.exec('ROLLBACK');
  await db.exec(patch);
  assert.equal(await facts(), factsBefore, 'index/function DDL leaves financial facts unchanged');
  assert.deepEqual(await candidateResults(), sourceBefore, 'all existing candidate results preserved');
  assert.equal(candidateSources[0].split(oldHistory).length, 2);
  candidateSources[0] = candidateSources[0].replace(oldHistory, newHistory);
  assert.equal(await scalar('select prosrc value from pg_proc where oid=$1::regprocedure', [signature]),
    originalSource.replace(oldHistory, newHistory));

  // Compare the exact historical predicate for all relevant JSON/NULL boundaries.
  const complete = "h.evidence_kind='PORTAL_CONFIRMED' OR h.source_status='CANCELED'"
    + " OR EXISTS(SELECT 1 FROM jsonb_array_elements(h.accounting_lines) line"
    + " WHERE line->>'cancelled'='true' OR line->>'renegotiation'='true')";
  const superset = "h.evidence_kind='PORTAL_CONFIRMED' OR h.source_status='CANCELED'"
    + " OR h.accounting_lines<>'[]'::jsonb";
  const guard = (filtered) => `select exists(select 1 from
    (select $1::text evidence_kind,$2::text source_status,$3::jsonb accounting_lines) h
    where ${filtered ? `(${superset}) AND ` : ''}(${complete})) value`;
  const cases = [
    ['PORTAL_CONFIRMED', 'OPEN', '[]', true],
    ['PORTAL_CONFIRMED', 'OPEN', null, true],
    ['API_V2_INVOICE_OPEN', 'CANCELED', '[]', true],
    ['API_V2_INVOICE_OPEN', 'OPEN', '[{"cancelled":true}]', true],
    ['API_V2_INVOICE_OPEN', 'OPEN', '[{"renegotiation":true}]', true],
    ['API_V2_INVOICE_OPEN', 'OPEN', '[{"cancelled":false,"renegotiation":false}]', false],
    ['API_V2_INVOICE_PAID', 'PAID', '[]', false],
    ['UNRESOLVED', 'UNKNOWN', null, false],
    [null, null, null, false],
    [null, null, '[{"cancelled":"true"}]', true],
  ];
  for (const [kind, state, lines, expected] of cases) {
    const args = [kind, state, lines];
    assert.equal(await scalar(guard(false), args), expected);
    assert.equal(await scalar(guard(true), args), expected);
  }
  for (const lines of ['{}', 'null', '42', '"invalid"']) {
    for (const filtered of [false, true]) {
      await assert.rejects(() => scalar(guard(filtered), ['UNRESOLVED', 'UNKNOWN', lines]),
        (error) => error.code === '22023', 'malformed non-array JSON still fails closed');
    }
  }

  await db.exec('BEGIN');
  await db.exec(`CREATE INDEX diagnostic_snapshot_link_time
      ON internal_proesc.financial_snapshots(link_id,observed_at DESC);
    INSERT INTO internal_proesc.financial_snapshots
    SELECT (jsonb_populate_record(null::internal_proesc.financial_snapshots,
      to_jsonb(s)||jsonb_build_object('id',md5(s.id::text||':early:'||n)::uuid,
        'source_status','OPEN','evidence_kind','API_V2_INVOICE_OPEN',
        'accounting_lines','[]'::jsonb))).*
    FROM internal_proesc.financial_snapshots s CROSS JOIN generate_series(1,2000) n;
    ANALYZE internal_proesc.financial_snapshots;`);
  const link = await scalar('select link_id value from internal_proesc.financial_snapshots limit 1');
  const query = (filtered) => `select exists(select 1 from internal_proesc.financial_snapshots h
    where h.link_id=$1 ${filtered ? `AND (${superset})` : ''} AND (${complete})) value`;
  const explain = async (filtered) => (await db.query(
    `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query(filtered)}`, [link])).rows[0]['QUERY PLAN'][0];
  const before = await explain(false);
  const after = await explain(true);
  const nodes = (node) => [node, ...(node.Plans ?? []).flatMap(nodes)];
  const blocks = (plan) => plan.Plan['Shared Hit Blocks'] + plan.Plan['Shared Read Blocks'];
  assert.equal(await scalar(query(false), [link]), await scalar(query(true), [link]));
  assert.ok(nodes(after.Plan).some(node => node['Index Name'] === 'proesc_snapshots_early_rule_history_idx'));
  assert.ok(blocks(before) > blocks(after) * 5, 'indexed early history avoids unrelated observations');
  await db.exec('ROLLBACK');
  console.log(`PASS early history: PORTAL empty, cancellation, JSON/NULL/error parity; buffers ${blocks(before)} -> ${blocks(after)}`);
};

const harnessUrl = new URL('caixa_conflicting_history_index.isolated.test.mjs', import.meta.url);
let source = readFileSync(harnessUrl, 'utf8');
const marker = "  console.log('PASS: indexed relevant history";
assert.equal(source.split(marker).length, 2);
source = source.replace(marker, () => '  await (' + earlyHistorySetup.toString() + ')();\n' + marker)
  .replace("new URL('caixa_candidate_cached_plans.isolated.test.mjs', import.meta.url)",
    "new URL('caixa_candidate_cached_plans.isolated.test.mjs', " + JSON.stringify(harnessUrl.href) + ')');
const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
  encoding: 'utf8', env: process.env, maxBuffer: 4 * 1024 * 1024,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
assert.equal(result.status, 0, 'Early indexed history policy parity');
