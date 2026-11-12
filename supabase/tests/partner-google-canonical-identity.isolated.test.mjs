import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261112143359_partner_google_canonical_identity.sql', import.meta.url), 'utf8');
const id = suffix => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const partner = id(1), owner = id(2), other = id(3), actor = id(4);
const setup = async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.parceiros(id uuid PRIMARY KEY,tipo text,email text,auth_user_id uuid,
      auth_login_email text,polo_id uuid,polo_ids uuid[]);
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz,
      raw_app_meta_data jsonb,updated_at timestamptz);
    CREATE TABLE auth.identities(identity_id text,user_id uuid,provider text,email text,
      identity_data jsonb,created_at timestamptz,updated_at timestamptz);
    CREATE FUNCTION public.is_partner_in_gestor_scope(uuid,uuid[]) RETURNS boolean LANGUAGE sql AS
      $$ SELECT coalesce(current_setting('test.allowed',true),'false')='true' $$;
    SELECT set_config('request.jwt.claim.sub','${actor}',false),set_config('test.allowed','true',false);
    INSERT INTO public.parceiros VALUES('${partner}','Aluno','corrected@example.invalid','${owner}',
      'institutional@example.invalid',null,null);
    INSERT INTO auth.users VALUES('${owner}','institutional@example.invalid',now(),'{}',now()),
      ('${other}','corrected@example.invalid',now(),'{}',now());
    INSERT INTO auth.identities VALUES('owner-email','${owner}','email','institutional@example.invalid','{}',now(),now()),
      ('other-google','${other}','google','corrected@example.invalid','{}',now(),now());`);
  await db.exec(migration);
  return db;
};
const status = async db => (await db.query('SELECT * FROM public.get_partner_google_identity_status($1)',[partner])).rows[0];
const scoped = fn => async () => { const db = await setup(); try { await fn(db); } finally { await db.close(); } };

test('contato corrigido nao invalida conta institucional nem mostra identidade Google de outra pessoa', scoped(async db => {
  const result = await status(db);
  assert.equal(result.has_auth_user,true);
  assert.equal(result.google_linked,false);
  assert.equal(result.google_email,null);
  await db.exec(`UPDATE public.parceiros SET email='another-correction@example.invalid'`);
  assert.equal((await status(db)).has_auth_user,true);
}));

test('sem contato continua consultando identidade canonica e usa auth_login_email somente sem UID', scoped(async db => {
  await db.exec(`UPDATE public.parceiros SET email=null`);
  assert.equal((await status(db)).has_auth_user,true);
  await db.exec(`UPDATE public.parceiros SET auth_user_id=null`);
  assert.equal((await status(db)).has_auth_user,true);
  await db.exec(`UPDATE public.parceiros SET auth_login_email=null,email='corrected@example.invalid'`);
  assert.equal((await status(db)).has_auth_user,false);
}));

test('UID obsoleto nunca cai para contato nem auth_login_email', scoped(async db => {
  await db.exec(`UPDATE public.parceiros SET auth_user_id='${id(999)}',auth_login_email='corrected@example.invalid'`);
  assert.equal((await status(db)).has_auth_user,false);
  await assert.rejects(db.query('SELECT * FROM public.unlink_partner_google_identity($1)',[partner]), /Conta de acesso vinculada/);
}));

test('consulta e desvinculacao negam anonimo e fora do escopo', scoped(async db => {
  await db.exec(`SELECT set_config('request.jwt.claim.sub','',false)`);
  await assert.rejects(status(db), /Autenticacao necessaria/);
  await assert.rejects(db.query('SELECT * FROM public.unlink_partner_google_identity($1)',[partner]), /Autenticacao necessaria/);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${actor}',false),set_config('test.allowed','false',false)`);
  await assert.rejects(status(db), /permissao/);
  await assert.rejects(db.query('SELECT * FROM public.unlink_partner_google_identity($1)',[partner]), /permissao/);
}));

test('desvinculacao usa a mesma identidade canonica do status e preserva outra conta', scoped(async db => {
  await db.exec(`INSERT INTO auth.identities VALUES('owner-google','${owner}','google','old@example.invalid','{}',now(),now())`);
  assert.equal((await status(db)).google_email,'old@example.invalid');
  const result = (await db.query('SELECT * FROM public.unlink_partner_google_identity($1)',[partner])).rows[0];
  assert.equal(result.google_unlinked,true);
  assert.deepEqual((await db.query("SELECT identity_id FROM auth.identities ORDER BY identity_id")).rows,
    [{identity_id:'other-google'},{identity_id:'owner-email'}]);
  assert.equal((await status(db)).has_auth_user,true);
}));

test('ultimo metodo Google protegido e Professor usa o mesmo vinculo canonico', scoped(async db => {
  await db.exec(`UPDATE public.parceiros SET tipo='Professor';
    DELETE FROM auth.identities WHERE user_id='${owner}';
    INSERT INTO auth.identities VALUES('owner-google','${owner}','google','old@example.invalid','{}',now(),now())`);
  assert.equal((await status(db)).google_linked,true);
  await assert.rejects(db.query('SELECT * FROM public.unlink_partner_google_identity($1)',[partner]), /unico metodo/);
  assert.equal((await status(db)).google_linked,true);
}));

test('security definer tem search_path vazio e anon nao executa', scoped(async db => {
  const rows=(await db.query(`SELECT proname,proconfig,
    has_function_privilege('anon',oid,'execute') AS anon_access
    FROM pg_proc WHERE proname IN ('get_partner_google_identity_status','unlink_partner_google_identity')`)).rows;
  for(const row of rows) { assert.equal(row.anon_access,false); assert.deepEqual(row.proconfig,['search_path=""']); }
}));
