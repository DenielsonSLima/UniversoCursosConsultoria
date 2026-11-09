import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const packageUrl = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(packageUrl);
const migrationRoot = new URL('../migrations/', import.meta.url);
const read = (name) => readFile(new URL(name, migrationRoot), 'utf8');
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function functionSql(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+${escaped}\\s*\\(`, 'i').exec(source);
  assert.ok(declaration, `Missing function ${name}`);
  const start = declaration.index;
  const delimiter = /\bas\s+(\$[a-z0-9_]*\$)/i.exec(source.slice(start));
  assert.ok(delimiter, `Missing delimiter ${name}`);
  const bodyStart = start + delimiter.index + delimiter[0].length;
  const end = source.indexOf(delimiter[1], bodyStart);
  assert.ok(end >= bodyStart, `Missing end ${name}`);
  return source.slice(start, end + delimiter[1].length + 1);
}

const resultColumns = `turma_id uuid,disciplina_id uuid,aluno_id uuid,
  nota_p numeric,nota_ti numeric,nota_tg numeric,nota_s numeric,nota_cq numeric,nota_o numeric,nota_rec numeric,
  total_aulas bigint,total_faltas bigint,frequencia_percent numeric,media_parcial numeric,media_final numeric,resultado_final text`;

// Synthetic PostgreSQL schema, deliberately disconnected from production.
// Authorization predicates are controlled by claims; roster/temporal functions
// and the actual calculation bodies are loaded from their versioned sources.
const schema = `
set timezone='America/Maceio';
create role anon; create role authenticated; create role service_role;
create schema auth; create schema internal_academic;
create function auth.role() returns text language sql stable as $$
  select current_setting('request.jwt.claim.role',true); $$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
create function public.current_aluno_id() returns uuid language sql stable as $$
  select nullif(current_setting('test.student',true),'')::uuid; $$;
create function public.current_professor_id() returns uuid language sql stable as $$ select null::uuid; $$;
create function public.is_gestor_for_polo(uuid) returns boolean language sql stable as $$
  select current_setting('test.manager',true)='true'; $$;
create function public.gestor_can_read_diario_results(uuid) returns boolean language sql stable as $$
  select coalesce(current_setting('test.manager',true)='true',false); $$;
create function public.is_professor_assigned_disciplina(uuid,uuid) returns boolean language sql stable as $$ select false; $$;
create function public.can_write_turma(uuid) returns boolean language sql stable as $$ select false; $$;
create table public.cursos(id uuid primary key,modalidade text);
create table public.turmas(id uuid primary key,curso_id uuid,polo_id uuid,status text,
  frequencia_minima_percent numeric,media_minima numeric);
create table public.periodos_letivos(id uuid primary key,turma_id uuid);
create table public.disciplinas(id uuid primary key,carga_horaria_estagio numeric);
create table public.turmas_disciplinas(turma_id uuid,disciplina_id uuid,periodo_letivo_id uuid,
  professor_id uuid,concluida boolean,instrumentos_avaliativos jsonb,primary key(turma_id,disciplina_id));
create table public.matriculas(id uuid primary key,turma_id uuid,aluno_id uuid,status text,data_matricula timestamptz);
create table public.matricula_movimentacoes(id uuid primary key default gen_random_uuid(),matricula_id uuid,
  status_anterior text,status_novo text,tipo text,data_movimentacao date,created_at timestamptz default now(),
  metadados jsonb default '{}'::jsonb);
create table public.matricula_liberacoes_diario(matricula_id uuid,revogado_em timestamptz);
create table public.diario_matriculas_roster(turma_id uuid,disciplina_id uuid,matricula_id uuid,aluno_id uuid);
create table public.aulas_turma(id uuid primary key,turma_id uuid,disciplina_id uuid,data_aula date,carga_horaria numeric);
create table public.diario_frequencia(turma_id uuid,disciplina_id uuid,aluno_id uuid,aula_id uuid,status char(1));
create table public.diario_notas(turma_id uuid,disciplina_id uuid,aluno_id uuid,
  nota_p numeric,nota_ti numeric,nota_tg numeric,nota_s numeric,nota_cq numeric,nota_o numeric,nota_rec numeric);
create table public.matricula_aproveitamentos(id uuid default gen_random_uuid(),matricula_id uuid,
  disciplina_id uuid,media_final numeric,frequencia_percent numeric);
create table public.matriculas_estagios(turma_id uuid,disciplina_id uuid,aluno_id uuid,nota_final numeric,frequencia_estagio numeric);
create table public.matricula_componentes(id uuid primary key,matricula_id uuid,disciplina_id uuid,
  status text,tentativa_aprovada_id uuid);
create table public.matricula_disciplina_tentativas(id uuid primary key,componente_id uuid,turma_id uuid,
  disciplina_id uuid,status text,resultado_destino text,media_final_destino numeric,frequencia_destino numeric);
create table public.atividades_extra_classe(id uuid primary key default gen_random_uuid(),turma_id uuid,disciplina_id uuid,
  titulo text,status text,carga_horaria_compensacao numeric,prazo_entrega date,
  created_at timestamptz default now(),updated_at timestamptz default now());
create table internal_academic.test_history_rows(${resultColumns});
create table internal_academic.diario_resultados_importados(
  id uuid,matricula_id uuid,ativo boolean,${resultColumns});
create function internal_academic.get_diario_historical_snapshot_rows()
  returns setof internal_academic.test_history_rows language sql stable as $$
  select * from internal_academic.test_history_rows; $$;
create function internal_academic.resolve_diario_historical_result(internal_academic.diario_resultados_importados)
  returns setof internal_academic.test_history_rows language sql stable as $$
  select ($1).turma_id,($1).disciplina_id,($1).aluno_id,($1).nota_p,($1).nota_ti,($1).nota_tg,($1).nota_s,
    ($1).nota_cq,($1).nota_o,($1).nota_rec,($1).total_aulas,($1).total_faltas,
    ($1).frequencia_percent,($1).media_parcial,($1).media_final,($1).resultado_final; $$;
`;

export async function createDatabase({ patched = true, legacyPatched = true } = {}) {
  const db = new PGlite();
  try {
    await db.exec(schema);
    const weighted = await read('20260726034019_restore_hour_weighted_attendance_pending_policy_choice.sql');
    const dependencies = await read('20260731014843_integrate_dependency_diary_results.sql');
    const release = await read('20260729204559_release_pending_enrollments_for_class_diaries.sql');
    const historic = await read('20260913043304_diario_historical_roster_results.sql');
    await db.exec(await read('20261010224500_diario_sum_filled_instruments.sql'));
    await db.exec(functionSql(release,'internal_academic.is_student_released_for_diary'));
    for (const name of ['is_dependency_student_in_diary','p2_diario_matriculas_elegiveis_20260725','is_student_in_diary_roster']) {
      await db.exec(functionSql(dependencies,`internal_academic.${name}`));
    }
    await db.exec(functionSql(weighted,'internal_academic.p1_get_diario_resultados_20260719'));
    await db.exec(functionSql(weighted,'internal_academic.get_enrollment_results')
      .replace('internal_academic.get_enrollment_results(', 'internal_academic.p1_get_enrollment_results_20260730('));
    await db.exec(functionSql(historic,'public.get_diario_resultados'));
    await db.exec(await read('20260913043307_diario_historical_enrollment_results.sql'));
    await db.exec(await read('20261010223000_diario_optional_o_and_precision.sql'));
    await db.exec(await read('20261010224500_diario_sum_filled_instruments.sql'));
    await db.exec(`revoke all on function internal_academic.p1_get_diario_resultados_20260719(uuid,uuid),
      internal_academic.p1_get_enrollment_results_20260730(uuid),
      internal_academic.p1_get_pendencias_fechamento_periodo_20260719(uuid)
      from public,anon,authenticated,service_role;`);
    if (patched) await applyCandidates(db, { legacyPatched });
    await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
    return db;
  } catch (error) { await db.close(); throw error; }
}

export async function applyCandidates(db, { legacyPatched = true } = {}) {
  const names = [
    '20261109040000_extra_class_attendance_credit.sql',
    '20261109040100_extra_class_diary_results.sql',
    '20261109040200_extra_class_enrollment_results.sql',
    '20261109040300_extra_class_legacy_result_projection.sql',
  ];
  for (const name of names) await db.exec(await read(name));
  if (legacyPatched) await db.exec(await read('20261109114644_extra_class_legacy_rollout_evidence.sql'));
}

export async function seed(db, { status = 'ATIVO', presencial = true, extra = true } = {}) {
  const ids = { course: id(1), turma: id(2), subject: id(3), period: id(4), student: id(5), enrollment: id(6) };
  await db.exec(`insert into public.cursos values('${ids.course}','TECNICO');
    insert into public.turmas values('${ids.turma}','${ids.course}','${id(7)}','EM_ANDAMENTO',75,6);
    insert into public.disciplinas values('${ids.subject}',0);
    insert into public.periodos_letivos values('${ids.period}','${ids.turma}');
    insert into public.turmas_disciplinas values('${ids.turma}','${ids.subject}','${ids.period}',null,true,
      '{"p":true,"ti":false,"tg":false,"s":false,"cq":false,"o":false}');
    insert into public.matriculas values('${ids.enrollment}','${ids.turma}','${ids.student}','${status}',current_date-40);
    insert into public.diario_notas(turma_id,disciplina_id,aluno_id,nota_p)
      values('${ids.turma}','${ids.subject}','${ids.student}',8);`);
  if (presencial) await db.exec(`insert into public.aulas_turma values
    ('${id(11)}','${ids.turma}','${ids.subject}',current_date-20,8),
    ('${id(12)}','${ids.turma}','${ids.subject}',current_date-19,4),
    ('${id(13)}','${ids.turma}','${ids.subject}',current_date-18,4);
    insert into public.diario_frequencia values
    ('${ids.turma}','${ids.subject}','${ids.student}','${id(11)}','P'),
    ('${ids.turma}','${ids.subject}','${ids.student}','${id(12)}','P'),
    ('${ids.turma}','${ids.subject}','${ids.student}','${id(13)}','F');`);
  if (extra) await db.exec(`insert into public.atividades_extra_classe
    (id,turma_id,disciplina_id,titulo,status,carga_horaria_compensacao,prazo_entrega)
    values('${id(20)}','${ids.turma}','${ids.subject}','Atividade domiciliar','PUBLICADA',4,current_date-10);`);
  return ids;
}

