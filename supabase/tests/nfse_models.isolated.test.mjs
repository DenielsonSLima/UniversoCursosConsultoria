import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migrations = await Promise.all(['20261108225453_nfse_models_private_store.sql','20261108225459_nfse_models_save_rpc.sql']
  .map(name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')));
const id = value => `00000000-0000-0000-0000-${String(value).padStart(12,'0')}`;
const definition = { name:'Modelo sintético', nationalServiceCode:'080102', nbsCode:'122040000',
  operationIndicatorCode:'', serviceDescription:'Serviço de teste', issTreatment:'TRIBUTAVEL', immunityType:null,
  technicalResponsibilityDocument:'', referenceDocument:'', complementaryInfo:'', orderReference:'', active:true };

test('NFS-e models persist service metadata without enabling fiscal operations', async t => {
  const db = new PGlite();
  const scope = { context:id(10),polo:id(1),environment:'HOMOLOGACAO',month:'2026-11' };
  const read = async (params={}) => (await db.query('SELECT public.get_nfse_models_secure($1,$2,$3,$4) value',
    Object.values({...scope,...params}))).rows[0].value;
  const save = async (params={}) => (await db.query('SELECT public.save_nfse_model_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
    Object.values({...scope,request:id(50),model:null,expected:null,definition,...params}))).rows[0].value;
  let created;
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
      CREATE TABLE public.test_context(id uuid PRIMARY KEY, actor uuid, allowed boolean, all_polos boolean, polos uuid[]);
      INSERT INTO public.test_context VALUES ('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      CREATE FUNCTION public.get_nfse_access_secure(uuid) RETURNS boolean LANGUAGE sql STABLE AS
        $$SELECT EXISTS(SELECT 1 FROM public.test_context WHERE id=$1 AND actor=auth.uid() AND allowed)$$;
      CREATE FUNCTION public.portal_listar_perfis() RETURNS TABLE(role text,"contextId" uuid,"allPolos" boolean,"poloIds" uuid[])
        LANGUAGE sql STABLE AS $$SELECT 'GESTOR',id,all_polos,polos FROM public.test_context WHERE actor=auth.uid()$$;
      CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT lower($1)='ativo'$$;
      CREATE TABLE public.polos(id uuid PRIMARY KEY,status text);
      INSERT INTO public.polos VALUES ('${id(1)}','ativo'),('${id(2)}','ativo'),('${id(3)}','inativo');
      SET test.actor='${id(11)}';
    `);
    for (const migration of migrations) await db.exec(migration);
    await t.test('creates and reads every explicit field in an authorized scope',async()=>{
      created = await save(); assert.equal(created.data.version,1);
      assert.equal((await read()).data.rows.length,1);
      assert.deepEqual((await read()).data.rows[0],{...definition,id:created.data.id,version:1});
      assert.equal((await read({environment:'PRODUCAO'})).data.rows.length,0);
      assert.equal((await read({month:'2026-10'})).data.rows.length,1);
    });
    await t.test('immutable request replay returns same result; changed payload is rejected',async()=>{
      assert.deepEqual(await save(),created);
      await assert.rejects(save({definition:{...definition,name:'Outro'}}),err=>err.code==='22023');
      await assert.rejects(save({month:'2026-10'}),err=>err.code==='22023');
      assert.equal((await db.query('SELECT count(*)::integer n FROM private.nfse_model_requests')).rows[0].n,1);
    });
    await t.test('updates require same polo, environment and current version',async()=>{
      await assert.rejects(save({request:id(51),model:created.data.id,expected:1,environment:'PRODUCAO'}),err=>err.code==='40001');
      const changed={...definition,active:false,issTreatment:'IMUNIDADE',immunityType:'3',
        technicalResponsibilityDocument:'ART exemplo',referenceDocument:'Contrato exemplo',
        complementaryInfo:'Informação de teste',orderReference:'Pedido exemplo'};
      const updated=await save({request:id(52),model:created.data.id,expected:1,definition:changed});
      assert.equal(updated.data.version,2);
      assert.deepEqual((await read()).data.rows[0],{...changed,id:created.data.id,version:2});
      await assert.rejects(save({request:id(53),model:created.data.id,expected:1}),err=>err.code==='40001');
      assert.equal((await db.query('SELECT count(*)::integer n FROM private.nfse_model_requests')).rows[0].n,2);
    });
    await t.test('denies foreign context/polo, revoked pilot and session before replay',async()=>{
      for (const params of [{context:id(99)},{polo:id(2)},{polo:null}]) {
        await assert.rejects(read(params),err=>err.code==='42501');
        await assert.rejects(save(params),err=>err.code==='42501');
      }
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(save(),err=>err.code==='42501');
      await db.exec(`UPDATE public.test_context SET allowed=true; SET test.actor='${id(99)}'`);
      await assert.rejects(save(),err=>err.code==='42501');
      await db.exec("SET test.actor=''"); await assert.rejects(read(),err=>err.code==='42501');
      await db.exec(`SET test.actor='${id(11)}'; UPDATE public.test_context SET all_polos=true`);
      assert.equal((await read({polo:id(2)})).data.rows.length,0);
      await assert.rejects(read({polo:id(3)}),err=>err.code==='42501');
    });
    await t.test('rejects malformed codes, sizes, immunity contradictions and unknown fields',async()=>{
      for (const change of [{nationalServiceCode:'8.01'},{nbsCode:'122'},{operationIndicatorCode:'12'},
        {issTreatment:''},{issTreatment:null},{immunityType:'1'},{issTreatment:'IMUNIDADE'},
        {issTreatment:'IMUNIDADE',immunityType:'0'},{active:'true'},{serviceDescription:'x'.repeat(1001)},
        {technicalResponsibilityDocument:'x'.repeat(41)},{referenceDocument:'x'.repeat(256)},
        {complementaryInfo:'x'.repeat(2001)},{orderReference:'x'.repeat(61)},{name:' '},{unknown:true}]) {
        await assert.rejects(save({request:id(70),definition:{...definition,...change}}),err=>err.code==='22023');
      }
      for (const params of [{request:null},{model:created.data.id},{expected:1},{month:'2026-13'},
        {month:null},{environment:null},{definition:null},{definition:[]}]) {
        await assert.rejects(save(params),err=>err.code==='22023');
      }
    });
    await t.test('authenticated RPC only; private models and audit cannot be accessed directly',async()=>{
      const signatures=['public.get_nfse_models_secure(uuid,uuid,text,text)',
        'public.save_nfse_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb)'];
      for(const signature of signatures) {
        const grants=(await db.query(`SELECT has_function_privilege('authenticated',$1,'EXECUTE') authenticated,
          has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('service_role',$1,'EXECUTE') service_role`,[signature])).rows[0];
        assert.deepEqual(grants,{authenticated:true,anon:false,service_role:false});
      }
      await db.exec('SET ROLE authenticated'); assert.equal((await read()).data.rows.length,1);
      await assert.rejects(db.query('SELECT * FROM private.nfse_models'),err=>err.code==='42501');
      await assert.rejects(db.query('SELECT * FROM private.nfse_model_requests'),err=>err.code==='42501');
      await db.exec('RESET ROLE');
      const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='private' ORDER BY tablename")).rows;
      assert.deepEqual(tables.map(row=>row.tablename),['nfse_model_requests','nfse_models']);
    });
  } finally { await db.close(); }
});
