import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath=process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite }=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'@electric-sql/pglite');
const migrations=await Promise.all(['20261108225453_nfse_models_private_store.sql',
  '20261109015954_nfse_configuration_store.sql','20261109020010_nfse_configuration_rpc.sql']
  .map(name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8')));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const definition={municipalityCode:'2802908',municipalRegistration:'',portalAccess:'CERTIFICATE',
  credentialSource:'MATRIZ',opSimpNac:'1',regEspTrib:'0',regApTribSN:null};

test('fiscal configuration preserves matrix governance and never claims certificate readiness',async t=>{
  const db=new PGlite();
  const scope={context:id(10),polo:id(2),environment:'HOMOLOGACAO',month:'2026-11'};
  const read=async(params={})=>(await db.query('SELECT public.get_nfse_configuration_secure($1,$2,$3,$4) value',
    Object.values({...scope,...params}))).rows[0].value;
  const save=async(params={})=>(await db.query('SELECT public.save_nfse_configuration_secure($1,$2,$3,$4,$5,$6,$7) value',
    Object.values({...scope,request:id(50),expected:0,definition,...params}))).rows[0].value;
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
      CREATE TABLE public.test_context(id uuid,actor uuid,allowed boolean,all_polos boolean,polos uuid[]);
      INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,true,ARRAY[]::uuid[]);
      CREATE FUNCTION public.get_nfse_access_secure(uuid) RETURNS boolean LANGUAGE sql STABLE AS
        $$SELECT EXISTS(SELECT 1 FROM public.test_context WHERE id=$1 AND actor=auth.uid() AND allowed)$$;
      CREATE FUNCTION public.portal_listar_perfis() RETURNS TABLE(role text,"contextId" uuid,"allPolos" boolean,"poloIds" uuid[])
        LANGUAGE sql STABLE AS $$SELECT 'GESTOR',id,all_polos,polos FROM public.test_context WHERE actor=auth.uid()$$;
      CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT lower($1)='ativo'$$;
      CREATE TABLE public.perfis_acesso(id uuid,permissoes jsonb);
      CREATE TABLE public.usuarios_sistema(id uuid,auth_user_id uuid,perfil_acesso_id uuid,personalizar_permissoes boolean,permissoes jsonb);
      INSERT INTO public.usuarios_sistema VALUES('${id(10)}','${id(11)}',null,false,'{"modules":["configuracoes","emissor-nfse"]}');
      CREATE TABLE public.polos(id uuid PRIMARY KEY,status text,company_id uuid,is_matriz boolean,cnpj text);
      INSERT INTO public.polos VALUES
        ('${id(1)}','ativo','${id(20)}',true,'00000000000100'),
        ('${id(2)}','ativo','${id(20)}',false,'00000000000200'),
        ('${id(3)}','ativo','${id(20)}',false,'99999999000100'),
        ('${id(4)}','ativo','${id(21)}',false,'00000000000400');
      SET test.actor='${id(11)}';
    `);
    for (const migration of migrations) await db.exec(migration);
    await t.test('unconfigured is explicit; saved metadata stays blocked and secret-free',async()=>{
      const initial=(await read()).data;
      assert.equal(initial.configured,false); assert.equal(initial.version,null);
      const saved=await save(); assert.equal(saved.data.version,1);
      const data=(await read()).data;
      assert.equal(data.configured,true); assert.equal(data.readiness.status,'BLOCKED');
      assert.equal(data.certificate.configured,false); assert.equal(data.portalLoginConfigured,false);
      assert.equal(data.opSimpNac,'1'); assert.equal(data.regEspTrib,'0');
      assert.equal('credential_polo_id' in data,false); assert.equal('secret' in data,false);
      assert.equal((await db.query('SELECT credential_polo_id value FROM private.nfse_configurations')).rows[0].value,id(1));
      assert.equal((await read({environment:'PRODUCAO'})).data.configured,false);
      assert.deepEqual(await save(),saved);
    });
    await t.test('immutable replay, optimistic revisions and environment isolation',async()=>{
      await assert.rejects(save({definition:{...definition,municipalRegistration:'changed'}}),e=>e.code==='22023');
      await assert.rejects(save({request:id(51)}),e=>e.code==='40001');
      await save({request:id(52),expected:1,definition:{...definition,opSimpNac:'3',regApTribSN:'2'}});
      assert.equal((await read()).data.version,2);
      assert.equal((await read()).data.regApTribSN,'2');
      assert.equal((await read({environment:'PRODUCAO'})).data.version,null);
      await save({request:id(53),expected:2,definition:{...definition,opSimpNac:'3',regEspTrib:'9'}});
      assert.equal((await read()).data.regApTribSN,null);
      assert.equal((await read()).data.regEspTrib,'9');
    });
    await t.test('authorization precedes replay and matrix is checked on the server',async()=>{
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(save(),e=>e.code==='42501');
      await db.exec(`UPDATE public.test_context SET allowed=true,all_polos=false,polos=ARRAY['${id(2)}'::uuid]`);
      await assert.rejects(read(),e=>e.code==='42501');
      await db.exec(`UPDATE public.test_context SET all_polos=true; UPDATE public.usuarios_sistema SET permissoes='{"modules":["emissor-nfse"]}'`);
      await assert.rejects(read(),e=>e.code==='42501');
      await db.exec(`UPDATE public.usuarios_sistema SET permissoes='{"modules":["emissor-nfse","configuracoes"]}'; SET test.actor=''`);
      await assert.rejects(read(),e=>e.code==='42501');
      await db.exec(`SET test.actor='${id(11)}'`);
    });
    await t.test('denies cross-root reuse and never guesses another company matrix',async()=>{
      await assert.rejects(save({polo:id(3),request:id(60)}),e=>e.code==='22023');
      await assert.rejects(read({polo:id(4)}),e=>e.code==='22023');
      await save({polo:id(3),request:id(61),definition:{...definition,credentialSource:'PROPRIO'}});
      assert.equal((await db.query('SELECT credential_polo_id value FROM private.nfse_configurations WHERE polo_id=$1',[id(3)])).rows[0].value,id(3));
    });
    await t.test('rejects secret payloads, invalid regime and contradictory Simples values',async()=>{
      for (const change of [{pfx:'never'},{password:'never'},{secretId:id(99)},{municipalityCode:'9900000'},
        {municipalityCode:'0000000'},{municipalRegistration:'x'.repeat(16)},{municipalRegistration:'bad\nIM'},
        {opSimpNac:'4'},{regEspTrib:'7'},{regApTribSN:'1'},
        {opSimpNac:'3',regApTribSN:'4'},{portalAccess:'OTHER'},{credentialSource:'OTHER'}]) {
        await assert.rejects(save({request:id(70),expected:2,definition:{...definition,...change}}),e=>e.code==='22023');
      }
    });
    await t.test('public roles have no direct storage or helper access',async()=>{
      const result=await db.query(`SELECT has_table_privilege('authenticated','private.nfse_configurations','SELECT') allowed,
        has_function_privilege('anon','public.get_nfse_configuration_secure(uuid,uuid,text,text)','EXECUTE') anonymous,
        has_function_privilege('service_role','private.nfse_configuration_metadata(uuid,text)','EXECUTE') helper`);
      assert.deepEqual(result.rows[0],{allowed:false,anonymous:false,helper:false});
    });
  } finally {await db.close();}
});
