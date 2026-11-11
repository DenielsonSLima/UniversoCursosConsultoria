import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite }=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration=await readFile(new URL('../migrations/20261111015424_nfse_cancellation_models.sql',import.meta.url),'utf8');
const scope=[id(10),id(1),'PRODUCAO','2026-11'];
const definition={category:'VALOR',name:'  Modelo sintético  ',active:true,eventCode:'101101',reasonCode:'1',
 textTemplate:'  Solicito a análise do pedido com base nos fatos descritos a seguir: {{detalhe}}.  '};
const fixture=`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE public.polos(id uuid PRIMARY KEY,status text);
CREATE TABLE public.test_scope(actor uuid,context uuid,polo uuid,environment text,allowed boolean);
CREATE FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text) RETURNS void LANGUAGE plpgsql STABLE AS $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.test_scope WHERE actor=auth.uid() AND context=$1 AND polo=$2 AND environment=$3 AND allowed)
 THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501';END IF;
 IF $4 IS NULL OR $4!~'^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'invalid scope' USING ERRCODE='22023';END IF;END$$;
`;

test('cancellation models are scoped, versioned drafts with immutable replay, not fiscal events',async t=>{
 const db=new PGlite();let created,changed;
 const value=async(query,args=[])=>(await db.query(query,args)).rows[0].value;
 const get=(env='PRODUCAO',polo=id(1),context=id(10))=>value('SELECT public.get_nfse_cancellation_models_secure($1,$2,$3,$4) value',
  [context,polo,env,'2026-11']);
 const save=(request,input=definition,model=null,version=null,env='PRODUCAO',context=id(10))=>
  value('SELECT public.save_nfse_cancellation_model_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
   [context,id(1),env,'2026-11',id(request),model,version,input]);
 const deny=(promise,code='22023')=>assert.rejects(promise,e=>e.code===code);
 const count=()=>value('SELECT count(*)::int value FROM private.nfse_cancellation_model_requests');
 try{
  await db.exec(fixture);
  await db.exec(`INSERT INTO public.polos VALUES('${id(1)}','ativo'),('${id(2)}','ativo');
   INSERT INTO public.test_scope VALUES('${id(11)}','${id(10)}','${id(1)}','PRODUCAO',true),
   ('${id(11)}','${id(10)}','${id(1)}','HOMOLOGACAO',true);SET test.actor='${id(11)}';`);
  await db.exec(migration);
  await t.test('seven read-only seeds have stable identities and official 1/2/9 reasons, without an invented deadline',async()=>{
   const result=await get();assert.deepEqual(result.scope,{contextKey:id(10),poloId:id(1),environment:'PRODUCAO',month:'2026-11'});
   assert.equal(result.data.rows.length,7);assert.equal(result.data.totalItems,7);assert.equal(result.data.pageSize,500);
   assert.deepEqual(result.data.rows.map(r=>r.id).sort(),['DUPLICATE_ISSUE','ERROR_AMOUNT','ERROR_RECIPIENT','ERROR_SERVICE',
    'ERROR_TAXATION','OTHER_REASON','SERVICE_NOT_PROVIDED'].map(key=>'SYSTEM:'+key).sort());
   for(const model of result.data.rows){assert.equal(model.source,'SYSTEM');assert.equal(model.version,1);assert.equal(model.requiresDetail,true);
    assert.equal(model.eventCode,'101101');assert(model.textTemplate.includes('{{detalhe}}'));assert(model.textTemplate.length<=255);
    assert(!/24\s*(h|hora)/i.test(model.textTemplate));
    const input=Object.fromEntries(['category','name','active','eventCode','reasonCode','textTemplate'].map(k=>[k,model[k]]));
    assert.deepEqual(await value('SELECT private.normalize_nfse_cancellation_model($1) value',[input]),input);
   }
   assert.equal(result.data.rows.find(r=>r.id==='SYSTEM:SERVICE_NOT_PROVIDED').reasonCode,'2');
   assert.equal(result.data.rows.find(r=>r.id==='SYSTEM:OTHER_REASON').reasonCode,'9');
   const xsd=await readFile(new URL('../functions/_shared/nfse-national/schemas/1.01/tiposSimples_v1.01.xsd',import.meta.url),'utf8');
   const domain=xsd.slice(xsd.indexOf('<xs:simpleType name="TSCodJustCanc">'),xsd.indexOf('</xs:simpleType>',xsd.indexOf('<xs:simpleType name="TSCodJustCanc">')));
   assert.deepEqual([...domain.matchAll(/<xs:enumeration value="([^"]+)"/g)].map(m=>m[1]),['1','2','9']);
  });
  await t.test('copying a template creates CUSTOM, derives detail requirement and replays the exact immutable result',async()=>{
   created=await save(100);assert.equal(created.data.model.source,'CUSTOM');assert.equal(created.data.model.version,1);
   assert.match(created.data.model.id,/^[0-9a-f-]{36}$/);assert.equal(created.data.model.name,'Modelo sintético');
   assert.equal(created.data.model.requiresDetail,true);assert.equal(created.data.model.textTemplate,definition.textTemplate.trim());
   assert.deepEqual(await save(100),created);assert.equal(await count(),1);assert.equal((await get()).data.totalItems,8);
   await deny(save(100,{...definition,name:'Outro nome'}));assert.equal(await count(),1);
  });
  await t.test('edits require the current version, preserve historical replay and use active=false for deactivation',async()=>{
   changed=await save(101,{...definition,active:false},created.data.model.id,1);
   assert.equal(changed.data.model.version,2);assert.equal(changed.data.model.active,false);
   assert.deepEqual(await save(100),created);assert.equal(await count(),2);
   const listed=(await get()).data.rows.find(r=>r.id===created.data.model.id);assert.equal(listed.version,2);assert.equal(listed.active,false);
   await deny(save(102,definition,created.data.model.id,1),'40001');assert.equal(await count(),2);
   await deny(save(103,definition,created.data.model.id,null));await deny(save(104,definition,null,1));
   const literal=await save(105,{...definition,reasonCode:'9',textTemplate:'Pedido sujeito à revisão dos fatos na operação, com justificativa final confirmada.'});
   assert.equal(literal.data.model.requiresDetail,false);
  });
  await t.test('environment/unit isolation and scope revocation apply before reading an idempotent response',async()=>{
   assert.equal((await get('HOMOLOGACAO')).data.totalItems,7);
   await deny(save(106,definition,created.data.model.id,2,'HOMOLOGACAO'),'40001');
   await db.query(`INSERT INTO private.nfse_cancellation_models(id,polo_id,environment,definition,created_by,updated_by)
    VALUES($1,$2,'PRODUCAO',$3,$4,$4)`,[id(400),id(2),definition,id(11)]);
   assert.equal((await get()).data.rows.some(r=>r.id===id(400)),false);
   await deny(save(107,definition,id(400),1),'40001');await deny(get('PRODUCAO',id(2)),'42501');
   await db.exec('UPDATE public.test_scope SET allowed=false');
   await deny(save(100),'42501');await deny(get(),'42501');
   await db.exec('UPDATE public.test_scope SET allowed=true');
   await deny(save(100,definition,null,null,'PRODUCAO',id(99)),'42501');assert.deepEqual(await save(100),created);
  });
  await t.test('unsupported fiscal reasons/events, unknown variables and oversized/control text cannot be saved',async()=>{
   for(const patch of [{reasonCode:'3'},{eventCode:'101102'},{category:'FISCAL'},{source:'SYSTEM'},{active:'true'},
    {name:''},{name:'x'.repeat(121)},{textTemplate:'x'.repeat(14)},{textTemplate:'x'.repeat(256)},
    {textTemplate:'Modelo com {{nome}} não autorizado'},{textTemplate:'Modelo com }} inválido'},
    {textTemplate:'Primeira linha\nSegunda linha'},{deadlineHours:24}])await deny(save(200,{...definition,...patch}));
   await deny(save(201,{...definition,reasonCode:1}));
   await deny(value('SELECT public.save_nfse_cancellation_model_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
    [...scope,id(202),'SYSTEM:ERROR_AMOUNT',1,definition]),'22P02');
  });
  await t.test('audit is append-only and app roles cannot access private data, helper functions or anonymous RPCs',async()=>{
   for(const statement of ['UPDATE private.nfse_cancellation_model_requests SET response=\'{}\'',
    'DELETE FROM private.nfse_cancellation_model_requests'])await deny(db.exec(statement),'55000');
   const rls=(await db.query(`SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='private' AND c.relname IN('nfse_cancellation_models','nfse_cancellation_model_requests')`)).rows;
   assert.equal(rls.length,2);assert(rls.every(r=>r.relrowsecurity));
   for(const role of ['anon','authenticated','service_role']){
    for(const table of ['nfse_cancellation_models','nfse_cancellation_model_requests'])
     assert.equal(await value(`SELECT has_table_privilege('${role}','private.${table}','SELECT,INSERT,UPDATE,DELETE') value`),false);
    assert.equal(await value(`SELECT has_function_privilege('${role}','private.nfse_system_cancellation_models()','EXECUTE') value`),false);
   }
   for(const fn of ['get_nfse_cancellation_models_secure(uuid,uuid,text,text)',
    'save_nfse_cancellation_model_secure(uuid,uuid,text,text,uuid,uuid,integer,jsonb)']){
    assert.equal(await value(`SELECT has_function_privilege('authenticated','public.${fn}','EXECUTE') value`),true);
    assert.equal(await value(`SELECT has_function_privilege('anon','public.${fn}','EXECUTE') value`),false);
    assert.equal(await value(`SELECT has_function_privilege('service_role','public.${fn}','EXECUTE') value`),false);
   }
   assert.equal(await value("SELECT to_regclass('private.nfse_individual_operations') value"),null);
   assert.equal(await value("SELECT to_regprocedure('public.nfse_individual_cancellation_internal(uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,jsonb)') value"),null);
  });
  await t.test('scope capacity includes inactive drafts, keeps seven seeds and never silently truncates models',async()=>{
   const current=await value("SELECT count(*)::int value FROM private.nfse_cancellation_models WHERE polo_id=$1 AND environment='PRODUCAO'",[id(1)]);
   await db.query(`INSERT INTO private.nfse_cancellation_models(polo_id,environment,definition,created_by,updated_by)
    SELECT $1,'PRODUCAO',$2,$3,$3 FROM generate_series(1,$4)`,[id(1),definition,id(11),493-current]);
   await deny(save(300));const result=(await get()).data;assert.equal(result.totalItems,500);assert.equal(result.rows.length,500);
   assert.equal(result.rows.filter(r=>r.source==='SYSTEM').length,7);
  });
 }finally{await db.close();}
});
