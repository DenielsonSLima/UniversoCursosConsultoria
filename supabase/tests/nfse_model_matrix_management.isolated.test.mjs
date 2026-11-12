import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const body = (source, name) => {
  const start = source.search(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION ${name.replaceAll('.', '\\.')}\\(`));
  assert(start >= 0, name);
  return source.slice(start, source.indexOf('$function$;', source.indexOf('AS $function$', start)) + 12);
};
const denied = (promise, code = '42501') => assert.rejects(promise, error => error.code === code);
test('only the active company matrix manages emission models, with authorized historical replays', async t => {
  const db = new PGlite();
  const definition = { name: 'MODELO SINTÉTICO', active: true, nationalServiceCode: '080201', nbsCode: '122020000',
    operationIndicatorCode: '', serviceDescription: 'SERVIÇO SINTÉTICO', issTreatment: 'TRIBUTAVEL', immunityType: null,
    technicalResponsibilityDocument: '', referenceDocument: '', complementaryInfo: '', orderReference: '' };
  const save = async (polo, request, modelId = null, version = null, value = definition, environment = 'PRODUCAO', context = id(10)) =>
    (await db.query('SELECT public.save_nfse_model_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
      [context, id(polo), environment, '2026-11', id(request), modelId, version, value])).rows[0].value;
  const mutate = async (polo, request, action, modelId, version) =>
    (await db.query('SELECT public.mutate_nfse_model_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
      [id(10), id(polo), 'PRODUCAO', '2026-11', id(request), action, modelId, version])).rows[0].value;
  const read = async (name, polo, environment = 'PRODUCAO') =>
    (await db.query(`SELECT public.${name}($1,$2,$3,$4) value`, [id(10), id(polo), environment, '2026-11'])).rows[0].value;
  let matrix, legacyBranch;
  try {
    await db.exec(`CREATE SCHEMA private; CREATE SCHEMA auth;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE TABLE public.polos(id uuid PRIMARY KEY,company_id uuid,nome text,is_matriz boolean,status text);
      CREATE TABLE public.test_access(actor_id uuid,context_id uuid,polo_id uuid);
      CREATE TABLE public.parceiros(id uuid PRIMARY KEY);
      CREATE TABLE public.catalogo_paises_nacionalidades(codigo_iso3 text);
      CREATE TABLE public.catalogo_municipios_ibge(codigo_ibge bigint);
      CREATE TABLE private.nfse_service_code_catalog(kind text,code text);
      INSERT INTO private.nfse_service_code_catalog VALUES('NATIONAL','080201'),('NBS','122020000');
      CREATE TABLE private.nfse_models(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),polo_id uuid,environment text,
        definition jsonb,version integer DEFAULT 1,created_by uuid,updated_by uuid,
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE private.nfse_model_requests(actor_id uuid,request_id uuid,context_id uuid,polo_id uuid,
        environment text,payload jsonb,response jsonb,PRIMARY KEY(actor_id,request_id));
      CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1='ativo'$$;
      CREATE FUNCTION private.nfse_preset_partner_ids(jsonb) RETURNS TABLE(partner_id uuid)
        LANGUAGE sql IMMUTABLE AS $$SELECT NULL::uuid WHERE false$$;
      CREATE FUNCTION private.nfse_model_partner_label(uuid,uuid) RETURNS text LANGUAGE sql STABLE AS $$SELECT NULL::text$$;
      CREATE FUNCTION private.nfse_model_service_option_labels(jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$SELECT $1$$;
      CREATE FUNCTION private.nfse_model_people_option_labels(jsonb,uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$SELECT $1$$;
      CREATE FUNCTION private.nfse_model_extended_option_labels(jsonb,uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$SELECT $1$$;
      CREATE FUNCTION private.authorize_nfse_model_scope(p_context_key uuid,p_polo_id uuid,p_environment text,p_month text)
        RETURNS void LANGUAGE plpgsql AS $$BEGIN
          IF auth.uid() IS NULL OR p_environment NOT IN('PRODUCAO','HOMOLOGACAO') OR p_month IS DISTINCT FROM '2026-11'
            OR NOT EXISTS(SELECT 1 FROM public.test_access WHERE actor_id=auth.uid() AND context_id=p_context_key AND polo_id=p_polo_id)
            THEN RAISE EXCEPTION 'Scope denied' USING ERRCODE='42501'; END IF;
        END$$;
      CREATE FUNCTION public.get_nfse_workspace_secure(p_context_key uuid,p_polo_id uuid,p_environment text,p_month text)
        RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$BEGIN
          PERFORM private.authorize_nfse_model_scope(p_context_key,p_polo_id,p_environment,p_month);
          RETURN jsonb_build_object('version',1,'data',jsonb_build_object('capabilities',jsonb_build_object(
            'manageModels',true,'prepare',true),'summary',jsonb_build_object('pendingCount',18,'issuedCount',3)));
        END$$;`);
    for (const [n, matrixFlag, company] of [[1, true, 100], [2, false, 100], [3, true, 200], [4, false, 200]]) {
      await db.query("INSERT INTO public.polos VALUES($1,$2,$3,$4,'ativo')", [id(n), id(company), `POLO ${n}`, matrixFlag]);
    }
    for (const polo of [1, 2]) await db.query('INSERT INTO public.test_access VALUES($1,$2,$3)', [id(11), id(10), id(polo)]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(11)]);
    const scopeSource = await sql('20261111121000_nfse_shared_model_scope.sql');
    for (const name of ['private.nfse_model_visible_to_polo', 'private.nfse_model_projection', 'public.get_nfse_models_secure']) {
      await db.exec(body(scopeSource, name));
    }
    await db.exec(body(await sql('20261110223456_nfse_model_operation_presets_save.sql'), 'public.save_nfse_model_secure'));
    await db.exec(body(await sql('20261111121003_nfse_shared_model_mutation.sql'), 'public.mutate_nfse_model_secure'));
    matrix = await save(1, 20);
    legacyBranch = await save(2, 21, null, null, { ...definition, name: 'LEGADO FILIAL' });
    const migration = await sql('20261112013503_nfse_model_matrix_management.sql');
    assert(migration.split('\n').length <= 500);
    await db.exec(migration);
    await t.test('matrix keeps create/edit/clone/deactivate and the original replay result', async () => {
      assert.deepEqual(await save(1, 20), matrix);
      const edited = await save(1, 22, matrix.data.id, 1, { ...definition, name: 'MODELO REVISADO' });
      assert.equal(edited.data.version, 2);
      const clone = await mutate(1, 23, 'CLONE', matrix.data.id, 2);
      assert.equal(clone.data.version, 1);
      assert.deepEqual(await mutate(1, 23, 'CLONE', matrix.data.id, 2), clone);
      const inactive = await mutate(1, 24, 'DEACTIVATE', clone.data.id, 1);
      assert.equal(inactive.data.version, 2);
      await denied(mutate(1, 25, 'DEACTIVATE', matrix.data.id, 1), '40001');
      assert.deepEqual(await save(1, 20), matrix, 'historical save does not rewrite the model');
    });
    await t.test('branch is denied before replay, create, edit, clone and deactivate; no data changes', async () => {
      const before = (await db.query('SELECT (SELECT count(*) FROM private.nfse_models)::int models,(SELECT count(*) FROM private.nfse_model_requests)::int requests')).rows;
      await denied(save(2, 21, null, null, { ...definition, name: 'LEGADO FILIAL' }));
      await denied(save(2, 30));
      await denied(save(2, 31, legacyBranch.data.id, 1, { ...definition, active: false }));
      await denied(mutate(2, 32, 'CLONE', matrix.data.id, 2));
      await denied(mutate(2, 33, 'DEACTIVATE', legacyBranch.data.id, 1));
      assert.deepEqual((await db.query('SELECT (SELECT count(*) FROM private.nfse_models)::int models,(SELECT count(*) FROM private.nfse_model_requests)::int requests')).rows, before);
    });
    await t.test('shared list preserves the exact model/version while branch management stays false', async () => {
      const branch = (await read('get_nfse_models_secure', 2)).data;
      const inherited = branch.rows.find(row => row.id === matrix.data.id);
      assert.equal(branch.canManage, false); assert.equal(inherited.version, 2);
      assert.equal(branch.rows.some(row => row.id === legacyBranch.data.id), false, 'Legacy branch models remain outside the shared list');
      assert.equal((await db.query('SELECT count(*)::int count FROM private.nfse_models WHERE id=$1', [legacyBranch.data.id])).rows[0].count, 1);
      assert.equal(inherited.sourcePoloId, id(1)); assert.equal(inherited.inherited, true);
      assert(branch.rows.every(row => row.canManage === false));
      const origin = (await read('get_nfse_models_secure', 1)).data;
      assert.equal(origin.canManage, true); assert(origin.rows.every(row => row.canManage === true));
      assert.deepEqual((await read('get_nfse_models_secure', 1, 'HOMOLOGACAO')).data.rows, []);
      assert.equal((await read('get_nfse_models_secure', 1, 'HOMOLOGACAO')).data.canManage, true);
      assert.equal((await read('get_nfse_models_secure', 2, 'HOMOLOGACAO')).data.canManage, false);
    });
    await t.test('workspace changes only model management; authorization applies to reads and historical replay', async () => {
      const original = (await read('get_nfse_workspace_secure', 1)).data;
      const branch = (await read('get_nfse_workspace_secure', 2)).data;
      assert.deepEqual(branch.summary, original.summary); assert.equal(branch.capabilities.prepare, true);
      assert.equal(branch.capabilities.manageModels, false); assert.equal(original.capabilities.manageModels, true);
      await denied(save(1, 20, null, null, definition, 'PRODUCAO', id(99)));
      await denied(read('get_nfse_models_secure', 3)); await denied(read('get_nfse_models_secure', 1, 'INVALID'));
      await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
      await denied(save(1, 20)); await denied(read('get_nfse_workspace_secure', 1));
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(11)]);
    });
    await t.test('inactive or ambiguous company matrices cannot manage', async () => {
      await db.query("UPDATE public.polos SET status='inativo' WHERE id=$1", [id(1)]);
      await denied(save(1, 20)); assert.equal((await read('get_nfse_models_secure', 1)).data.canManage, false);
      assert.deepEqual((await read('get_nfse_models_secure', 2)).data.rows, [], 'Inactive central origin is not shared');
      await db.query("UPDATE public.polos SET status='ativo' WHERE id=$1", [id(1)]);
      await db.query("INSERT INTO public.polos VALUES($1,$2,'MATRIZ AMBÍGUA',true,'ativo')", [id(5), id(100)]);
      await denied(save(1, 20)); await db.query('DELETE FROM public.polos WHERE id=$1', [id(5)]);
    });
    await t.test('only authenticated wrappers are exposed; cores and helpers cannot bypass the new guard', async () => {
      for (const signature of ['save_nfse_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb)',
        'mutate_nfse_model_secure(uuid,uuid,text,text,uuid,text,uuid,integer)', 'get_nfse_models_secure(uuid,uuid,text,text)',
        'get_nfse_workspace_secure(uuid,uuid,text,text)']) {
        const grants = (await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') app,has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('service_role',$1,'EXECUTE') service", [`public.${signature}`])).rows[0];
        assert.deepEqual(grants, { app: true, anon: false, service: false });
      }
      for (const signature of ['public.save_nfse_model_core_20261112(uuid,uuid,text,text,uuid,uuid,integer,jsonb)',
        'public.mutate_nfse_model_core_20261112(uuid,uuid,text,text,uuid,text,uuid,integer)',
        'public.get_nfse_workspace_core_20261112(uuid,uuid,text,text)', 'private.nfse_model_management_allowed(uuid)',
        'private.authorize_nfse_model_management_scope(uuid,uuid,text,text)']) {
        assert.equal((await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') value", [signature])).rows[0].value, false);
      }
    });
  } finally { await db.close(); }
});
