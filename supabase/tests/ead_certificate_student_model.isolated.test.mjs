import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const migrationDir = new URL('../migrations/', import.meta.url);
const migrationName = (await readdir(migrationDir)).find(name => name.endsWith('_student_ead_certificate_model.sql'));
assert.ok(migrationName, 'versioned model-reader migration exists');
const migration = await readFile(new URL(migrationName, migrationDir), 'utf8');
const ids = {
  student: '11111111-1111-4111-8111-111111111111',
  other: '22222222-2222-4222-8222-222222222222',
  course: '33333333-3333-4333-8333-333333333333',
  certificate: '44444444-4444-4444-8444-444444444444',
  missing: '55555555-5555-4555-8555-555555555555',
};
const model = {
  id: 'certificado_ead', tipoCurso: 'Educação a Distância (EAD)',
  textoFrente: '{{nome_aluno}} — {{carga_horaria}}', textoVerso: '{{grade_curricular}}',
  blocks: [{ id: 'texto', x: 10, y: 20, content: '{{curso_nome}}' }],
  bgFrenteUrl: 'https://example.test/front.png', signatureSource: 'diretoriaGeral',
};
const templates = [{ id: 'privado', tipoCurso: 'Cursos Técnicos', secretFixture: 'not returned' }, model];
const schema = `
create role anon; create role authenticated; create role service_role;
create schema auth; create schema internal_academic;
grant usage on schema public, auth, internal_academic to authenticated;
grant usage on schema public, auth to anon;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.parceiros (
  id uuid primary key, auth_user_id uuid, tipo text default 'ALUNO', status text default 'ATIVO',
  troca_senha_obrigatoria boolean default false, senha_temporaria_pendente boolean default false,
  senha_temporaria_emitida_em timestamptz, senha_atualizada_em timestamptz,
  aceitou_termos_uso boolean default true, termos_uso_versao text default 'test-v1',
  created_at timestamptz default now()
);
create function public.is_active_status(p_status text) returns boolean language sql immutable
  as $$ select upper(p_status) = 'ATIVO'; $$;
create function public.portal_identidade_termos_versao_vigente() returns text language sql immutable
  as $$ select 'test-v1'::text; $$;
create function public.current_aluno_id() returns uuid language sql stable security definer
set search_path = '' as $$
  select parceiro.id from public.parceiros parceiro
  where parceiro.auth_user_id = auth.uid()
    and upper(coalesce(parceiro.tipo, '')) = 'ALUNO'
    and public.is_active_status(parceiro.status)
    and coalesce(parceiro.troca_senha_obrigatoria, false) = false
    and not (coalesce(parceiro.senha_temporaria_pendente, false)
      and (parceiro.senha_temporaria_emitida_em is null or parceiro.senha_atualizada_em is null
        or parceiro.senha_atualizada_em <= parceiro.senha_temporaria_emitida_em))
    and coalesce(parceiro.aceitou_termos_uso, false) = true
    and parceiro.termos_uso_versao = public.portal_identidade_termos_versao_vigente()
  order by parceiro.created_at desc nulls last limit 1;
$$;
create table public.cursos (id uuid primary key, ead_config jsonb);
create table public.certificados_academicos (
  id uuid primary key, aluno_id uuid, curso_id uuid, modalidade text default 'EAD',
  status text default 'FINALIZADO', codigo_validacao text default 'SYNTHETIC-CODE',
  metadados jsonb default '{"hours":[26,26,27,27,27,27],"nota":100}'::jsonb,
  emitido_em timestamptz default '2026-01-01T00:00:00Z'
);
create table public.documentos_templates (id text primary key, conteudo jsonb);
alter table public.documentos_templates enable row level security;
grant select on public.documentos_templates to authenticated;
create policy identity_only on public.documentos_templates for select to authenticated
using (public.current_aluno_id() is not null and id in ('carteirinha','cracha','assinaturas'));
`;
const database = async () => {
  const db = new PGlite();
  await db.exec(schema);
  await db.query('insert into public.parceiros(id,auth_user_id) values ($1,$1),($2,$2)', [ids.student, ids.other]);
  await db.query('insert into public.cursos values ($1,$2)',
    [ids.course, JSON.stringify({ certificacao: { modeloDocumento: 'certificado_ead' } })]);
  await db.query('insert into public.certificados_academicos(id,aluno_id,curso_id) values ($1,$2,$3)',
    [ids.certificate, ids.student, ids.course]);
  await db.query('insert into public.documentos_templates values ($1,$2)', ['diplomas', JSON.stringify(templates)]);
  await db.exec(migration);
  return db;
};
const login = async (db, user = ids.student, role = 'authenticated') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.exec(`set role ${role}`);
};
const call = async (db, id = ids.certificate, schemaName = 'public') =>
  (await db.query(`select ${schemaName}.get_aluno_ead_certificate_model($1) as model`, [id])).rows[0].model;
