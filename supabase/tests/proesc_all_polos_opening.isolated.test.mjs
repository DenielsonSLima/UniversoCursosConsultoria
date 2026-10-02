import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const matriz = '44444444-4444-4444-4444-444444444444';
const porto = '31497afd-e2dd-4444-aa3d-8087c0ae0753';
const aquidaba = '335fdbe4-b3b4-4622-aa7d-04c585455091';
const propria = 'ff20c5e3-c816-4ee6-b9e9-e731135c9a07';
const outsider = '66666666-6666-6666-6666-666666666666';
const account = '11111111-1111-1111-1111-111111111111';
const banese = '22222222-2222-2222-2222-222222222222';
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const included = (scope, date, cut = '2026-10-01', bank = account) => scalar(
  'select internal_contas.proesc_operational_movement_included($1,$2,$3,$4) value', [bank, scope, date, cut]);
const balance = (scope, cut) => scalar(`select coalesce(sum(amount),0)::text value from fixture_movements
  where polo_id=$1 and movement_date<=$2 and internal_contas.proesc_operational_movement_included(
    account_id,polo_id,movement_date,$2)`, [scope, cut]);
const openings = () => scalar(`select jsonb_agg(to_jsonb(o) order by polo_id) value
  from internal_contas.proesc_operational_openings o`);
