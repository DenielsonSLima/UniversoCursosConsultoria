import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Isolated PostgreSQL only, using the same PGlite 0.3.16 dependency as CI.
// PGLITE_MODULE_PATH=/tmp/universo-teacher-tests/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/technical_teacher_polo_scope.isolated.test.mjs
const packageUrl = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(packageUrl);
const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');
const baseline = await read('../migrations/20260808223000_fix_gestao_turma_docente_planejamento.sql');
const livre = await read('../migrations/20260822160200_create_curso_livre_class_contract.sql');
const structure = await read('../migrations/20260913043249_historical_technical_structure_guards.sql');
const registry = await read('../migrations/20260913043244_historical_technical_structure_registry.sql');
const migration = await read('../migrations/20261010210000_technical_teacher_polo_scope.sql');
const scenarios = await read('./technical_teacher_polo_scope.rollback.sql');

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
-- Only access permission is reduced; the real assignment RPC performs its
-- authorization, teacher eligibility, locks, updates and canonical result.
create function public.can_operate_turma_academics(uuid) returns boolean language sql stable as $$
  select coalesce(auth.role() = 'service_role', false);
$$;
create table public.polos(id uuid primary key);
insert into public.polos values
 ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
create table public.cursos(id uuid primary key, nome text, modalidade text, carga_horaria integer);
create table public.modulos(id uuid primary key, curso_id uuid references public.cursos, nome text, ordem integer);
create table public.disciplinas(id uuid primary key, modulo_id uuid references public.modulos,
  nome text, ordem integer, carga_horaria integer);
create table public.turmas(id uuid primary key, codigo text, nome text, curso_id uuid references public.cursos,
  polo_id uuid not null references public.polos, turno text, status text, data_inicio date,
  data_previsao_termino date, valor_matricula numeric, valor_rematricula numeric,
  qtd_parcelas integer, valor_parcela numeric, primeiro_vencimento_padrao date);
create table public.periodos_letivos(id uuid primary key, turma_id uuid references public.turmas,
  modulo_id uuid references public.modulos, nome text, ordem integer, status text);
create table public.parceiros(id uuid primary key, tipo text, nome text, status text default 'ATIVO',
  polo_id uuid references public.polos, polo_ids uuid[]);
create table public.turmas_disciplinas(turma_id uuid references public.turmas,
  disciplina_id uuid references public.disciplinas, professor_id uuid references public.parceiros,
  professor_nome text, concluida boolean default false, periodo_letivo_id uuid references public.periodos_letivos,
  bloqueio_diario text default 'ABERTO', created_at timestamptz default now(), primary key(turma_id, disciplina_id));
create table internal_academic.transition_authorizations(transaction_id text, backend_pid integer,
  entity text, record_id uuid, new_status text);
create table public.curso_livre_avaliacoes(id uuid primary key, curso_id uuid, status text, versao integer);
create table public.turmas_livres_academico(turma_id uuid primary key references public.turmas,
  avaliacao_id uuid, professor_id uuid references public.parceiros, updated_at timestamptz);
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
`;

async function createDatabase() {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(functionSql(baseline, 'public.atribuir_docente_disciplinas_turma')
      .replace('public.atribuir_docente_disciplinas_turma(', 'internal_academic.atribuir_docente_disciplinas_turma_pre_livre('));
    await db.exec(functionSql(livre, 'public.atribuir_docente_disciplinas_turma'));
    await db.exec(functionSql(registry, 'internal_academic.consume_historical_binding_claim'));
    await db.exec(functionSql(structure, 'public.protect_technical_class_discipline_binding'));
    for (const name of ['validate_turma_livre_academico', 'sync_turma_livre_structure',
      'enforce_turma_livre_single_teacher', 'sync_turma_livre_teacher']) {
      await db.exec(functionSql(livre, `internal_academic.${name}`));
    }
    await db.exec(`
      create trigger protect_technical_class_discipline_binding_trigger before insert or update or delete
        on public.turmas_disciplinas for each row execute function public.protect_technical_class_discipline_binding();
      create trigger validate_turma_livre_academico_trigger before insert or update
        on public.turmas_livres_academico for each row execute function internal_academic.validate_turma_livre_academico();
      create trigger sync_turma_livre_structure_trigger after insert or update of curso_id
        on public.turmas for each row execute function internal_academic.sync_turma_livre_structure();
      create trigger enforce_turma_livre_single_teacher_trigger before insert or update or delete
        on public.turmas_disciplinas for each row execute function internal_academic.enforce_turma_livre_single_teacher();
      create trigger sync_turma_livre_teacher_trigger after update of professor_id
        on public.turmas_livres_academico for each row execute function internal_academic.sync_turma_livre_teacher();
    `);
    return db;
  } catch (error) { await db.close(); throw error; }
}

test('contrato anterior aceita docente técnico fora do polo (reprodução)', async () => {
  const db = await createDatabase();
  try {
    await assert.rejects(db.exec(scenarios), (error) => (
      error.code === 'ZX001' && error.message === 'Foreign polo assignment was accepted'
    ));
    await db.exec('rollback');
  } finally { await db.close(); }
});

test('guarda nova protege RPC/INSERT/UPDATE e preserva multipolo, legado/upsert, remoção e outras modalidades', async () => {
  const db = await createDatabase();
  try {
    await db.exec(migration);
    await db.exec(scenarios);
    const { rows } = await db.query('select count(*)::integer as count from public.parceiros');
    assert.equal(rows[0].count, 0, 'Synthetic teacher fixtures must be rolled back');
  } finally { await db.close(); }
});

test('BEFORE INSERT quebraria o upsert de docente legado mantido', async () => {
  const db = await createDatabase();
  try {
    await db.exec(migration.replace('after insert or update of professor_id', 'before insert or update of professor_id'));
    await assert.rejects(db.exec(scenarios), (error) => (
      error.code === '22023' && error.message === 'O docente precisa estar vinculado ao polo da turma técnica.'
        && error.where?.includes('on conflict (turma_id, disciplina_id)')
    ));
    await db.exec('rollback');
  } finally { await db.close(); }
});