const denied = (fn, code = '42501') => assert.rejects(fn, error => error.code === code);
const snapshot = async db => {
  await db.exec('reset role');
  return (await db.query(`select
    (select jsonb_agg(to_jsonb(c)) from public.certificados_academicos c) as certificates,
    (select jsonb_agg(to_jsonb(c)) from public.cursos c) as courses,
    (select jsonb_agg(to_jsonb(t)) from public.documentos_templates t) as templates,
    (select jsonb_agg(to_jsonb(p)) from pg_policies p where tablename='documentos_templates') as policies`)).rows[0];
};

test('owner gets exactly one original model, no registry access or academic writes', async () => {
  const db = await database();
  try {
    const before = await snapshot(db);
    await login(db);
    assert.deepEqual(await call(db), model);
    assert.equal((await db.query("select conteudo from public.documentos_templates where id='diplomas'")).rows.length, 0);
    assert.deepEqual(await call(db), model);
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});

test('another student, nonexistent certificate and direct private call fail closed', async () => {
  const db = await database();
  try {
    await login(db, ids.other);
    await denied(() => call(db));
    await denied(() => call(db, ids.missing));
    await denied(() => call(db, ids.certificate, 'internal_academic'));
    await login(db, null);
    await denied(() => call(db));
  } finally { await db.close(); }
});

test('anonymous and service roles have no execute, only authenticated public wrapper is invoker', async () => {
  const db = await database();
  try {
    for (const role of ['anon', 'service_role']) {
      for (const ns of ['public', 'internal_academic']) {
        assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') as allowed',
          [role, `${ns}.get_aluno_ead_certificate_model(uuid)`])).rows[0].allowed, false);
      }
    }
    const functions = (await db.query(`select n.nspname,p.prosecdef,p.provolatile,p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname='get_aluno_ead_certificate_model' order by n.nspname`)).rows;
    assert.deepEqual(functions.map(f => [f.nspname, f.prosecdef, f.provolatile]),
      [['internal_academic', true, 's'], ['public', false, 's']]);
    assert.ok(functions.every(f => f.proconfig.includes('search_path=""')));
    await login(db, null, 'anon');
    await denied(() => call(db));
  } finally { await db.close(); }
});

test('inactive, wrong profile, pending password and terms block even with a valid certificate', async () => {
  const db = await database();
  try {
    for (const patch of ["status='INATIVO'", "tipo='GESTOR'", 'troca_senha_obrigatoria=true',
      'senha_temporaria_pendente=true', 'aceitou_termos_uso=false', "termos_uso_versao='old'"]) {
      await db.exec('reset role; begin');
      await db.exec(`update public.parceiros set ${patch} where id='${ids.student}'`);
      await login(db);
      await denied(() => call(db));
      await db.exec('rollback');
    }
  } finally { await db.close(); }
});

test('unfinished, non-EAD and unissued certificate cannot obtain model', async () => {
  const db = await database();
  try {
    for (const patch of ["status='PENDENTE'", "modalidade='TECNICO'", 'codigo_validacao=null', "codigo_validacao=' '"]) {
      await db.exec('reset role; begin');
      await db.exec(`update public.certificados_academicos set ${patch}`);
      await login(db);
      await denied(() => call(db));
      await db.exec('rollback');
    }
  } finally { await db.close(); }
});

test('missing, malformed or non-EAD configured model is explicit error, not a generic fallback', async () => {
  const db = await database();
  try {
    for (const data of [null, {}, [], [templates[0]], [{ id: 'certificado_ead', tipoCurso: 'Cursos Técnicos' }]]) {
      await db.exec('reset role');
      await db.query("update public.documentos_templates set conteudo=$1 where id='diplomas'", [JSON.stringify(data)]);
      await login(db);
      await denied(() => call(db), 'P0002');
    }
    await db.exec('reset role; delete from public.documentos_templates');
    await login(db);
    await denied(() => call(db), 'P0002');
  } finally { await db.close(); }
});

test('only configured EAD model returned; unconfigured course preserves first EAD selection', async () => {
  const db = await database();
  try {
    const custom = { ...model, id: 'custom', modalidade: 'EAD' };
    await db.query('update public.documentos_templates set conteudo=$1', [JSON.stringify([...templates, custom])]);
    for (const [config, expected] of [
      [{ certificacao: { modeloDocumento: 'custom' } }, custom], [{}, model],
    ]) {
      await db.exec('reset role');
      await db.query('update public.cursos set ead_config=$1', [JSON.stringify(config)]);
      await login(db);
      assert.deepEqual(await call(db), expected);
    }
    await db.exec('reset role');
    await db.query('update public.cursos set ead_config=$1', [JSON.stringify({ certificacao: { modeloDocumento: 'absent' } })]);
    await login(db);
    await denied(() => call(db), 'P0002');
  } finally { await db.close(); }
});
