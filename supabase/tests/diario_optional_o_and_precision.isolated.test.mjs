import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// The canonical SQL runs in isolated PostgreSQL, with no remote connection.
const packageUrl = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(packageUrl);
const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');
const baseline = await read('../migrations/20260724024758_require_complete_active_grades_for_canonical_result.sql');
const periodBaseline = await read('../migrations/20260924201000_recognize_transfer_credits_in_period_closing.sql');
const viewBaseline = await read('../migrations/20260913043309_diario_historical_snapshot_results.sql');
const migration = await read('../migrations/20261010223000_diario_optional_o_and_precision.sql');
const scenarios = await read('./diario_optional_o_and_precision.rollback.sql');

function functionSql(source, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+${escapedName}\\s*\\(`, 'i').exec(source);
  assert.ok(declaration, `Missing canonical function: ${name}`);
  const start = declaration.index;
  const marker = source.slice(start).match(/\bas\s+(\$[a-z_]*\$)/i);
  assert.ok(marker, `Missing function delimiter: ${name}`);
  const bodyStart = start + marker.index + marker[0].length;
  const end = source.indexOf(marker[1], bodyStart);
  assert.ok(end >= bodyStart, `Missing function end: ${name}`);
  return source.slice(start, end + marker[1].length + 1);
}

const schema = `
create role anon;
create role authenticated;
create role service_role;
create schema internal_academic;
create schema auth;
create function auth.role() returns text language sql stable as $$
  select current_setting('request.jwt.claim.role', true);
$$;
-- Authorization dependencies are isolated; their production definitions and
-- public RPC wrappers are unchanged by the migration under test.
create function public.can_write_turma(uuid) returns boolean language sql stable as $$ select false; $$;
create table public.turmas(id uuid primary key, frequencia_minima_percent numeric, media_minima numeric);
create table public.periodos_letivos(id uuid primary key, turma_id uuid references public.turmas);
create table public.disciplinas(id uuid primary key, carga_horaria_estagio numeric);
create table public.turmas_disciplinas(turma_id uuid references public.turmas,
  disciplina_id uuid references public.disciplinas, periodo_letivo_id uuid references public.periodos_letivos,
  concluida boolean, instrumentos_avaliativos jsonb, primary key(turma_id, disciplina_id));
create table public.matriculas(id uuid primary key, turma_id uuid references public.turmas, aluno_id uuid, status text);
create table public.aulas_turma(id uuid primary key, turma_id uuid references public.turmas,
  disciplina_id uuid references public.disciplinas, data_aula date, carga_horaria numeric);
create table public.diario_notas(turma_id uuid references public.turmas,
  disciplina_id uuid references public.disciplinas, aluno_id uuid,
  nota_p numeric(4,2), nota_ti numeric(4,2), nota_tg numeric(4,2), nota_s numeric(4,2),
  nota_cq numeric(4,2), nota_o numeric(4,2), nota_rec numeric(4,2),
  primary key(turma_id, disciplina_id, aluno_id));
create table public.diario_frequencia(turma_id uuid references public.turmas,
  disciplina_id uuid references public.disciplinas, aluno_id uuid, aula_id uuid references public.aulas_turma, status char(1));
create table public.matricula_aproveitamentos(matricula_id uuid references public.matriculas,
  disciplina_id uuid references public.disciplinas);
create table public.matriculas_estagios(turma_id uuid references public.turmas,
  disciplina_id uuid references public.disciplinas, aluno_id uuid, nota_final numeric, frequencia_estagio numeric);
create table internal_academic.test_history_rows(turma_id uuid, disciplina_id uuid, aluno_id uuid,
  nota_p numeric, nota_ti numeric, nota_tg numeric, nota_s numeric, nota_cq numeric,
  nota_o numeric, nota_rec numeric, total_aulas bigint, total_faltas bigint,
  frequencia_percent numeric, media_parcial numeric, media_final numeric, resultado_final text);
create function internal_academic.get_diario_historical_snapshot_rows()
  returns setof internal_academic.test_history_rows language sql stable as $$
  select * from internal_academic.test_history_rows;
$$;
`;

async function createDatabase() {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(baseline);
    await db.exec(viewBaseline);
    // Only the result-reading dependency is reduced. The real period-closing
    // body consumes the actual canonical view, including pending recovery.
    await db.exec(`create function public.get_diario_resultados(uuid, uuid)
      returns table(aluno_id uuid, disciplina_id uuid, resultado_final text) language sql stable as $$
      select r.aluno_id, r.disciplina_id, r.resultado_final from public.v_diario_notas_resultados r
        where r.turma_id = $1 and r.disciplina_id = $2;
    $$;`);
    await db.exec(periodBaseline);
    // Production metadata confirms these internal functions are owner-only.
    await db.exec(`revoke all on function internal_academic.p1_get_pendencias_fechamento_periodo_20260719(uuid)
      from public, anon, authenticated, service_role;`);
    return db;
  } catch (error) { await db.close(); throw error; }
}

test('reproduz O vazio anulando média e soma4.75 arredondada4.8 no contrato anterior', async () => {
  const db = await createDatabase();
  try {
    const { rows } = await db.query(`select internal_academic.calculate_diario_partial(
      '{"p":true,"ti":true,"tg":false,"s":false,"cq":false,"o":true}',5,4.5,null,null,null,null) as missing_o,
      internal_academic.calculate_diario_partial(
      '{"p":true,"ti":true,"tg":false,"s":false,"cq":true,"o":false}',1.25,3,null,null,0.5,null) as precision`);
    assert.deepEqual(rows, [{ missing_o: null, precision: '4.8' }]);
  } finally { await db.close(); }
});

test('corrigir somente o helper ainda deixaria O obrigatório no fechamento do período', async () => {
  const db = await createDatabase();
  try {
    await db.exec(functionSql(migration, 'internal_academic.calculate_diario_partial'));
    await assert.rejects(db.exec(scenarios), (error) => (
      error.code === 'P0004' && error.message === 'Period closure must agree with the optional-O canonical result'
    ));
    await db.exec('rollback');
  } finally { await db.close(); }
});

test('helper, fechamento e view passam todos cenários sem mudar ACL ou dados históricos', async () => {
  const db = await createDatabase();
  try {
    const metadata = `select proname, proowner, proacl::text, provolatile, prosecdef, proconfig
      from pg_proc where oid in (
        'internal_academic.calculate_diario_partial(jsonb,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure,
        'internal_academic.p1_get_pendencias_fechamento_periodo_20260719(uuid)'::regprocedure)
      order by proname`;
    const before = await db.query(metadata);
    await db.exec(migration);
    assert.deepEqual((await db.query(metadata)).rows, before.rows, 'Existing function privileges must remain unchanged');
    const { rows: permissions } = await db.query(`select has_function_privilege(
      role, 'internal_academic.calculate_diario_partial(jsonb,numeric,numeric,numeric,numeric,numeric,numeric)', 'EXECUTE') as calculation,
      has_function_privilege(role, 'internal_academic.p1_get_pendencias_fechamento_periodo_20260719(uuid)', 'EXECUTE') as closing
      from (values ('anon'), ('authenticated'), ('service_role')) roles(role)`);
    assert.ok(permissions.every(({ calculation, closing }) => !calculation && !closing));
    await db.exec(scenarios);
    assert.equal((await db.query('select count(*)::integer as count from public.diario_notas')).rows[0].count, 0);
    assert.deepEqual((await db.query("select reloptions from pg_class where oid='public.v_diario_notas_resultados'::regclass")).rows,
      [{ reloptions: ['security_invoker=true'] }]);
    await db.exec(`insert into internal_academic.test_history_rows(turma_id,disciplina_id,aluno_id,
      media_parcial,media_final,resultado_final) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),4.75,9.05,'APROVADO');`);
    assert.deepEqual((await db.query('select media_parcial,media_final,resultado_final from public.v_diario_notas_resultados')).rows,
      [{ media_parcial: '4.75', media_final: '9.05', resultado_final: 'APROVADO' }]);
  } finally { await db.close(); }
});

test('manter ROUND1 na recuperação da view produziria divergência9.05→9.1', async () => {
  const db = await createDatabase();
  try {
    await db.exec(migration.replace('round(b.nota_rec::numeric, 2)', 'round(b.nota_rec::numeric, 1)'));
    await assert.rejects(db.exec(scenarios), (error) => (
      error.code === 'P0004' && error.message === 'The legacy view must preserve recovery precision as well'
    ));
    await db.exec('rollback');
  } finally { await db.close(); }
});
