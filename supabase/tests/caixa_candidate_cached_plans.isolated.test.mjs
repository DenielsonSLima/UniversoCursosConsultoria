import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Reuse both canonical rejection suites unchanged. Only their isolated setup is
// augmented with the deployed payload adapter and the cached-plan migration.
const setup = async () => {
  const cachedSignatures = [
    'internal_proesc.v2_calculated_composition_candidate(uuid,uuid)',
    'internal_proesc.v2_net_discount_candidate(uuid,uuid)',
  ];
  const hadNetCandidate = await scalar("select to_regprocedure($1) value", [cachedSignatures[1]]);
  if (!hadNetCandidate) {
    // The automatic-early suite predates the later net-discount policy. Install
    // its untouched definition solely to exercise this atomic two-function patch;
    // its resolver and fixtures continue testing the original early policy.
    const netDefinition = migration('20261003050000_proesc_paid_net_discount_rule.sql')
      .match(/CREATE FUNCTION internal_proesc\.v2_net_discount_candidate[\s\S]*?\$candidate\$;/)[0];
    await db.exec('SET check_function_bodies=off');
    await db.exec(netDefinition);
    await db.exec('SET check_function_bodies=on');
    await db.exec('REVOKE ALL ON FUNCTION internal_proesc.v2_net_discount_candidate(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role');
  }
  await db.exec(`CREATE FUNCTION internal_proesc.v2_invoice_normalized(
    p_observation internal_proesc.v2_invoice_observations)
    RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT ($1).normalized $$;`);
  if (!hadNetCandidate) await db.exec('SET check_function_bodies=off');
  for (const signature of cachedSignatures) {
    const definition = await scalar('select pg_get_functiondef($1::regprocedure) value', [signature]);
    await db.exec(definition
      .replace('SELECT * FROM internal_proesc.v2_invoice_observations o',
        'SELECT o.*,internal_proesc.v2_invoice_normalized(o) canonical_normalized FROM internal_proesc.v2_invoice_observations o')
      .replaceAll('o.normalized', 'o.canonical_normalized'));
  }
  if (!hadNetCandidate) await db.exec('SET check_function_bodies=on');
  const candidateMetadata = [];
  const candidateSources = [];
  for (const signature of cachedSignatures) {
    candidateMetadata.push(await scalar("select to_jsonb(p)-'prosrc'-'prolang' value from pg_proc p where oid=$1::regprocedure", [signature]));
    candidateSources.push(await scalar('select prosrc value from pg_proc where oid=$1::regprocedure', [signature]));
  }
  const candidateResults = async () => (await db.query(`select c.id,
    internal_proesc.v2_calculated_composition_candidate(c.id,s.id) early
    ${hadNetCandidate ? ',internal_proesc.v2_net_discount_candidate(c.id,s.id) net' : ''}
    from public.contas_receber c join internal_proesc.obligation_links l on l.receivable_id=c.id
    left join lateral(select id from internal_proesc.financial_snapshots where link_id=l.id
      order by observed_at desc,recorded_at desc,id desc limit 1) s on true order by c.id`)).rows;
  const resultsBeforeCache = await candidateResults();
  const cacheMigration = migration('20261020005000_cache_caixa_proesc_candidate_plans.sql');
  await db.exec('BEGIN');
  await db.exec('ALTER FUNCTION internal_proesc.v2_calculated_composition_candidate(uuid,uuid) VOLATILE');
  await assert.rejects(() => db.exec(cacheMigration), /Composition candidate drift/);
  await db.exec('ROLLBACK');
  await db.exec(cacheMigration);
  assert.deepEqual(await candidateResults(), resultsBeforeCache, 'Cached plans preserve every candidate result');
  for (let i=0;i<cachedSignatures.length;i++) {
    const signature = cachedSignatures[i];
    assert.deepEqual(await scalar("select to_jsonb(p)-'prosrc'-'prolang' value from pg_proc p where oid=$1::regprocedure", [signature]), candidateMetadata[i]);
    assert.equal(await scalar('select l.lanname value from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=$1::regprocedure', [signature]), 'plpgsql');
    assert.equal(await scalar('select prosrc value from pg_proc where oid=$1::regprocedure', [signature]),
      '\nBEGIN\n  RETURN (' + candidateSources[i].replace(/;(\s*)$/, '$1') + ');\nEND;\n');
  }
  console.log('PASS: both candidate queries preserved byte-for-byte inside cached wrappers; metadata, ACLs, drift guard and fixture results unchanged.');
};

const suites = [
  ['proesc_paid_net_discount_rule.isolated.test.mjs',
    "  await db.exec(migration('20261020004500_gate_caixa_proesc_composition_reads.sql'));"],
  ['proesc_v2_automatic_early_composition.isolated.test.mjs',
    "  await db.exec(patch);\n  assert.equal(await scalar('select count(*)::int value from internal_proesc.v2_automatic_composition_policies'), 3);"],
];

for (const [name, marker] of suites) {
  const url = new URL(name, import.meta.url);
  let source = readFileSync(url, 'utf8');
  assert.equal(source.split(marker).length, 2, `${name}: unique setup insertion`);
  source = source.replace(marker, () => marker + '\nawait (' + setup.toString() + ')();')
    .replaceAll('import.meta.url', JSON.stringify(url.href));
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8', env: process.env, maxBuffer: 2 * 1024 * 1024,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  assert.equal(result.status, 0, name);
}
