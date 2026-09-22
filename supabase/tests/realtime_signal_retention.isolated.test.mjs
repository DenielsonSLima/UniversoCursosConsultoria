import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Existing optional local dependency; no network, persisted database or production fixtures.
const modulePath = process.env.PGLITE_MODULE_PATH;
const packageUrl = modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite';
const { PGlite } = await import(packageUrl);
const db = new PGlite();
const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const migrationFiles = await readdir(resolve(root, 'supabase/migrations'));
async function migration(suffix) {
  const matches = migrationFiles.filter((file) => file.endsWith(suffix));
  assert.equal(matches.length, 1, `Unique migration suffix: ${suffix}`);
  return read(`supabase/migrations/${matches[0]}`);
}
const install = await migration('_install_realtime_signal_retention.sql');
const activate = await read('supabase/operations/activate_realtime_signal_retention.sql');
const signature = 'internal_realtime.prune_expired_signals(integer)';
const tables = ['finance_realtime_events', 'gestao_realtime_events', 'portal_realtime_signals'];
function definition(source, name) {
  const start = source.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'));
  assert.ok(start >= 0, `Source exists: ${name}`);
  const tail = source.slice(start);
  const body = /\bAS\s+(\$[a-z_]*\$)/i.exec(tail);
  assert.ok(body);
  const end = tail.indexOf(`${body[1]};`, body.index + body[0].length);
  assert.ok(end >= 0);
  return tail.slice(0, end + body[1].length + 1);
}
async function query(sql, params) { return (await db.query(sql, params)).rows; }
async function hash() {
  return (await query("SELECT encode(sha256(convert_to(pg_get_functiondef($1::regprocedure),'UTF8')),'hex') AS hash",
    [signature]))[0].hash;
}
async function prune(limit = 5000) {
  return (await query('SELECT * FROM internal_realtime.prune_expired_signals($1)', [limit]))[0];
}
async function rejectsDrift(sql, migrationSql, pattern) {
  await db.exec('BEGIN');
  try {
    await db.exec(sql);
    await assert.rejects(() => db.exec(migrationSql), pattern);
  } finally { await db.exec('ROLLBACK'); }
}

