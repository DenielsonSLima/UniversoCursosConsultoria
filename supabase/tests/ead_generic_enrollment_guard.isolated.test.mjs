import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleUrl = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleUrl);
const db = new PGlite();
const source = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const functionSource = (sql, name) => {
  const start = sql.search(new RegExp(`create or replace function ${name.replaceAll('.', '\\.')}\\(`, 'i'));
  assert.ok(start >= 0, name);
  const tail = sql.slice(start);
  const tag = tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0, tail.indexOf(`${tag};`) + tag.length + 1);
};
const claim = (key, value) => db.query('select set_config($1,$2,false)', [`test.${key}`, value]);
const enroll = (turma, aluno = id(1)) => scalar(
  'select to_jsonb(public.matricular_aluno_turma($1,$2,$3)) value', [aluno, turma, id(2)]);
const rejected = (operation, code, message) => assert.rejects(operation,
  error => error.code === code && (!message || message.test(error.message)));

try {
  // Only identity/scope and unrelated collaborators are synthetic. The generic
  // entrypoint and its real legacy implementation come from versioned product SQL.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema internal_academic;
    create table public.cursos(id uuid primary key, modalidade text);
    create table public.turmas(id uuid primary key,curso_id uuid,polo_id uuid);
    create table public.parceiros(id uuid primary key,tipo text);
    create table public.matriculas(id uuid primary key default gen_random_uuid(),
      aluno_id uuid,turma_id uuid,status text,unique(aluno_id,turma_id));
    create table public.matricula_movimentacoes(id uuid primary key default gen_random_uuid(),
      matricula_id uuid,aluno_id uuid,tipo text,status_anterior text,status_novo text,
      turma_destino_id uuid,motivo text,responsavel_id uuid);
    create table public.contas_receber(id uuid primary key,matricula_id uuid);
    create table public.turmas_plano_financeiro_unico(turma_id uuid primary key);
    create function auth.role() returns text language sql as
      $$select current_setting('test.role',true)$$;
    create function public.gestor_has_module(text) returns boolean language sql as
      $$select coalesce(current_setting('test.modules',true),'[]')::jsonb ? $1$$;
    create function public.can_write_turma(uuid) returns boolean language sql as
      $$select coalesce(current_setting('test.scope',true),'false')::boolean$$;
    create function public.assert_aluno_sem_matricula_curso_duplicada(uuid,uuid,uuid)
      returns void language sql as $$select$$;
    create function public.sync_aluno_polo_scope(uuid,uuid) returns void language sql as $$select$$;
    create function internal_academic.authorize_enrollment_upsert(uuid,uuid,text)
      returns void language sql as $$select$$;
  `);
  const legacy = functionSource(source('20260702001000_block_duplicate_course_enrollments.sql'),
    'public.matricular_aluno_turma').replace('public.matricular_aluno_turma(',
    'internal_academic.legacy_matricular_aluno_turma(');
  await db.exec(legacy);
  await db.exec(functionSource(source('20260812005933_create_nontechnical_single_plan_financial.sql'),
    'public.matricular_aluno_turma'));
  await claim('role', 'authenticated');
  await claim('modules', '["gestao"]');
  await claim('scope', 'true');
  await db.query("insert into public.parceiros values($1,'Aluno'),($2,'Aluno')", [id(1), id(3)]);
  for (const [n, modalidade] of [[10, 'EAD'], [11, 'LIVRE'], [12, 'ESPECIALIZACAO'], [13, 'TECNICO']]) {
    await db.query('insert into public.cursos values($1,$2)', [id(n), modalidade]);
    await db.query('insert into public.turmas values($1,$2,$3)', [id(n + 10), id(n), id(99)]);
  }

  // Reproduce the defect before applying the new guard: an academic manager
  // with no Financeiro can activate EAD through the generic RPC without a title.
  const bypass = await enroll(id(20));
  assert.equal(bypass.status, 'ATIVO');
  assert.equal(await scalar('select count(*)::int value from public.contas_receber'), 0);
  await db.exec('truncate public.matricula_movimentacoes,public.matriculas');

  await db.exec(source('20261111010609_block_ead_generic_enrollment_bypass.sql'));
  await rejected(() => enroll(id(20)), 'PT409', /geração do financeiro/);
  assert.equal(await scalar('select count(*)::int value from public.matriculas'), 0);
  assert.equal(await scalar('select count(*)::int value from public.matricula_movimentacoes'), 0);
  await claim('modules', '["gestao","financeiro"]');
  await rejected(() => enroll(id(20)), 'PT409');
  await claim('role', 'service_role');
  await rejected(() => enroll(id(20)), 'PT409');
  await claim('role', 'authenticated');
  await claim('modules', '["gestao"]');
  await db.query("insert into public.matriculas(aluno_id,turma_id,status) values($1,$2,'PENDENTE')", [id(3), id(20)]);
  await rejected(() => enroll(id(20), id(3)), 'PT409');
  assert.equal(await scalar('select status value from public.matriculas where aluno_id=$1', [id(3)]), 'PENDENTE');

  for (const turma of [id(21), id(22)]) {
    const matricula = await enroll(turma);
    assert.equal(matricula.status, 'ATIVO');
    assert.equal(await scalar('select responsavel_id value from public.matricula_movimentacoes where matricula_id=$1',
      [matricula.id]), id(2));
  }
  await rejected(() => enroll(id(23)), '22023', /Matrícula técnica/);
  await db.query('insert into public.turmas_plano_financeiro_unico values($1)', [id(21)]);
  await rejected(() => enroll(id(21)), '22023', /plano financeiro único/);
  await claim('modules', '["financeiro"]');
  await rejected(() => enroll(id(20)), '42501');
  await claim('modules', '["gestao"]');
  await claim('scope', 'false');
  await rejected(() => enroll(id(20)), '42501');
  await claim('scope', 'true');
  await rejected(() => enroll(id(999)), '22023', /Turma não encontrada/);
  for (const [role, allowed] of [['anon', false], ['authenticated', true], ['service_role', true]]) {
    assert.equal(await scalar(`select has_function_privilege($1,
      'public.matricular_aluno_turma(uuid,uuid,uuid)','EXECUTE') value`, [role]), allowed);
  }
  assert.equal(await scalar('select count(*)::int value from public.contas_receber'), 0);
  console.log('PASS: reproduced generic EAD free activation; guard blocks all legacy EAD writes and preserves non-EAD enrollment, pending status, scope and grants.');
} catch (error) {
  console.error(error.message, error.where || '', error.detail || '');
  process.exitCode = 1;
} finally {
  await db.close();
}
