import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const moduleName = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href
  : '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const original = await read('../migrations/20260827012000_create_secretaria_banese_document_groups_secure.sql');
const patch = await read('../migrations/20261024001907_secure_secretaria_banese_document_scope.sql');
const calculatorPatch = await read('../migrations/20261024001916_pin_financial_schedule_search_path.sql');
const scheduleSource = await read('../migrations/20260827160500_project_complete_two_cycles_in_financial_schedule.sql');
const scheduleStart = scheduleSource.indexOf('create or replace function public.build_gestao_financial_schedule(');
const scheduleEnd = scheduleSource.indexOf('$function$;', scheduleStart) + '$function$;'.length;
const originalCalculator = scheduleSource.slice(scheduleStart, scheduleEnd);
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const signature = 'public.get_secretaria_banese_document_groups_secure(uuid,text,uuid,uuid,integer,integer)';
const uid = id(900);
const poloA = id(1);
const poloB = id(2);

const actor = async (db, overrides = {}) => {
  const input = {
    role: 'authenticated', uid, email: 'synthetic@example.invalid',
    gestor: 'true', global: 'false', polos: `{${poloA}}`, tab: 'true', ...overrides,
  };
  for (const [key, value] of Object.entries(input)) {
    const setting = ['role', 'uid', 'email'].includes(key) ? `test.jwt.${key}` : `test.${key}`;
    await db.query('SELECT set_config($1,$2,true)', [setting, value]);
  }
  await db.exec(`SET LOCAL ROLE ${input.role === '' ? 'authenticated' : input.role}`);
};
const call = async (db, polo = null, search = null) => (
  await db.query(`SELECT public.get_secretaria_banese_document_groups_secure(
    p_polo_id => $1::uuid, p_search => $2::text) AS data`, [polo, search])
).rows[0].data;
const denied = async (db, action, pattern = /permission denied|nao autorizado/) => {
  await db.exec('SAVEPOINT denied_call');
  await assert.rejects(action, pattern);
  await db.exec('ROLLBACK TO SAVEPOINT denied_call; RELEASE SAVEPOINT denied_call');
};
const seed = async (db) => {
  // A, B, fallback-to-class B, conflicting receivable B/class A, and excluded paid A.
  for (const [n, receivablePolo, classPolo, status] of [
    [1, poloA, poloA, 'PENDENTE'], [2, poloB, poloB, 'VENCIDO'],
    [3, null, poloB, 'PENDENTE'], [4, poloB, poloA, 'PENDENTE'],
    [5, poloA, poloA, 'PAGO'],
  ]) {
    await db.query('INSERT INTO parceiros VALUES ($1,$2,$3)', [id(100 + n), `Sintético ${n}`, '']);
    await db.query('INSERT INTO cursos VALUES ($1,$2)', [id(200 + n), `Curso sintético ${n}`]);
    await db.query('INSERT INTO turmas VALUES ($1,$2,$3,$4,$5)',
      [id(300 + n), `Turma sintética ${n}`, `TEST-${n}`, id(200 + n), classPolo]);
    await db.query('INSERT INTO matriculas VALUES ($1,$2)', [id(400 + n), '2026-01-01']);
    await db.query(`INSERT INTO contas_receber VALUES
      ($1,$2,$3,$4,$5,100,'2026-10-01',1,'banese_card','PARCELA',$6)`,
    [id(500 + n), id(100 + n), id(400 + n), id(300 + n), receivablePolo, status]);
  }
};
const database = async () => {
  const db = new PGlite();
  await db.exec('BEGIN');
  await db.exec(await read('./fixtures/secretaria-banese-document-scope.sql'));
  await seed(db);
  await db.exec(original);
  return db;
};
const close = async (db) => { await db.exec('ROLLBACK'); await db.close(); };