try {
  await db.exec(await read('supabase/tests/realtime_signal_retention.fixture.sql'));
  for (const [path, names] of [
    ['20260727223219_finalize_shared_account_realtime_and_history.sql',
      ['emit_finance_realtime_event', 'emit_caixa_realtime_event']],
    ['20260727004920_harden_relatorios_access_realtime.sql', ['emit_turma_gestao_realtime_event']],
    ['20260824235100_create_portal_realtime_signals.sql', ['insert_portal_realtime_signal']],
  ]) {
    const source = await read(`supabase/migrations/${path}`);
    for (const name of names) {
      let functionSql = definition(source, `public.${name}`);
      // The deployed Gestão body has these same INSERTs formatted on one line.
      // Preserve its exact pg_get_functiondef hash without rewriting applied history.
      if (name === 'emit_turma_gestao_realtime_event') {
        functionSql = functionSql.replace(/insert into public.gestao_realtime_events \(\n\s+source_table, event_type, entity_id, turma_id, polo_id\n\s+\)/g,
          'insert into public.gestao_realtime_events (source_table, event_type, entity_id, turma_id, polo_id)');
        functionSql = functionSql.replace(/values \(\n\s+tg_table_name, tg_op, old.id, old.id, old.polo_id\n\s+\)/,
          'values (tg_table_name, tg_op, old.id, old.id, old.polo_id)');
      }
      await db.exec(functionSql);
    }
  }
  // The preflight validates the exact real producer definitions, not synthetic TTL mocks.
  await db.exec(install);
  const functionHash = await hash();
  assert.ok(activate.includes(functionHash), `Activation must pin function hash ${functionHash}`);
  assert.deepEqual(await query('SELECT active FROM cron.job'), [{ active: false }]);
  await db.exec(install);
  assert.deepEqual(await query('SELECT count(*)::integer AS jobs FROM cron.job'), [{ jobs: 1 }]);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const [privileges] = await query(`SELECT
      has_schema_privilege($1,'internal_realtime','USAGE') AS schema_access,
      has_function_privilege($1,$2,'EXECUTE') AS executable`, [role, signature]);
    assert.deepEqual(privileges, { schema_access: false, executable: false });
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(() => prune(), (error) => error.code === '42501');
    await db.exec('RESET ROLE');
  }
  // Even accidental future grants cannot bypass the explicit invoker identity check.
  await db.exec('BEGIN');
  await db.exec(`GRANT USAGE ON SCHEMA internal_realtime TO authenticated;
    GRANT EXECUTE ON FUNCTION ${signature} TO authenticated; SET ROLE authenticated`);
  await assert.rejects(() => prune(), (error) => error.code === '42501');
  await db.exec('ROLLBACK');

  for (const limit of [null, 0, -1, 5001]) {
    await assert.rejects(() => prune(limit), (error) => error.code === '22023');
  }
  // A transaction freezes now(): exactly 24h must survive, as must recent/future signals.
  await db.exec('BEGIN');
  for (const table of tables) {
    await db.exec(`INSERT INTO public.${table}(created_at) VALUES
      (now()-interval '24 hours 1 microsecond'), (now()-interval '24 hours'),
      (now()-interval '23 hours'), (now()+interval '1 hour')`);
  }
  assert.deepEqual(await prune(), { finance_deleted: 1, gestao_deleted: 1, portal_deleted: 1 });
  for (const table of tables) {
    assert.deepEqual(await query(`SELECT id::integer FROM public.${table} ORDER BY id`),
      [{ id: 2 }, { id: 3 }, { id: 4 }]);
  }
  assert.deepEqual(await prune(), { finance_deleted: 0, gestao_deleted: 0, portal_deleted: 0 });
  await db.exec('ROLLBACK');

  await db.exec('BEGIN');
  for (const table of tables) {
    await db.exec(`TRUNCATE public.${table} RESTART IDENTITY;
      INSERT INTO public.${table}(created_at) SELECT now()-interval '48 hours'
      FROM generate_series(1,5002)`);
  }
  assert.deepEqual(await prune(), { finance_deleted: 5000, gestao_deleted: 5000, portal_deleted: 5000 });
  for (const table of tables) {
    assert.deepEqual(await query(`SELECT id::integer FROM public.${table} ORDER BY id`),
      [{ id: 5001 }, { id: 5002 }]);
  }
  assert.deepEqual(await prune(1), { finance_deleted: 1, gestao_deleted: 1, portal_deleted: 1 });
  assert.deepEqual(await prune(), { finance_deleted: 1, gestao_deleted: 1, portal_deleted: 1 });
  assert.deepEqual(await prune(), { finance_deleted: 0, gestao_deleted: 0, portal_deleted: 0 });
  await db.exec('ROLLBACK');
  assert.deepEqual(await query('SELECT * FROM public.test_preserved_financial_evidence'),
    [{ id: 1, proof: 'synthetic-preserved-proof' }]);

  await rejectsDrift('ALTER FUNCTION public.emit_finance_realtime_event() SET search_path = public,pg_catalog',
    install, /TTL producer drift/);
  await rejectsDrift('ALTER TABLE public.finance_realtime_events ALTER COLUMN created_at DROP NOT NULL',
    install, /table\/column\/owner drift/);
  await rejectsDrift('CREATE VIEW public.test_signal_view AS SELECT id FROM public.finance_realtime_events',
    install, /dependency drift/);
  await rejectsDrift(`CREATE TABLE public.test_signal_reference(signal_id bigint
    REFERENCES public.finance_realtime_events(id))`, install, /dependency drift/);
  await rejectsDrift(`CREATE TRIGGER test_signal_trigger BEFORE DELETE ON public.finance_realtime_events
    FOR EACH ROW EXECUTE FUNCTION public.emit_finance_realtime_event()`, install, /dependency drift/);
  await rejectsDrift(`ALTER FUNCTION ${signature} SECURITY DEFINER`, activate, /function or permission drift/);
  await rejectsDrift(`GRANT EXECUTE ON FUNCTION ${signature} TO PUBLIC`, activate, /permission drift/);
  for (const change of ["command='SELECT 1'", "schedule='* * * * *'", "username='service_role'", "database='other'"]) {
    await rejectsDrift(`UPDATE cron.job SET ${change}`, activate, /cron owner, database, schedule or command drift/);
  }
  await db.exec(activate);
  await db.exec(activate);
  assert.deepEqual(await query('SELECT active FROM cron.job'), [{ active: true }]);
  await assert.rejects(() => db.exec(install), /expects the reviewed inactive job/);
  // PGlite has one backend. Concurrency syntax is checked, but two-backend locking needs PostgreSQL smoke.
  assert.equal((install.match(/FOR UPDATE SKIP LOCKED/g) ?? []).length, 3);
  assert.ok(install.includes('pg_try_advisory_xact_lock'));
  console.log(JSON.stringify({ passed: true, functionHash, tables: tables.length,
    checked: ['exact TTL boundary', 'batch/order/idempotence', 'private invoker', 'drift guards', 'inactive/activation gates'],
    limitation: 'pg_cron is locally stubbed; row/advisory contention across two backends requires PostgreSQL validation.' }));
} catch (error) {
  console.error(JSON.stringify({ failed: true, message: error.message, code: error.code, where: error.where }));
  process.exitCode = 1;
} finally {
  await db.close();
}
