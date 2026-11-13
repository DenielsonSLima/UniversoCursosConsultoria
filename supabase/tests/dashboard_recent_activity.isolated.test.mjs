import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const { PGlite } = await import(process.env.DASHBOARD_TEST_PGLITE_MODULE
  ? pathToFileURL(resolve(process.env.DASHBOARD_TEST_PGLITE_MODULE)).href
  : '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261113184005_dashboard_activity_civil_dates.sql', import.meta.url), 'utf8');
const legacySource = await readFile(new URL('../migrations/20260727144510_align_legacy_secretaria_dashboard_access.sql', import.meta.url), 'utf8');
const legacy = legacySource.slice(
  legacySource.indexOf('CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity('),
  legacySource.indexOf('COMMENT ON FUNCTION public.gestor_has_dashboard_secretaria_alunos'),
);
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('RPC v2 preserva precisão civil, instantes, ordenação, escopo e registros', async t => {
  const db = new PGlite();
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const activities = async (polo = id(1), limit = 20, name = 'get_dashboard_recent_activity_v2') =>
    rows(`select * from public.${name}($1::uuid, $2::integer)`, [polo, limit]);
  const flag = async (name, value) => rows('select set_config($1, $2, false)', [`test.${name}`, value]);
  const snapshot = async () => rows(`select
    (select jsonb_agg(to_jsonb(m) order by id) from public.matriculas m) matriculas,
    (select jsonb_agg(to_jsonb(c) order by id) from public.contas_receber c) contas,
    (select jsonb_agg(to_jsonb(p) order by id) from public.parceiros p) parceiros`);
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create function auth.role() returns text language sql stable as $$
        select coalesce(nullif(current_setting('test.jwt_role', true), ''), 'authenticated') $$;
      create function public.dashboard_test_flag(text) returns boolean language sql stable as $$
        select coalesce(nullif(current_setting('test.' || $1, true), '')::boolean, false) $$;
      create function public.gestor_has_dashboard_widget(text) returns boolean language sql stable as $$
        select public.dashboard_test_flag('widget') $$;
      create function public.gestor_has_all_polos() returns boolean language sql stable as $$
        select public.dashboard_test_flag('all_polos') $$;
      create function public.is_gestor_for_polo(uuid) returns boolean language sql stable as $$
        select $1::text = current_setting('test.polo', true) $$;
      create function public.gestor_has_module(text) returns boolean language sql stable as $$
        select case $1 when 'parceiros' then public.dashboard_test_flag('academic')
          when 'biblioteca' then public.dashboard_test_flag('library') else false end $$;
      create function public.gestor_has_tab(text,text) returns boolean language sql stable as $$select false$$;
      create function public.gestor_has_dashboard_secretaria_alunos() returns boolean language sql stable as $$
        select public.dashboard_test_flag('secretaria') $$;
      create function public.gestor_has_effective_financeiro_tab(text) returns boolean language sql stable as $$
        select public.dashboard_test_flag('financial') $$;
      create table public.parceiros(id uuid primary key, nome text, polo_id uuid, polo_ids uuid[]);
      create table public.cursos(id uuid primary key, nome text);
      create table public.turmas(id uuid primary key, curso_id uuid, nome text);
      create table public.matriculas(id uuid primary key, aluno_id uuid, turma_id uuid, data_matricula timestamptz);
      create table public.contas_receber(id uuid primary key, cliente_id uuid, polo_id uuid, descricao text,
        status text, data_pagamento date, created_at timestamptz);
      create table public.biblioteca_documentos(id uuid primary key, author_name text, titulo text,
        created_at timestamptz, polo_id uuid);
      insert into public.parceiros values
        ('${id(11)}','Aluno sintético A','${id(1)}',array['${id(1)}'::uuid]),
        ('${id(12)}','Aluno sintético B','${id(2)}',array['${id(2)}'::uuid]);
      insert into public.cursos values ('${id(21)}','Curso sintético');
      insert into public.turmas values ('${id(31)}','${id(21)}','Turma sintética');
      insert into public.matriculas values
        ('${id(41)}','${id(11)}','${id(31)}','2026-11-13T13:00:00Z'),
        ('${id(42)}','${id(12)}','${id(31)}','2026-11-13T14:00:00Z');
      insert into public.contas_receber values
        ('${id(51)}','${id(11)}','${id(1)}','Com data civil','PAGO','2026-11-13','2026-11-01T10:00:00Z'),
        ('${id(52)}','${id(11)}','${id(1)}','Sem data','PAGO',null,'2026-11-13T15:00:00Z'),
        ('${id(53)}','${id(12)}','${id(2)}','Outro polo','PAGO','2026-11-14','2026-11-02T10:00:00Z'),
        ('${id(54)}','${id(11)}','${id(1)}','Não pago','PENDENTE','2026-11-15','2026-11-03T10:00:00Z');
      insert into public.biblioteca_documentos values
        ('${id(61)}','Autor sintético','Local','2026-11-13T12:00:00Z','${id(1)}'),
        ('${id(62)}','Autor sintético','Global','2026-11-12T12:00:00Z',null),
        ('${id(63)}','Autor sintético','Outro polo','2026-11-13T16:00:00Z','${id(2)}');
      set time zone 'UTC';
    `);
    for (const name of ['widget', 'academic', 'financial', 'library']) await flag(name, 'true');
    await flag('polo', id(1));
    await db.exec(legacy);
    const before = await snapshot();
    const legacyDefinition = await rows("select pg_get_functiondef('public.get_dashboard_recent_activity(uuid,integer)'::regprocedure) value");
    await db.exec(migration);
    await db.exec('set role authenticated');

    await t.test('dia financeiro é texto ISO sem hora e data ausente continua nula', async () => {
      const data = await activities();
      assert.equal(data.length, 5);
      const payments = data.filter(row => row.tipo_atividade === 'pagamento');
      assert.deepEqual(payments.map(row => row.data_evento), [null, '2026-11-13']);
      assert.equal(Date.parse(data.find(row => row.tipo_atividade === 'matricula').data_evento),
        Date.parse('2026-11-13T13:00:00Z'));
      assert.equal(Date.parse(data.find(row => row.descricao.endsWith('Local')).data_evento),
        Date.parse('2026-11-13T12:00:00Z'));
    });

    await t.test('ordem e limite coincidem com a RPC legada em diferentes fusos', async () => {
      const withoutTime = data => data.map(({ data_evento, ...rest }) => rest);
      for (const timezone of ['UTC', 'America/Sao_Paulo', 'Pacific/Kiritimati', 'America/New_York']) {
        await rows('select set_config(\'TimeZone\', $1, false)', [timezone]);
        const data = await activities();
        assert.deepEqual(withoutTime(data), withoutTime(await activities(id(1), 20, 'get_dashboard_recent_activity')));
        assert.equal(data.find(row => row.descricao.endsWith('Com data civil')).data_evento, '2026-11-13');
        assert.equal(Date.parse(data.find(row => row.tipo_atividade === 'matricula').data_evento),
          Date.parse('2026-11-13T13:00:00Z'));
        assert.deepEqual(await activities(id(1), 2), data.slice(0, 2));
      }
      await db.exec("set time zone 'UTC'; set datestyle to 'SQL, DMY'");
      assert.equal((await activities()).find(row => row.descricao.endsWith('Com data civil')).data_evento, '2026-11-13');
      await db.exec("set datestyle to 'ISO, MDY'");
    });

    await t.test('bloqueia polo alheio, visão global sem permissão e widget indisponível', async () => {
      await assert.rejects(activities(id(2)), { code: '42501' });
      await assert.rejects(activities(null), { code: '42501' });
      await flag('widget', 'false');
      await assert.rejects(activities(), { code: '42501' });
      await flag('widget', 'true');
      for (const limit of [0, 21]) await assert.rejects(activities(id(1), limit), { code: '22023' });
    });

    await t.test('preserva as permissões acadêmicas, financeiras e da biblioteca', async () => {
      await flag('academic', 'false');
      await flag('library', 'false');
      assert.ok((await activities()).every(row => row.tipo_atividade === 'pagamento'));
      await flag('financial', 'false');
      assert.deepEqual(await activities(), []);
      await flag('secretaria', 'true');
      assert.deepEqual((await activities()).map(row => row.tipo_atividade), ['matricula']);
      await flag('secretaria', 'false');
      await flag('library', 'true');
      assert.deepEqual((await activities()).map(row => row.tipo_atividade), ['documento', 'documento']);
      for (const name of ['academic', 'financial', 'library']) await flag(name, 'true');
      await flag('all_polos', 'true');
      assert.equal((await activities(null)).length, 8);
      await flag('all_polos', 'false');
    });

    await t.test('grants e SECURITY DEFINER preservam o acesso autenticado e negam anon', async () => {
      await db.exec('reset role');
      assert.deepEqual(await rows(`select
        has_function_privilege('anon','public.get_dashboard_recent_activity_v2(uuid,integer)','EXECUTE') anon,
        has_function_privilege('authenticated','public.get_dashboard_recent_activity_v2(uuid,integer)','EXECUTE') authenticated,
        has_function_privilege('service_role','public.get_dashboard_recent_activity_v2(uuid,integer)','EXECUTE') service_role`),
      [{ anon: false, authenticated: true, service_role: true }]);
      await db.exec('set role anon');
      await assert.rejects(activities(), { code: '42501' });
      await db.exec('set role authenticated');
      await assert.rejects(rows('select * from public.contas_receber'), { code: '42501' });
      assert.equal((await activities()).length, 5);
      await db.exec('reset role');
    });

    await t.test('RPC original e todos os registros permanecem intactos', async () => {
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(await rows("select pg_get_functiondef('public.get_dashboard_recent_activity(uuid,integer)'::regprocedure) value"),
        legacyDefinition);
      await flag('jwt_role', 'service_role');
      await flag('widget', 'false');
      assert.equal((await activities(null)).length, 8);
    });
  } finally {
    await db.close();
  }
});
