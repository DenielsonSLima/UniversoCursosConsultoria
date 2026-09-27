import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Existing optional local dependency; this test never uses a URL, token or network.
const modulePath = process.env.PGLITE_MODULE_PATH;
const moduleURL = modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleURL);
const { pgcrypto } = await import(modulePath ? new URL('./contrib/pgcrypto.js', moduleURL).href
  : '@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
const source = (name) => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8');
const migration = source('20260927000500_skip_idle_proesc_compaction_history_hash');
const signature = 'internal_proesc.compact_snapshot_observations(integer)';
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const tables = ['obligation_links', 'financial_snapshots', 'compacted_snapshot_observations',
  'enrollment_financial_confirmations', 'reconciliation_events', 'sync_runs', 'sync_run_items',
  'packed_item_snapshot_refs'];
const queryOne = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const functionMetadata = () => queryOne(`SELECT to_jsonb(p)-'prosrc' AS value
  FROM pg_proc p WHERE oid=$1::regprocedure`, [signature]);

async function storedState() {
  const state = {};
  for (const table of tables) state[table] = (await queryOne(`SELECT coalesce(
    jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS value
    FROM internal_proesc.${table} t`)).value;
  state.cursor = (await queryOne(`SELECT cursor_id,total_compacted,
    last_finished_at IS NOT NULL AS finished FROM internal_proesc.storage_compaction_state`));
  return state;
}
async function reset() {
  await db.exec(`TRUNCATE ${tables.map((t) => `internal_proesc.${t}`).join(',')};
    UPDATE internal_proesc.storage_compaction_state
      SET cursor_id=NULL,total_compacted=0,last_finished_at=NULL;`);
}
async function seed({ count = 3, hot = false, blocks = false, protectedBy } = {}) {
  await db.query('INSERT INTO internal_proesc.obligation_links VALUES($1)', [uid(1)]);
  await db.query(`INSERT INTO internal_proesc.sync_runs VALUES($1,'SUCCEEDED',now()-interval '48 hours')`, [uid(90)]);
  for (let i = 0; i < count; i++) {
    const seconds = (hot ? 3600 : 172800) - i * 60;
    await db.query(`INSERT INTO internal_proesc.financial_snapshots
      VALUES($1,$2,now()-$3*interval '1 second',now()-$3*interval '1 second',$4,27990)`,
    [uid(100 + i), uid(1), seconds, blocks && i >= 3 ? 'UNKNOWN' : 'OPEN']);
    await db.query(`INSERT INTO internal_proesc.sync_run_items VALUES($1,$2,NULL,'UNCHANGED',NULL)`,
      [uid(90), uid(100 + i)]);
  }
  const middle = uid(101);
  if (protectedBy === 'confirmation') await db.query(`INSERT INTO internal_proesc.enrollment_financial_confirmations
    VALUES(jsonb_build_array(jsonb_build_object('snapshotId',$1::text)))`, [middle]);
  if (protectedBy === 'packed') await db.query('INSERT INTO internal_proesc.packed_item_snapshot_refs VALUES($1)', [middle]);
  if (protectedBy === 'keeper') await db.query(`INSERT INTO internal_proesc.compacted_snapshot_observations
    VALUES($1,$2,now()-interval '49 hours',now()-interval '49 hours')`, [uid(200), middle]);
  if (protectedBy === 'manual') await db.query(`INSERT INTO internal_proesc.reconciliation_events
    VALUES($1,NULL,'IMPORT','UNCHANGED')`, [middle]);
  if (protectedBy === 'failed') await db.query(`UPDATE internal_proesc.sync_run_items
    SET error_code='FIXTURE_FAILURE' WHERE snapshot_id=$1`, [middle]);
}

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA internal_proesc; CREATE SCHEMA extensions; CREATE SCHEMA fixture;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE internal_proesc.obligation_links(id uuid PRIMARY KEY);
    CREATE TABLE internal_proesc.financial_snapshots(
      id uuid PRIMARY KEY,link_id uuid,observed_at timestamptz,recorded_at timestamptz,
      source_status text,principal_cents bigint);
    CREATE TABLE internal_proesc.compacted_snapshot_observations(
      id uuid PRIMARY KEY,keeper_snapshot_id uuid,observed_at timestamptz,recorded_at timestamptz);
    CREATE TABLE internal_proesc.enrollment_financial_confirmations(confirmed_snapshots jsonb);
    CREATE TABLE internal_proesc.reconciliation_events(snapshot_id uuid,original_snapshot_id uuid,mode text,result text);
    CREATE TABLE internal_proesc.sync_runs(id uuid,status text,finished_at timestamptz);
    CREATE TABLE internal_proesc.sync_run_items(run_id uuid,snapshot_id uuid,original_snapshot_id uuid,result text,error_code text);
    CREATE TABLE internal_proesc.packed_item_snapshot_refs(snapshot_id uuid);
    CREATE SEQUENCE fixture.history_reads;
    CREATE FUNCTION fixture.history_read() RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$
      BEGIN PERFORM nextval('fixture.history_reads'); RETURN true; END;
    $$;
    -- The probe changes no field/content: it only proves whether history was read.
    CREATE VIEW internal_proesc.financial_observation_history AS
      SELECT s.* FROM internal_proesc.financial_snapshots s WHERE fixture.history_read()
      UNION ALL
      SELECT a.id,s.link_id,a.observed_at,a.recorded_at,s.source_status,s.principal_cents
      FROM internal_proesc.compacted_snapshot_observations a
      JOIN internal_proesc.financial_snapshots s ON s.id=a.keeper_snapshot_id
      WHERE fixture.history_read();
  `);
  await db.exec(source('20260919165139_proesc_observation_compaction'));
  const keeper = 'AND NOT EXISTS(SELECT 1 FROM internal_proesc.compacted_snapshot_observations a WHERE a.keeper_snapshot_id=s.id)';
  const packed = 'AND NOT EXISTS(SELECT 1 FROM internal_proesc.packed_item_snapshot_refs a WHERE a.snapshot_id=s.id)';
  assert.ok(source('20260919223611_proesc_items_archive').includes(packed));
  assert.ok(source('20260919234600_proesc_history_hot_window').includes("interval ''6 hours''"));
  let beforeDefinition = (await queryOne('SELECT pg_get_functiondef($1::regprocedure) AS value', [signature])).value;
  await db.exec(beforeDefinition.replace(keeper, `${keeper}\n    ${packed}`)
    .replaceAll("interval '24 hours'", "interval '6 hours'"));
  beforeDefinition = (await queryOne('SELECT pg_get_functiondef($1::regprocedure) AS value', [signature])).value;
  assert.equal((await queryOne('SELECT md5(pg_get_functiondef($1::regprocedure)) AS hash', [signature])).hash,
    '78ce8e039c288d7f849112d63171d002', 'Reconstruct the exact reviewed runtime definition');
  const metadata = await functionMetadata();
  await seed({ count: 5 });
  const stateBeforeMigration = await storedState();

  // Fail closed on configuration/body drift; no data or privilege can be changed.
  await db.exec(`ALTER FUNCTION ${signature} SET work_mem='17MB'`);
  await assert.rejects(() => db.exec(migration), /compactor source drift/);
  await db.exec('ROLLBACK');
  await db.exec(beforeDefinition);
  await db.exec(migration);
  assert.deepEqual(await storedState(), stateBeforeMigration, 'Migration does not execute compaction');
  assert.deepEqual(await functionMetadata(), metadata, 'OID/owner/ACL/security/search_path/configuration unchanged');
  const afterDefinition = (await queryOne('SELECT pg_get_functiondef($1::regprocedure) AS value', [signature])).value;
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await queryOne('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [role, signature])).allowed, false);
  }
  const history = async () => (await queryOne(`SELECT jsonb_agg(to_jsonb(h) ORDER BY id) AS value
    FROM internal_proesc.financial_observation_history h`)).value;
  async function runVersion(definition, limit) {
    await db.exec('BEGIN');
    try {
      await db.exec(definition);
      await db.exec("SELECT setval('fixture.history_reads',1,false)");
      const result = (await queryOne(`SELECT ${signature.split('(')[0]}($1) AS value`, [limit])).value;
      const reads = (await queryOne('SELECT CASE WHEN is_called THEN last_value ELSE 0 END AS value FROM fixture.history_reads')).value;
      return { result, reads: Number(reads), state: await storedState(), history: await history() };
    } finally { await db.exec('ROLLBACK'); }
  }
  const cases = [
    { name: 'empty cursor wraps', empty: true, count: 0, expected: 0, wrapped: true },
    { name: 'selected link without observations', count: 0, expected: 0 },
    { name: 'only first/last', count: 2, expected: 0, skipsHistory: true },
    { name: 'six hour hot window', hot: true, expected: 0, skipsHistory: true },
    { name: 'five equivalent observations', count: 5, expected: 3 },
    { name: 'first/last of each content block', count: 6, blocks: true, expected: 2 },
    ...['confirmation', 'packed', 'keeper', 'manual', 'failed'].map((protectedBy) => ({
      name: `${protectedBy} protected`, protectedBy, expected: 0, skipsHistory: true,
    })),
    { name: 'cursor selects next link only', count: 5, cursor: uid(1), addLink: true, expected: 0, limit: 1 },
    { name: 'cursor wraps after last link', count: 5, cursor: uid(1), expected: 0, wrapped: true },
    { name: 'null limit preserves default', count: 5, expected: 3, limit: null },
    { name: 'zero limit preserves clamp', count: 5, expected: 3, limit: 0 },
  ];
  for (const c of cases) {
    await reset();
    if (!c.empty) await seed(c);
    if (c.addLink) await db.query('INSERT INTO internal_proesc.obligation_links VALUES($1)', [uid(2)]);
    if (c.cursor) await db.query('UPDATE internal_proesc.storage_compaction_state SET cursor_id=$1', [c.cursor]);
    const originalHistory = await history();
    const original = await runVersion(beforeDefinition, c.limit === undefined ? 25 : c.limit);
    const optimized = await runVersion(afterDefinition, c.limit === undefined ? 25 : c.limit);
    assert.deepEqual(optimized.result, original.result, `${c.name}: same return contract`);
    assert.deepEqual(optimized.state, original.state, `${c.name}: same physical rows/references/cursor`);
    assert.deepEqual(optimized.history, originalHistory, `${c.name}: complete canonical history conserved`);
    assert.equal(optimized.result.compacted, c.expected, c.name);
    assert.equal(optimized.result.wrapped, c.wrapped ?? false, c.name);
    if (c.expected === 0) assert.equal(optimized.reads, 0, `${c.name}: no idle history reconstruction`);
    if (c.skipsHistory) assert.ok(original.reads > 0, `${c.name}: reproduces old unnecessary read`);
    if (c.expected > 0) {
      assert.equal(optimized.reads, original.reads, `${c.name}: same full before/after proof`);
      assert.equal(optimized.result.historyVerified, true);
      assert.ok(optimized.reads > 0);
    }
  }

  // Deliberately corrupt only synthetic fixtures during DELETE to exercise the
  // real mismatch exceptions. The statement must restore all rows and the cursor.
  await db.exec(`CREATE FUNCTION fixture.corrupt_delete() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF current_setting('fixture.corrupt')='count' THEN RETURN NULL; END IF;
      UPDATE internal_proesc.financial_snapshots SET principal_cents=1 WHERE id='${uid(100)}';
      RETURN OLD;
    END;
    $$;
    CREATE TRIGGER fixture_corrupt BEFORE DELETE ON internal_proesc.financial_snapshots
      FOR EACH ROW EXECUTE FUNCTION fixture.corrupt_delete();`);
  for (const mode of ['count', 'history']) {
    await reset(); await seed({ count: 5 });
    await db.exec(`SET fixture.corrupt='${mode}'`);
    const unchanged = await storedState();
    await assert.rejects(() => db.query('SELECT internal_proesc.compact_snapshot_observations(25)'),
      mode === 'count' ? /consolidation count mismatch/ : /identity, time or evidence changed/);
    assert.deepEqual(await storedState(), unchanged, `${mode}: failure rolls back all compaction writes`);
  }
  console.log(`${cases.length} before/after cases + 2 rollback guards passed; idle reads=0; active evidence/ACL/OID unchanged.`);
  console.log(JSON.stringify({ definitionBefore: '78ce8e039c288d7f849112d63171d002',
    definitionAfter: (await queryOne('SELECT md5(pg_get_functiondef($1::regprocedure)) AS hash', [signature])).hash }));
} finally { await db.close(); }
