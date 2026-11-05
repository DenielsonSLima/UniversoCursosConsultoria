import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const packageUrl = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(packageUrl);
const db = new PGlite();
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = name => read(`../migrations/${name}`);
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const turma = '00000000-0000-0000-0000-000000000022';
const course = '00000000-0000-0000-0000-000000000012';
const prepare = (request, manager, amount = 99.9) => scalar(`select public.ead_prepare_checkout_attempt(
  $1,$2,$3,'banese_card','production','BOLETO',$4,'2028-12-31','Curso sintético',null,null${manager === undefined ? '' : ',$5'}) value`,
  [id(1), turma, id(request), amount, ...manager === undefined ? [] : [manager]]);

try {
  for (const name of ['caixa_monthly_optimization.fixture.sql', 'optional_ead_checkout.fixture.sql',
    'ead_checkout_expiration.fixture.sql', 'ead_checkout_attempts.fixture.sql']) await db.exec(read(name).replace('CREATE EXTENSION pgcrypto WITH SCHEMA extensions;', '')); // gen_random_uuid is built into PostgreSQL.
  for (const name of ['20261005015448_ead_checkout_expiration_schema.sql',
    '20261005015533_ead_checkout_attempt_model.sql', '20261005015535_ead_checkout_attempt_reservation.sql']) {
    await db.exec(migration(name));
  }
  await db.exec(`create or replace function public.gestor_has_module(text) returns boolean language sql as
    $$select global_allowed from test_caixa.access_state$$;
    create or replace function public.can_write_turma(uuid) returns boolean language sql as
    $$select scoped_allowed from test_caixa.access_state$$;`);
  await db.exec(`create function internal_contas.ead_expiration_write_allowed(uuid) returns boolean language sql as $$select false$$`);
  await db.exec(migration('20261105230000_require_ead_checkout_before_access.sql'));
  await db.exec(migration('20261105230100_allow_manager_ead_private_course_checkout.sql'));
  await db.query("insert into public.parceiros(id,nome,cpf_cnpj) values($1,'Aluno sintético','00000000000')", [id(1)]);
  await db.query('update test_caixa.access_state set role_name=$1,actor=$2', ['service_role', id(9)]);
  await db.query('update public.cursos set publicar_site=false where id=$1', [course]);
  await assert.rejects(() => prepare(100), /indisponível/);
  await assert.rejects(() => prepare(100, false), /indisponível/);
  assert.equal(await scalar('select count(*)::int value from public.matriculas'), 0);
  const charge = await prepare(100, true);
  assert.equal(charge.action, 'CREATE');
  assert.equal(await scalar('select status value from public.matriculas where id=$1', [charge.matriculaId]), 'PENDENTE');
  assert.equal(await scalar('select count(*)::int value from public.ead_aluno_progresso'), 0);
  assert.equal((await prepare(100, true)).action, 'AWAITING_CONFIRMATION');
  assert.equal((await prepare(101, true)).receivableId, charge.receivableId);
  assert.equal(await scalar('select count(*)::int value from public.contas_receber'), 1);
  await assert.rejects(() => prepare(100, true, 100), /Request id/);
  await db.query('update test_caixa.access_state set role_name=$1', ['authenticated']);
  await assert.rejects(() => prepare(102, true), error => error.code === '42501');
  await assert.rejects(() => scalar('select public.ead_matricular_aluno_manual($1,$2) value', [turma,id(1)]), error => error.code === 'PT409');
  await assert.rejects(() => scalar('select public.ead_liberar_matricula($1) value', [charge.matriculaId]), error => error.code === 'PT409');
  await db.exec('update test_caixa.access_state set scoped_allowed=false');
  await assert.rejects(() => scalar('select public.ead_liberar_matricula($1) value', [charge.matriculaId]), error => error.code === '42501');
  await db.exec('update test_caixa.access_state set actor=null');
  await assert.rejects(() => scalar('select public.ead_matricular_aluno_manual($1,$2) value', [turma,id(1)]), error => error.code === '42501');
  assert.equal(await scalar('select status value from public.matriculas where id=$1', [charge.matriculaId]), 'PENDENTE');
  const projection = migration('20261005015539_ead_checkout_attempt_projection.sql');
  const start = projection.indexOf('create function public.ead_activate_matricula_on_paid_inscricao()');
  await db.exec(projection.slice(start, projection.indexOf('end; $$;', start) + 9));
  await db.exec(`create trigger test_paid_projection after update of status on public.inscricoes_online
    for each row execute function public.ead_activate_matricula_on_paid_inscricao()`);
  await assert.rejects(() => db.query("update public.inscricoes_online set status='PAGO' where id=$1", [charge.inscricaoId]), error => error.code === 'PT409');
  await db.query(`update public.contas_receber set status='PAGO',valor_pago=99.9,data_pagamento='2028-12-31',
    gateway_status='PAID',origem_pagamento='BANESE' where id=$1`, [charge.receivableId]);
  await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1", [charge.inscricaoId]);
  assert.equal(await scalar('select status value from public.matriculas where id=$1', [charge.matriculaId]), 'ATIVO');
  assert.equal(await scalar(`select has_function_privilege('authenticated',
    'public.ead_prepare_checkout_attempt(uuid,uuid,uuid,text,text,text,numeric,date,text,numeric,numeric,boolean)','EXECUTE') value`), false);
  console.log('PASS: private EAD manager checkout, legacy public guard, pending access, idempotent receipt, role/scope guards, legacy bypass blocked and paid-only activation.');
} catch (error) {
  console.error(error.message, error.where || '', error.detail || '');
  process.exitCode = 1;
} finally {
  await db.close();
}
