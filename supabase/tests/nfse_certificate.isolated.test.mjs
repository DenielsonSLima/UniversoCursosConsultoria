import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath=process.env.NFSE_TEST_PGLITE_MODULE;
const {PGlite}=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'@electric-sql/pglite');
const migrations=await Promise.all(['20261108225453_nfse_models_private_store.sql',
  '20261109015954_nfse_configuration_store.sql','20261109020010_nfse_configuration_rpc.sql',
  '20261109020012_nfse_certificate_store.sql','20261109020015_nfse_certificate_metadata.sql']
  .map(name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8')));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const definition={municipalityCode:'2802908',municipalRegistration:'',portalAccess:'CERTIFICATE',
  credentialSource:'MATRIZ',opSimpNac:'1',regEspTrib:'0',regApTribSN:null};
// Syntactic sentinels only: real PKCS12/key parsing is exercised in the Edge tests.
const material={privateKeyPem:'-----BEGIN RSA PRIVATE KEY-----\nsynthetic sentinel',
  certificatePem:'-----BEGIN CERTIFICATE-----\nsynthetic sentinel',chainPem:''};
const metadata={fingerprint:'a'.repeat(64),cnpj:'00000000000100',chainVerified:true,revocationStatus:'UNKNOWN',
  representationVerified:false,notBefore:new Date(Date.now()-60000).toISOString(),
  expiresAt:new Date(Date.now()+86400000).toISOString()};

test('A1 storage isolates Vault, reauthorizes service writes and exposes metadata only',async t=>{
  const db=new PGlite();
  const scope={context:id(10),polo:id(2),environment:'HOMOLOGACAO',month:'2026-11'};
  const uploadScope=async()=>(await db.query('SELECT public.authorize_nfse_certificate_upload_secure($1,$2,$3,$4) value',Object.values(scope))).rows[0].value;
  const getter=async()=>(await db.query('SELECT public.get_nfse_configuration_secure($1,$2,$3,$4) value',Object.values(scope))).rows[0].value;
  const store=async(params={})=>(await db.query('SELECT public.store_nfse_certificate_internal($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    Object.values({actor:id(11),...scope,request:id(80),configVersion:1,metadata,material,...params}))).rows[0].value;
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('test.actor',true),''))::uuid$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
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
    // This local stub proves contract/permissions/atomicity, not Vault encryption itself.
    await db.exec(`CREATE SCHEMA vault;
      CREATE TABLE vault.test_secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),value text,name text);
      CREATE FUNCTION vault.create_secret(text,text,text) RETURNS uuid LANGUAGE sql AS
        $$INSERT INTO vault.test_secrets(value,name) VALUES($1,$2) RETURNING id$$;
      CREATE FUNCTION vault.update_secret(uuid,text) RETURNS void LANGUAGE sql AS
        $$UPDATE vault.test_secrets SET value=$2 WHERE id=$1$$;`);
    for (const migration of migrations) await db.exec(migration);
    await db.query('SELECT public.save_nfse_configuration_secure($1,$2,$3,$4,$5,$6,$7)',
      [...Object.values(scope),id(50),0,definition]);
    await t.test('scope resolves central certificate owner, not arbitrary client-provided identity',async()=>{
      const authorized=await uploadScope();
      assert.equal(authorized.actorId,id(11)); assert.equal(authorized.credentialPoloId,id(1));
      assert.equal(authorized.cnpj,metadata.cnpj);
      assert.equal((await getter()).data.certificate.configured,false);
      await assert.rejects(store(),e=>e.code==='42501');
    });
    await t.test('only service writer persists parsed material in Vault and replay stays immutable',async()=>{
      await db.exec("SET request.jwt.claim.role='service_role'");
      const saved=await store(); assert.equal(saved.readiness,'BLOCKED');
      assert.equal(saved.representationVerified,false); assert.equal(saved.revocationStatus,'UNKNOWN');
      assert.deepEqual(await store(),saved);
      assert.equal((await db.query('SELECT count(*)::int n FROM vault.test_secrets')).rows[0].n,1);
      const audit=JSON.stringify((await db.query('SELECT payload,response FROM private.nfse_certificate_requests')).rows);
      assert.equal(/PRIVATE KEY|CERTIFICATE|synthetic sentinel|password|chainPem/.test(audit),false);
      await assert.rejects(store({metadata:{...metadata,fingerprint:'b'.repeat(64)}}),e=>e.code==='22023');
      const certificate=(await getter()).data.certificate;
      assert.equal(certificate.configured,true); assert.equal(certificate.subject,'Certificado A1 · CNPJ '+metadata.cnpj);
      assert.equal(JSON.stringify(certificate).includes('sentinel'),false);
      assert.equal((await getter()).data.readiness.status,'BLOCKED');
    });
    await t.test('rejects revoked actors, wrong certificate owner, stale config and expiration before Vault',async()=>{
      await db.exec('UPDATE public.test_context SET allowed=false');
      await assert.rejects(store(),e=>e.code==='42501');
      await db.exec('UPDATE public.test_context SET allowed=true');
      await assert.rejects(store({actor:id(99)}),e=>e.code==='42501');
      await assert.rejects(store({configVersion:99}),e=>e.code==='22023');
      await assert.rejects(store({metadata:{...metadata,cnpj:'00000000000200'}}),e=>e.code==='22023');
      await assert.rejects(store({metadata:{...metadata,expiresAt:new Date(Date.now()-1000).toISOString()}}),e=>e.code==='22023');
      assert.equal((await db.query('SELECT count(*)::int n FROM vault.test_secrets')).rows[0].n,1);
    });
    await t.test('rechecks root identity after cadastro changes and revokes direct helpers',async()=>{
      await db.query('UPDATE public.polos SET cnpj=$1 WHERE id=$2',['99999999000200',id(2)]);
      await assert.rejects(uploadScope(),e=>e.code==='22023');
      assert.equal((await getter()).data.certificate.configured,false);
      const privileges=(await db.query(`SELECT
        has_function_privilege('authenticated','public.store_nfse_certificate_internal(uuid,uuid,uuid,text,text,uuid,integer,jsonb,jsonb)','EXECUTE') writer,
        has_table_privilege('authenticated','private.nfse_certificates','SELECT') table_read,
        has_function_privilege('anon','public.authorize_nfse_certificate_upload_secure(uuid,uuid,text,text)','EXECUTE') anonymous`)).rows[0];
      assert.deepEqual(privileges,{writer:false,table_read:false,anonymous:false});
    });
  } finally {await db.close();}
});
