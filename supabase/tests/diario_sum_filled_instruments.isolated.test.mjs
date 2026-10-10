import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Reuse the isolated 4.8.204 table shape; applied sources and tests stay immutable.
const packageUrl = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(packageUrl);
const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');
const baseline = await read('../migrations/20261010223000_diario_optional_o_and_precision.sql');
const migration = await read('../migrations/20261010224500_diario_sum_filled_instruments.sql');
const scenarios = await read('./diario_sum_filled_instruments.rollback.sql');

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
    // This dependency is reduced to the canonical view. PL/pgSQL lets the
    // unchanged 204 closing function be installed before that view is created.
    await db.exec(`create function public.get_diario_resultados(uuid, uuid)
      returns table(aluno_id uuid, disciplina_id uuid, resultado_final text)
      language plpgsql stable as $$ begin
        return query select r.aluno_id,r.disciplina_id,r.resultado_final
          from public.v_diario_notas_resultados r where r.turma_id=$1 and r.disciplina_id=$2;
      end; $$;`);
    await db.exec(baseline);
    // Match the owner-only production ACL confirmed for both private helpers.
    await db.exec(`revoke all on function
      internal_academic.calculate_diario_partial(jsonb,numeric,numeric,numeric,numeric,numeric,numeric),
      internal_academic.p1_get_pendencias_fechamento_periodo_20260719(uuid)
      from public,anon,authenticated,service_role;`);
    return db;
  } catch (error) { await db.close(); throw error; }
}

test('baseline204 ainda rejeita nota individual com outros instrumentos ativos vazios', async () => {
  const db = await createDatabase();
  try {
    await assert.rejects(db.exec(scenarios), (error) => (
      error.code === 'P0004' && error.message === 'Each filled active instrument must independently produce a partial'
    ));
    await db.exec('rollback');
  } finally { await db.close(); }
});

test('nova soma passa os seis instrumentos, fechamento e precisão sem alterar ACL ou callers204', async () => {
  const db = await createDatabase();
  try {
    const metadata = `select proowner,proacl::text,provolatile,prosecdef,proconfig from pg_proc where oid=
      'internal_academic.calculate_diario_partial(jsonb,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure`;
    const callers = `select pg_get_functiondef('internal_academic.p1_get_pendencias_fechamento_periodo_20260719(uuid)'::regprocedure) as closing,
      pg_get_viewdef('public.v_diario_notas_resultados'::regclass,true) as results`;
    const before = await db.query(metadata);
    const beforeCallers = await db.query(callers);
    await db.exec(migration);
    assert.deepEqual((await db.query(metadata)).rows,before.rows);
    assert.deepEqual((await db.query(callers)).rows,beforeCallers.rows);
    await db.exec(scenarios);
    assert.equal((await db.query('select count(*)::integer as count from public.diario_notas')).rows[0].count,0);
    await db.exec(`insert into internal_academic.test_history_rows(turma_id,disciplina_id,aluno_id,
      media_parcial,media_final,resultado_final) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),4.75,9.05,'APROVADO');`);
    assert.deepEqual((await db.query('select media_parcial,media_final,resultado_final from public.v_diario_notas_resultados')).rows,
      [{ media_parcial: '4.75',media_final: '9.05',resultado_final: 'APROVADO' }]);
  } finally { await db.close(); }
});

test('a guarda todos-vazios impede LEAST de produzir nota10 quando SUM retornaNULL', async () => {
  const db = await createDatabase();
  try {
    await db.exec(migration.replace('when not exists (','when false and not exists ('));
    await assert.rejects(db.exec(scenarios), (error) => (
      error.code === 'P0004' && error.message === 'All empty active instruments must keep the partial NULL'
    ));
    await db.exec('rollback');
  } finally { await db.close(); }
});