const migration = source('20261002010900_proesc_all_polos_opening.sql');
const rejectMigration = async (pattern) => {
  await assert.rejects(db.exec(migration), pattern);
  await db.exec('ROLLBACK');
};

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA internal_contas;
    CREATE TABLE public.polos(id uuid PRIMARY KEY,status text);
    CREATE TABLE public.contas_bancarias(id uuid PRIMARY KEY,polo_id uuid,natureza text,
      codigo_interno text,system_managed boolean,saldo_inicial numeric,data_saldo date);
    CREATE TABLE public.contas_bancarias_polos(conta_bancaria_id uuid,polo_id uuid);
    CREATE TABLE fixture_movements(account_id uuid,polo_id uuid,movement_date date,amount numeric);
    INSERT INTO public.polos VALUES('${matriz}','ativo'),('${porto}','ativo'),('${aquidaba}','ativo'),
      ('${propria}','ativo'),('${outsider}','ativo');
    INSERT INTO public.contas_bancarias VALUES
      ('${account}','${matriz}','BANCARIA','INTEGRATION:PROESC:${matriz}',true,0,null),
      ('${banese}','${matriz}','BANCARIA','SETTLEMENT:BANESE',true,0,'2026-05-11');
    INSERT INTO public.contas_bancarias_polos SELECT '${account}',id FROM public.polos;
    INSERT INTO fixture_movements VALUES
      ('${account}','${matriz}','2026-09-30',3139.90),('${account}','${matriz}','2026-10-01',1300),
      ('${account}','${porto}','2026-09-30',1910),('${account}','${porto}','2026-10-01',260),
      ('${account}','${aquidaba}','2026-09-30',3133.80),('${account}','${outsider}','2026-09-30',55);
  `);
  // Load the immutable production metadata/helper from 0107. Its reader patches
  // are already covered by proesc_opening_cutover.isolated.test.mjs; this test
  // isolates the only new behavior: three scoped metadata insertions.
  const initial = source('20261002010700_proesc_opening_cutover.sql');
  const marker = '-- Patch only the five movement branches';
  assert.ok(initial.includes(marker));
  await db.exec(initial.slice(0, initial.indexOf(marker)) + '\nCOMMIT;');
  const unchanged = await scalar(`select jsonb_build_object(
    'movements',(select jsonb_agg(to_jsonb(m)) from fixture_movements m),
    'accounts',(select jsonb_agg(to_jsonb(a) order by id) from public.contas_bancarias a)) value`);
  const originalOpening = await openings();
  assert.equal(Number(await balance(porto, '2026-10-01')), 2170);
  assert.equal(Number(await balance(aquidaba, '2026-10-01')), 3133.80);
  await db.exec(migration);
  const after = await openings();
  assert.equal(after.length, 4);
  assert.deepEqual(after.find((o) => o.polo_id === matriz), originalOpening[0]);
  await db.exec(migration);
  assert.deepEqual(await openings(), after, 'Consistent replay changes no metadata or timestamps');
  assert.equal(Number(await balance(matriz, '2026-10-01')), 1300);
  assert.equal(Number(await balance(porto, '2026-10-01')), 260);
  assert.equal(Number(await balance(aquidaba, '2026-10-01')), 0);
  assert.equal(Number(await balance(propria, '2026-10-01')), 0);
  assert.equal(Number(await balance(outsider, '2026-10-01')), 55, 'Unapproved polo remains unchanged');
  assert.equal(Number(await balance(porto, '2026-09-30')), 1910);
  assert.equal(Number(await balance(aquidaba, '2026-09-30')), 3133.80);
  for (const scope of [matriz, porto, aquidaba, propria]) {
    assert.equal(await included(scope, '2026-09-30'), false);
    assert.equal(await included(scope, '2026-10-01'), true);
    assert.equal(await included(scope, '2026-09-30', '2026-09-30'), true);
    assert.equal(await included(scope, null), false);
    assert.equal(await included(scope, '2026-09-30', '2026-10-01', banese), true);
  }
  assert.deepEqual(await scalar(`select jsonb_build_object(
    'movements',(select jsonb_agg(to_jsonb(m)) from fixture_movements m),
    'accounts',(select jsonb_agg(to_jsonb(a) order by id) from public.contas_bancarias a)) value`), unchanged);
  await db.exec(`INSERT INTO fixture_movements VALUES
    ('${account}','${porto}','2026-09-20',260),('${account}','${aquidaba}','2026-09-20',279.90),
    ('${account}','${propria}','2026-09-20',100)`);
  assert.equal(Number(await balance(porto, '2026-10-01')), 260, 'Backfill cannot recreate opening cash');
  assert.equal(Number(await balance(aquidaba, '2026-10-01')), 0);
  assert.equal(Number(await balance(propria, '2026-10-01')), 0);
  assert.equal(Number(await balance(porto, '2026-09-30')), 2170, 'Historical facts stay queryable');
  await db.exec(`INSERT INTO fixture_movements VALUES('${account}','${porto}','2026-10-02',260)`);
  assert.equal(Number(await balance(porto, '2026-10-02')), 520, 'New receipt counts normally');
  await db.exec(`UPDATE internal_contas.proesc_operational_openings SET opening_date='2026-11-01' WHERE polo_id='${porto}'`);
  await rejectMigration(/Conflicting Proesc operational opening/);
  assert.equal(await included(porto, '2026-09-30', '2026-10-01'), true, 'Conflict is not silently overwritten');
  await db.exec(`UPDATE internal_contas.proesc_operational_openings SET opening_date='2026-10-01' WHERE polo_id='${porto}';
    UPDATE public.polos SET status='inativo' WHERE id='${propria}'`);
  await rejectMigration(/Every authorized polo/);
  await db.exec(`UPDATE public.polos SET status='ativo' WHERE id='${propria}';
    UPDATE public.contas_bancarias SET data_saldo='2026-10-01' WHERE id='${account}'`);
  await rejectMigration(/Expected exactly one confirmed Proesc control account/);
  await db.exec(`UPDATE public.contas_bancarias SET data_saldo=null WHERE id='${account}';
    DELETE FROM internal_contas.proesc_operational_openings WHERE polo_id<>'${matriz}';
    DELETE FROM public.contas_bancarias_polos WHERE polo_id='${propria}'`);
  await rejectMigration(/Every authorized polo/);
  assert.equal((await openings()).length, 1, 'Failed scope validation inserts no partial opening');
  await db.exec(`INSERT INTO public.contas_bancarias_polos VALUES('${account}','${propria}')`);
  await db.exec(migration);
  assert.equal((await openings()).length, 4);
  console.log('PASS all Proesc polos: exact scope, replay, conflict rejection, historical boundary, backfill isolation, Banese unchanged');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
