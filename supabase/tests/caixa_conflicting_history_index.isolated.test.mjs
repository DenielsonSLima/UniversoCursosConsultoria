import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Extend the existing exact-query cache harness, then run its same 44 net and
// 22 early-payment rejection cases. Neither original policy suite is edited.
const indexedHistorySetup = async () => {
  const historyMigration = migration('20261020005500_index_caixa_proesc_conflicting_history.sql');
  await db.exec('BEGIN');
  await db.exec('ALTER FUNCTION internal_proesc.v2_net_discount_candidate(uuid,uuid) VOLATILE');
  await assert.rejects(() => db.exec(historyMigration), /Composition candidate drift/);
  await db.exec('ROLLBACK');
  await db.exec(historyMigration);
  const oldHistory = 'AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots h WHERE h.link_id=l.id AND (';
  const newHistory = "AND NOT EXISTS(SELECT 1 FROM internal_proesc.financial_snapshots h WHERE h.link_id=l.id\n"
    + "        AND (h.source_status IN ('CANCELED','PAID') OR h.accounting_lines<>'[]'::jsonb)\n        AND (";
  // The parent harness checks full source and all metadata after this setup.
  // Only this exact redundant filter and the one scoped GUC are permitted.
  assert.equal(candidateSources[1].split(oldHistory).length, 2);
  candidateSources[1] = candidateSources[1].replace(oldHistory, newHistory);
  for (const metadata of candidateMetadata) {
    assert.deepEqual(metadata.proconfig, ['search_path=""']);
    metadata.proconfig = ['search_path=""', 'plan_cache_mode=force_generic_plan'];
  }
  const index = await scalar("select pg_get_indexdef('internal_proesc.proesc_snapshots_net_rule_history_idx'::regclass) value");
  assert.match(index, /btree \(link_id\)/);
  assert.match(index, /CANCELED.*PAID/);
  assert.match(index, /accounting_lines <> '\[\]'::jsonb/);
  await db.exec('BEGIN');
  // Reproduce the real shape: many harmless OPEN observations for each paid
  // evidence row. Generated history is rolled back before policy assertions.
  await db.exec(`INSERT INTO internal_proesc.financial_snapshots
    SELECT (jsonb_populate_record(null::internal_proesc.financial_snapshots,
      to_jsonb(s)||jsonb_build_object('id',md5(s.id::text||':'||n)::uuid,
        'source_status','OPEN','evidence_kind','API_V2_INVOICE_OPEN',
        'accounting_lines','[]'::jsonb))).*
    FROM internal_proesc.financial_snapshots s CROSS JOIN generate_series(1,2000) n;
    ANALYZE internal_proesc.financial_snapshots;`);
  const link = await scalar('select link_id value from internal_proesc.financial_snapshots limit 1');
  const plan = (await db.query(`EXPLAIN (FORMAT JSON) SELECT id
    FROM internal_proesc.financial_snapshots WHERE link_id=$1
      AND (source_status IN ('CANCELED','PAID') OR accounting_lines<>'[]'::jsonb)`, [link])).rows;
  assert.match(JSON.stringify(plan), /proesc_snapshots_net_rule_history_idx/);
  await db.exec('ROLLBACK');
  console.log('PASS: indexed relevant history uses partial index amid 2000 harmless OPEN rows per title; exact filter, generic-plan GUC, metadata and drift guard verified.');
};

const harnessUrl = new URL('caixa_candidate_cached_plans.isolated.test.mjs', import.meta.url);
let source = readFileSync(harnessUrl, 'utf8');
const marker = '  await db.exec(cacheMigration);';
assert.equal(source.split(marker).length, 2);
source = source.replace(marker, () => marker + '\nawait (' + indexedHistorySetup.toString() + ')();')
  .replace('new URL(name, import.meta.url)', 'new URL(name, ' + JSON.stringify(harnessUrl.href) + ')');
// The historical net suite also checks its exact GUC list independently.
// Extend only that expectation for the newly authorized scoped plan setting.
const loader = "let source = readFileSync(url, 'utf8');";
source = source.replace(loader, () => loader + '\nsource = source.replace('
  + JSON.stringify("config: ['search_path=\"\"']") + ', '
  + JSON.stringify("config: ['search_path=\"\"', 'plan_cache_mode=force_generic_plan']") + ');');
const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
  encoding: 'utf8', env: process.env, maxBuffer: 3 * 1024 * 1024,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
assert.equal(result.status, 0, 'Indexed history policy parity');