test('reproduces original nullable anonymous bypass, then revokes PUBLIC/anon and pins search_path', async () => {
  const db = await database();
  try {
    await actor(db, { role: 'anon', uid: '', gestor: '', global: '', polos: '', tab: '', email: '' });
    assert.equal((await call(db)).total, 4, 'original privileged RPC exposes all synthetic polos');
    await db.exec('RESET ROLE');
    await db.exec(patch);
    await actor(db, { role: 'anon', uid: '', gestor: '', global: '', polos: '', tab: '' });
    await denied(db, () => call(db), /permission denied/);
    await db.exec('RESET ROLE');
    const row = (await db.query(`SELECT proconfig,
      has_function_privilege('anon',oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role',oid,'EXECUTE') AS service_execute
      FROM pg_proc WHERE oid=$1::regprocedure`, [signature])).rows[0];
    assert.deepEqual(row.proconfig, ['search_path=""']);
    assert.equal(row.anon_execute, false);
    assert.equal(row.authenticated_execute, true);
    assert.equal(row.service_execute, true);
  } finally { await close(db); }
});

test('missing identity, aluno, nullable permission and absent scope all fail closed', async () => {
  const db = await database();
  try {
    await db.exec(patch);
    for (const input of [
      { uid: '' }, { gestor: 'false', global: '', polos: '', tab: '' },
      { gestor: '', global: '', polos: '', tab: '' },
      { tab: '' }, { tab: 'false' }, { polos: '' }, { polos: '{}' },
    ]) {
      await actor(db, input);
      await denied(db, () => call(db));
    }
    await actor(db);
    await denied(db, () => call(db, poloB));
    for (const polos of ['{NULL}', `{${poloA},NULL}`]) {
      await actor(db, { polos });
      await denied(db, () => call(db, poloB));
    }
  } finally { await close(db); }
});

test('restricted/null-polo queries scope rows, facets and totals; no conflicting-polo fallback', async () => {
  const db = await database();
  try {
    await db.exec(patch);
    const before = (await db.query('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) AS rows FROM contas_receber r')).rows;
    await actor(db);
    const implicit = await call(db);
    assert.equal(implicit.total, 1);
    assert.deepEqual(implicit.groups.map((g) => g.enrollmentId), [id(401)]);
    assert.deepEqual(implicit.filters.courses.map((c) => c.id), [id(201)]);
    assert.deepEqual(implicit.filters.classes.map((c) => c.id), [id(301)]);
    assert.deepEqual(await call(db, poloA), implicit);
    assert.equal((await call(db, null, 'Sintético 2')).total, 0);
    await actor(db, { polos: `{${poloB}}` });
    const other = await call(db);
    assert.equal(other.total, 3);
    assert.deepEqual(other.groups.map((g) => g.enrollmentId), [id(402), id(403), id(404)]);
    await actor(db, { polos: `{${poloA},${poloB}}` });
    assert.equal((await call(db)).total, 4);
    assert.equal((await call(db, poloA)).total, 1);
    await db.exec('RESET ROLE');
    assert.deepEqual((await db.query('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) AS rows FROM contas_receber r')).rows, before);
  } finally { await close(db); }
});

test('global manager and service_role preserve broad access and optional polo filtering', async () => {
  const db = await database();
  try {
    await db.exec(patch);
    await actor(db, { global: 'true', polos: '{}', tab: 'false' });
    assert.equal((await call(db)).total, 4);
    assert.equal((await call(db, poloB)).total, 3);
    await actor(db, { role: 'service_role', uid: '', gestor: '', global: '', polos: '', tab: '' });
    assert.equal((await call(db)).total, 4);
    assert.equal((await call(db, poloA)).total, 1);
  } finally { await close(db); }
});

test('financial calculator search_path change preserves results and rejects invalid parameters', async () => {
  const db = new PGlite();
  try {
    await db.exec('BEGIN');
    await db.exec(originalCalculator);
    const query = `SELECT public.build_gestao_financial_schedule('2026-01-31',50,200,75,6,31) AS schedule`;
    const before = (await db.query(query)).rows;
    await db.exec(calculatorPatch);
    assert.deepEqual((await db.query(query)).rows, before);
    assert.equal(before[0].schedule.length, 14);
    assert.equal(before[0].schedule[1].dataVencimento, '2026-02-28');
    const row = (await db.query(`SELECT proconfig FROM pg_proc WHERE oid=
      'public.build_gestao_financial_schedule(date,numeric,numeric,numeric,integer,integer)'::regprocedure`)).rows[0];
    assert.deepEqual(row.proconfig, ['search_path=""']);
    await denied(db, () => db.query(`SELECT public.build_gestao_financial_schedule(
      '2026-01-01',0,100,0,0,10)`), /Parâmetros inválidos/);
  } finally { await close(db); }
});
