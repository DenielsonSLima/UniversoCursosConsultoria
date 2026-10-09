import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const moduleName = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(moduleName);
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const previousMigration = await read('../migrations/20261009112324_resolve_academic_student_login_identity.sql');
const migration = `${previousMigration}\n${await read('../migrations/20261009193037_resolve_student_login_enrollment_polo.sql')}`;
const legacyMigration = await read('../migrations/20260728150552_secure_student_registration_portal_auth.sql');
const legacyStart = legacyMigration.indexOf('create or replace function public.resolve_portal_login_identity(');
assert.ok(legacyStart >= 0);
const legacyResolver = legacyMigration.slice(legacyStart, legacyMigration.indexOf('$$;', legacyStart) + 3);
const formatter = await read('./fixtures/portal-academic-registration-formatter.sql');
const firstStudent = '10000000-0000-0000-0000-000000000001';
const secondStudent = '10000000-0000-0000-0000-000000000002';
const firstEnrollment = '20000000-0000-0000-0000-00000000002a';
const firstAlias = 'UNIV-A-00000001';
const firstEmail = 'student-one@acesso.universocc.invalid';

test('matrícula acadêmica resolve somente uma identidade canônica', async t => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.documentos_templates (id text primary key, conteudo jsonb);
    create table public.parceiros (
      id uuid primary key, tipo text, status text, matricula_acesso text,
      auth_login_email text, polo_id uuid
    );
    create table public.turmas (id uuid primary key, polo_id uuid);
    create table public.matriculas (
      id uuid primary key, aluno_id uuid references public.parceiros(id),
      data_matricula timestamptz, status text, turma_id uuid references public.turmas(id)
    );
    create function public.is_active_status(value text) returns boolean
      language sql immutable as $$ select lower(value) = 'ativo' $$;
  `);
  await db.exec(formatter);
  await db.exec(migration);
  const resolveIdentity = async identifier => {
    const result = await db.query('select public.resolve_portal_login_identity($1) as email', [identifier]);
    return result.rows[0].email;
  };
  const reset = async () => {
    await db.exec('truncate public.matriculas, public.parceiros, public.turmas, public.documentos_templates;');
    await db.query(`insert into public.parceiros values
      ($1, 'Aluno', 'ATIVO', $2, $3, null),
      ($4, 'Aluno', 'ATIVO', 'UNIV-A-00000002', 'student-two@acesso.universocc.invalid', null)`,
    [firstStudent, firstAlias, firstEmail, secondStudent]);
    await db.query(`insert into public.matriculas (id, aluno_id, data_matricula, status) values ($1, $2, '2026-07-01T00:00:00Z', 'ATIVO')`,
      [firstEnrollment, firstStudent]);
  };
  const setConfig = config => db.query(`insert into public.documentos_templates values
    ('academicos_config', $1::jsonb) on conflict (id) do update set conteudo = excluded.conteudo`,
  [JSON.stringify(config)]);
  const scenario = async (name, body) => t.test(name, async () => { await reset(); await body(); });
  const attachDifferentClassPolo = async () => {
    await setConfig({ usePoloCode: true });
    await db.exec(`insert into public.turmas values
      ('40000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555');`);
    await db.query(`update public.matriculas set turma_id = '40000000-0000-0000-0000-000000000001' where id = $1`, [firstEnrollment]);
  };

  try {
    await scenario('reproduz falha original e confirma correção para o mesmo vínculo', async () => {
      await db.exec(legacyResolver);
      assert.equal(await resolveIdentity(firstAlias), firstEmail);
      assert.equal(await resolveIdentity('UNIV-260042'), null);
      await db.exec(migration);
      assert.equal(await resolveIdentity('UNIV-260042'), firstEmail);
    });

    await scenario('matrícula da ficha usa ID e data do vínculo, preservando o alias antigo', async () => {
      assert.equal(await resolveIdentity('UNIV-260042'), firstEmail);
      assert.equal(await resolveIdentity('  univ-260042  '), firstEmail);
      assert.equal(await resolveIdentity(firstAlias), firstEmail);
      assert.equal(await resolveIdentity('univ-a-00000001'), firstEmail);
      assert.equal(await resolveIdentity('UNIV-260001'), null, 'ID do parceiro não é matrícula do vínculo');
    });

    await scenario('conta sem e-mail pessoal não exige caixa postal para resolver a matrícula', async () => {
      assert.equal(await resolveIdentity('UNIV-260042'), firstEmail);
      await db.query('update public.parceiros set auth_login_email = null where id = $1', [firstStudent]);
      assert.equal(await resolveIdentity('UNIV-260042'), null);
    });

    await scenario('configuração acadêmica e polo seguem o formatador canônico existente', async () => {
      await setConfig({ matriculaPrefix: 'esc-', matriculaDigits: 6, yearFormat: 'yyyy', usePoloCode: true });
      await db.query(`update public.parceiros set polo_id = '55555555-5555-5555-5555-555555555555' where id = $1`, [firstStudent]);
      await db.query(`update public.matriculas set data_matricula = '2024-06-01T00:00:00Z' where id = $1`, [firstEnrollment]);
      assert.equal(await resolveIdentity('ESC-202402000042'), firstEmail);
      assert.equal(await resolveIdentity('UNIV-260042'), null);
      assert.equal(await resolveIdentity(firstAlias), firstEmail);
    });

    await scenario('vários vínculos do mesmo aluno contam como uma pessoa', async () => {
      await db.query(`insert into public.matriculas (id, aluno_id, data_matricula, status) values
        ('30000000-0000-0000-0000-00000000002a', $1, '2026-08-01', 'CONCLUIDO'),
        ('30000000-0000-0000-0000-00000000002b', $1, '2026-08-01', 'CONCLUIDO')`, [firstStudent]);
      assert.equal(await resolveIdentity('UNIV-260042'), firstEmail);
      assert.equal(await resolveIdentity('UNIV-260043'), firstEmail);
    });

    await scenario('polo da turma diferente do cadastro resolve a matrícula exibida nas três telas', async () => {
      await attachDifferentClassPolo();
      await db.exec(previousMigration);
      assert.equal(await resolveIdentity('UNIV-26020042'), null, 'resolvedor anterior ignorava o polo da turma');
      await db.exec(migration);
      assert.equal(await resolveIdentity('UNIV-26020042'), firstEmail);
    });

    await scenario('matrícula anterior pelo polo do parceiro e alias de acesso continuam aceitos', async () => {
      await attachDifferentClassPolo();
      assert.equal(await resolveIdentity('UNIV-26020042'), firstEmail);
      assert.equal(await resolveIdentity('UNIV-26010042'), firstEmail);
      assert.equal(await resolveIdentity(firstAlias), firstEmail);
    });

    await scenario('colisão da matrícula pelo polo da turma com matrícula legada de outro aluno é recusada', async () => {
      await attachDifferentClassPolo();
      await db.query(`update public.parceiros set polo_id = '55555555-5555-5555-5555-555555555555' where id = $1`, [secondStudent]);
      await db.query(`insert into public.matriculas (id, aluno_id, data_matricula, status) values
        ('30000000-0000-0000-0000-00000000002a', $1, '2026-07-01', 'ATIVO')`, [secondStudent]);
      assert.equal(await resolveIdentity('UNIV-26020042'), null);
      await db.query('update public.parceiros set auth_login_email = null where id = $1', [secondStudent]);
      assert.equal(await resolveIdentity('UNIV-26020042'), null, 'aluno sem Auth também conta na colisão');
      assert.equal(await resolveIdentity(firstAlias), firstEmail);
    });

    await scenario('matrícula concluída não bloqueia aluno cujo cadastro continua ativo', async () => {
      await db.query(`update public.matriculas set status = 'CONCLUIDO' where id = $1`, [firstEnrollment]);
      assert.equal(await resolveIdentity('UNIV-260042'), firstEmail);
      await db.query(`update public.parceiros set status = 'INATIVO' where id = $1`, [firstStudent]);
      assert.equal(await resolveIdentity('UNIV-260042'), null);
      assert.equal(await resolveIdentity(firstAlias), null);
    });

    await scenario('dois alunos com a mesma matrícula principal são recusados inclusive sem Auth', async () => {
      await db.query(`insert into public.matriculas (id, aluno_id, data_matricula, status) values
        ('30000000-0000-0000-0000-00000000002a', $1, '2026-07-01', 'ATIVO')`, [secondStudent]);
      assert.equal(await resolveIdentity('UNIV-260042'), null);
      await db.query('update public.parceiros set auth_login_email = $1 where id = $2', [firstEmail, secondStudent]);
      assert.equal(await resolveIdentity('UNIV-260042'), null, 'e-mail compartilhado não elimina ambiguidade entre alunos');
      await db.query('update public.parceiros set auth_login_email = null where id = $1', [secondStudent]);
      assert.equal(await resolveIdentity('UNIV-260042'), null);
      assert.equal(await resolveIdentity(firstAlias), firstEmail);
    });

    await scenario('colisão entre alias de uma pessoa e matrícula de outra falha fechado', async () => {
      await setConfig({ matriculaPrefix: 'UNIV-A-0000', matriculaDigits: 4, yearFormat: 'none' });
      await db.query(`update public.parceiros set matricula_acesso = 'UNIV-A-00000042' where id = $1`, [secondStudent]);
      assert.equal(await resolveIdentity('UNIV-A-00000042'), null);
      await db.query('update public.parceiros set auth_login_email = null where id = $1', [secondStudent]);
      assert.equal(await resolveIdentity('UNIV-A-00000042'), null);
      await db.query(`update public.parceiros set matricula_acesso = 'UNIV-A-00000002' where id = $1`, [secondStudent]);
      await db.query(`update public.parceiros set matricula_acesso = 'UNIV-A-00000042' where id = $1`, [firstStudent]);
      assert.equal(await resolveIdentity('UNIV-A-00000042'), firstEmail);
    });

    await scenario('professor e cadastro inativo não participam da resolução de aluno', async () => {
      await db.query(`update public.parceiros set tipo = 'Professor' where id = $1`, [firstStudent]);
      assert.equal(await resolveIdentity('UNIV-260042'), null);
      assert.equal(await resolveIdentity(firstAlias), null);
    });

    await scenario('e-mail e rejeição de entradas inválidas preservam comportamento anterior', async () => {
      assert.equal(await resolveIdentity('  STUDENT@EXAMPLE.TEST  '), 'student@example.test');
      for (const input of [null, '', '   ', 'a'.repeat(255), '260042', 'UNIV-999999', 'UNIV-A-99999999', "UNIV-260042' OR true --"]) {
        assert.equal(await resolveIdentity(input), null);
      }
    });

    await scenario('RPC permanece restrita ao backend com search_path vazio', async () => {
      const result = await db.query(`select
        has_function_privilege('anon', 'public.resolve_portal_login_identity(text)', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'public.resolve_portal_login_identity(text)', 'EXECUTE') as authenticated,
        has_function_privilege('service_role', 'public.resolve_portal_login_identity(text)', 'EXECUTE') as service,
        prosecdef, proconfig
        from pg_proc where oid = 'public.resolve_portal_login_identity(text)'::regprocedure`);
      assert.equal(result.rows[0].anon, false);
      assert.equal(result.rows[0].authenticated, false);
      assert.equal(result.rows[0].service, true);
      assert.equal(result.rows[0].prosecdef, true);
      assert.deepEqual(result.rows[0].proconfig, ['search_path=""']);
      const before = await db.query('select * from public.parceiros order by id');
      await resolveIdentity('UNIV-260042');
      assert.deepEqual((await db.query('select * from public.parceiros order by id')).rows, before.rows);
    });
  } finally {
    await db.close();
  }
});
