import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Test the actual reader and canonical granular-tab helper, entirely in PostgreSQL/WASM.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const definition = (sql, name) => {
  const start = sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'));
  assert.ok(start >= 0, name);
  const tail = sql.slice(start), tag = tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0, tail.indexOf(`${tag};`) + tag.length + 1);
};
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const polo = id(1), otherPolo = id(2);
const setting = (key, value) => db.query('SELECT set_config($1,$2,false)', [`test.${key}`, String(value)]);
const permissions = (value) => setting('permissions', JSON.stringify(value));
const list = async (scope = polo) => (await db.query('SELECT * FROM public.get_financeiro_credores_por_polo_secure($1)', [scope])).rows;
const denied = fn => assert.rejects(fn, error => error.code === '42501');

try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.role',true),'') $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION public.is_financeiro_for_polo(uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT CASE WHEN current_setting('test.scope_null',true)='true' THEN NULL
        ELSE auth.uid() IS NOT NULL AND $1::text=current_setting('test.polo',true) END $$;
    CREATE FUNCTION public.gestor_has_module(text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT $1='financeiro' AND current_setting('test.module',true)='true' $$;
    CREATE FUNCTION public.gestor_effective_permissions() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.permissions',true)::jsonb $$;
    CREATE FUNCTION public.gestor_has_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT public.gestor_has_module('financeiro')
        AND coalesce((public.gestor_effective_permissions()->'financeiroTabs') ? $1,false) $$;
    CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,tipo text,cpf_cnpj text,email text,
      telefone text,foto_url text,polo_id uuid,polo_ids uuid[],status text);`);
  await db.exec(definition(source('../migrations/20260727144012_align_dashboard_granular_rbac.sql'),
    'public.gestor_has_effective_financeiro_tab'));
  await db.exec(source('../migrations/20260728135603_harden_financeiro_polo_scoped_credor_options.sql'));
  await setting('polo', polo); await setting('role', 'authenticated'); await setting('module', true);
  await setting('uid', id(50));
  for (const [n, type, scope, scopes, status] of [
    [10, 'Aluno', polo, [], 'ATIVO'], [11, 'Aluno', otherPolo, [polo], 'ATIVO'],
    [12, 'PF', null, [], 'ATIVO'], [13, 'PJ', otherPolo, [], 'ATIVO'],
    [14, 'Aluno', polo, [], 'INATIVO'], [15, 'Outro', polo, [], 'ATIVO'],
  ]) await db.query('INSERT INTO public.parceiros(id,nome,tipo,polo_id,polo_ids,status) VALUES($1,$2,$3,$4,$5,$6)',
    [id(n), `Pagador sintético ${n}`, type, scope, scopes, status]);
  const metadata = async () => (await db.query(`SELECT oid,proowner,proacl,prosecdef,provolatile,proconfig
    FROM pg_proc WHERE oid='public.get_financeiro_credores_por_polo_secure(uuid)'::regprocedure`)).rows[0];
  const baseline = await metadata();
  await permissions({ financeiroTabs: [], tabs: { financeiro: ['outros-creditos'] } });
  await denied(() => list()); // Reproduce the production reader rejecting the granular-only permission.
  const migration = source('../migrations/20261013170400_other_credit_payer_effective_tab_scope.sql');
  assert.ok(migration.split('\n').length <= 500);
  await db.exec(migration);
  assert.deepEqual(await metadata(), baseline, 'OID, owner, ACL, security and volatility preserved');
  assert.deepEqual((await list()).map(row => row.id), [10, 11, 12].map(id));
  await permissions({ financeiroTabs: ['outros-creditos'], tabs: { financeiro: ['resumo'] } });
  await denied(() => list()); // Configured granular tabs override the legacy permission.
  await permissions({ financeiroTabs: ['outros-creditos'], tabs: { financeiro: [] } });
  assert.equal((await list()).length, 3, 'Empty granular configuration retains legacy compatibility');
  for (const tab of ['despesas', 'outros-debitos', 'outros-creditos']) {
    await permissions({ financeiroTabs: [], tabs: { financeiro: [tab] } });
    assert.equal((await list()).length, 3, tab);
  }
  await permissions({}); await denied(() => list());
  await permissions({ financeiroTabs: null, tabs: { financeiro: null } }); await denied(() => list());
  await setting('role', ''); await denied(() => list()); // NULL role cannot bypass denied tab guards.
  await permissions({ financeiroTabs: [], tabs: { financeiro: ['outros-creditos'] } });
  await setting('uid', ''); await denied(() => list()); // NULL identity remains unauthorized even with a tab.
  await setting('role', 'authenticated'); await denied(() => list());
  await setting('uid', id(50)); await setting('scope_null', 'true'); await denied(() => list());
  await setting('scope_null', 'false');
  await denied(() => list(otherPolo)); await denied(() => list(null));
  await setting('module', false); await denied(() => list()); await setting('module', true);
  await db.exec('SET ROLE anon'); await denied(() => list()); await db.exec('RESET ROLE');
  await db.exec('SET ROLE authenticated'); assert.equal((await list()).length, 3); await db.exec('RESET ROLE');
  await setting('role', 'service_role');
  await setting('uid', ''); await permissions({});
  assert.deepEqual((await list(otherPolo)).map(row => row.id), [11, 12, 13].map(id), 'Existing service-role scope preserved');
  await denied(() => list(null)); // Explicit service role still requires a concrete polo.
  assert.equal((await db.query('SELECT count(*)::integer count FROM public.parceiros')).rows[0].count, 6);
  console.log('PASS scoped payer reader: granular-only permission, configured precedence, legacy compatibility, three consumer tabs, exact status/type/polo filters, ACL and metadata.');
} finally { await db.close(); }
