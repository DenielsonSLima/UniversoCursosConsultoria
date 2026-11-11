import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Supply an installed PGlite module path. No remote database or credentials.
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE || process.argv[2];
if (!modulePath) throw new Error('Usage: node nfse-shared-models.isolated.test.mjs /path/to/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)));
const db = new PGlite();
const migrationsDir = new URL('../migrations/', import.meta.url);
const files = readdirSync(migrationsDir).filter(n => n.startsWith('202611111210'));
const migrations = files.map(n => readFileSync(new URL(n, migrationsDir), 'utf8'));
assert.equal(files.length, 4);
for (let i = 0; i < files.length; i++) {
  assert.ok(migrations[i].split('\n').length <= 500, files[i]);
  assert.ok(!/\$function\$\s*\n\s*(CREATE|NOTIFY)/.test(migrations[i]), 'Missing SQL terminator');
}
await db.exec(`
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.empresas(id uuid PRIMARY KEY,nome_fantasia text,razao_social text,cnpj text);
CREATE TABLE public.polos(id uuid PRIMARY KEY,company_id uuid REFERENCES public.empresas(id),nome text,
 cnpj text,cidade text,estado text,is_matriz boolean,status text);
CREATE TABLE public.parceiros(id uuid PRIMARY KEY);
CREATE TABLE private.nfse_models(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),polo_id uuid,environment text,
 definition jsonb,version integer DEFAULT 1,created_by uuid,updated_by uuid,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE private.nfse_model_requests(actor_id uuid,request_id uuid,context_id uuid,polo_id uuid,
 environment text,payload jsonb,response jsonb,PRIMARY KEY(actor_id,request_id));
CREATE TABLE public.nfse_change_events(polo_id uuid,environment text,month text,resource text);
CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT $1='ativo' $$;
CREATE FUNCTION private.nfse_preset_partner_ids(jsonb) RETURNS TABLE(partner_id uuid)
 LANGUAGE sql IMMUTABLE AS $$ SELECT ($1#>>'{peopleOptions,destinationPartnerId}')::uuid
 WHERE $1#>>'{peopleOptions,destinationPartnerId}' IS NOT NULL $$;
CREATE FUNCTION private.nfse_model_partner_label(uuid,uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
CREATE FUNCTION private.nfse_model_service_option_labels(jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
CREATE FUNCTION private.nfse_model_people_option_labels(jsonb,uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
CREATE FUNCTION private.nfse_model_extended_option_labels(jsonb,uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
CREATE FUNCTION private.authorize_nfse_model_scope(p_context_key uuid,p_polo_id uuid,p_environment text,p_month text)
 RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'No test identity' USING ERRCODE='42501'; END $$;
`);
// PL/pgSQL compiles all replacement bodies against rowtypes. Consumers are not
// executed here: fiscal fixtures belong to their full integration suite.
const known = new Set(['private.nfse_models','private.nfse_model_requests','public.parceiros']);
for (const sql of migrations) {
  for (const [, table] of sql.matchAll(/([a-z_]+\.[a-z_]+)%ROWTYPE/g)) {
    if (!known.has(table)) {
      await db.exec(`CREATE TABLE ${table}(id uuid)`);
      known.add(table);
    }
  }
}
for (let i=0;i<migrations.length;i++) {
  await db.exec(migrations[i]);
  console.log(`Compiled ${files[i]}`);
}
const grants = await db.query(`SELECT
 has_function_privilege('anon','public.mutate_nfse_model_secure(uuid,uuid,text,text,uuid,text,uuid,integer)','EXECUTE') AS anonymous,
 has_function_privilege('authenticated','public.mutate_nfse_model_secure(uuid,uuid,text,text,uuid,text,uuid,integer)','EXECUTE') AS authenticated,
 has_function_privilege('authenticated','private.nfse_model_visible_to_polo(uuid,uuid,jsonb)','EXECUTE') AS helper`);
assert.deepEqual(grants.rows[0], { anonymous: false, authenticated: true, helper: false });
await db.exec(`CREATE TRIGGER test_model_changes AFTER INSERT OR UPDATE OR DELETE ON private.nfse_models
 FOR EACH ROW EXECUTE FUNCTION private.publish_nfse_resource_change()`);
const suite = readFileSync(new URL('./nfse_shared_models_rollback.sql',import.meta.url),'utf8');
await db.exec(suite);
const remaining = await db.query('SELECT count(*)::integer AS count FROM private.nfse_models');
assert.equal(remaining.rows[0].count,0,'Fixture must roll back');
console.log('PASS: scope isolation, fixed participant exclusion, realtime isolation, anonymous rejection, clone/replay, request collision, owner-only deactivation, stale version, complex clone, immutable snapshots, replay after source edits, authorization recheck and audit rollback.');
await db.close();
