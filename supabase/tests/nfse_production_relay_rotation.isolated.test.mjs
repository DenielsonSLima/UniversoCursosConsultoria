import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const migration=await readFile(new URL('../migrations/20261111022939_nfse_production_relay_numeric_event_url.sql',import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const oldUrl='https://universo-cursos-consultoria-6w67gc985-denielson-limas-projects.vercel.app/api/nfse-production-relay';
const newUrl='https://universo-cursos-consultoria-qsnk8l1zn-denielson-limas-projects.vercel.app/api/nfse-production-relay';
test('relay URL rotation preserves server credentials and scoped minimum grants',async t=>{
 const db=new PGlite();const original={url:oldUrl,key:'11'.repeat(32),protectionBypass:'SYNTHETIC_BYPASS'};
 const value=async(query,args=[])=>(await db.query(query,args)).rows[0].value;
 const call=(actor=id(11),polo=id(1),env='PRODUCAO',context=id(10))=>value('SELECT public.get_nfse_production_relay_config_internal($1,$2,$3,$4,$5) value',
  [actor,context,polo,env,'2026-11']);
 const deny=(p,code='42501')=>assert.rejects(p,e=>e.code===code);
 try{
  await db.exec(await readFile(new URL('./nfse_individual_production.fixture.sql',import.meta.url),'utf8'));
  await db.exec(`CREATE FUNCTION vault.update_secret(uuid,text) RETURNS void LANGUAGE sql AS $$
    UPDATE vault.decrypted_secrets SET decrypted_secret=$2 WHERE id=$1$$;
    INSERT INTO public.test_authorization VALUES('${id(11)}','${id(10)}','${id(1)}',true);
    SET request.jwt.claim.sub='${id(11)}';SET request.jwt.claims='{"role":"service_role"}';`);
  await db.query('INSERT INTO vault.decrypted_secrets VALUES($1,$2,$3)',[id(80),'nfse_production_relay_config',JSON.stringify(original)]);
  await db.exec(migration);
  await t.test('only URL changes and repeated application keeps the same key/bypass',async()=>{
   const expected={...original,url:newUrl};assert.deepEqual(await call(),expected);
   assert.deepEqual(JSON.parse(await value('SELECT decrypted_secret value FROM vault.decrypted_secrets WHERE id=$1',[id(80)])),expected);
   await db.exec(migration);assert.deepEqual(await call(),expected);
  });
  await t.test('browser roles, wrong scope, nonmatrix, other environment and revoked actor are denied',async()=>{
   await db.exec("SET request.jwt.claims='{}'");await deny(call());
   await db.exec(`SET request.jwt.claims='{"role":"service_role"}'`);
   await deny(call(id(99)));await deny(call(id(11),id(2)));await deny(call(id(11),id(1),'HOMOLOGACAO'));
   await deny(call(id(11),id(1),'PRODUCAO',id(99)));
   await db.exec('UPDATE public.test_authorization SET allowed=false');await deny(call());
   await db.exec('UPDATE public.test_authorization SET allowed=true');
   const signature='public.get_nfse_production_relay_config_internal(uuid,uuid,uuid,text,text)';
   for(const role of ['anon','authenticated','service_role'])assert.equal(await value(`SELECT has_function_privilege('${role}','${signature}','EXECUTE') value`),role==='service_role');
  });
  await t.test('getter rejects unreviewed exact URL and migration fails closed without changing credentials',async()=>{
   const other={...original,url:oldUrl.replace('6w67gc985','unreviewed')};
   await db.query('UPDATE vault.decrypted_secrets SET decrypted_secret=$1',[JSON.stringify(other)]);
   await deny(call(),'22023');await deny(db.exec(migration),'22023');
   // The migration transaction rolls back; no URL/key fallback is silently chosen.
   await db.exec('ROLLBACK');
   assert.deepEqual(JSON.parse(await value('SELECT decrypted_secret value FROM vault.decrypted_secrets WHERE id=$1',[id(80)])),other);
  });
 }finally{await db.close();}
});
