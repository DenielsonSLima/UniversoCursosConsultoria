import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite }=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql=name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const ns='http://www.sped.fazenda.gov.br/nfse';
const xml=date=>`<NFSe xmlns="${ns}"><infNFSe><dhProc>${date}</dhProc><DPS><infDPS><dhEmi>2026-01-01T10:00:00Z</dhEmi></infDPS></DPS></infNFSe></NFSe>`;
const fixture=`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE public.test_scope(actor uuid,context uuid,polo uuid,environment text,month text,allowed boolean);
CREATE FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text) RETURNS void LANGUAGE plpgsql STABLE AS $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.test_scope WHERE actor=auth.uid() AND context=$1 AND polo=$2 AND environment=$3 AND month=$4 AND allowed)
 THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501';END IF;END$$;
CREATE TABLE private.nfse_individual_operations(id uuid PRIMARY KEY,request_id uuid,polo_id uuid,environment text,month text,
 state text,result jsonb,snapshot jsonb,command jsonb,created_at timestamptz,authorized_xml text);
CREATE TABLE private.nfse_individual_cancellations(id uuid PRIMARY KEY,operation_id uuid UNIQUE,state text,result jsonb);
CREATE TABLE private.nfse_queue_operation_links(operation_id uuid UNIQUE,source_kind text,source_id uuid,PRIMARY KEY(source_kind,source_id));
`;

test('issued filters use authoritative XML and frozen source facts before paging, without changing records',async t=>{
 const db=new PGlite();
 const value=async(query,args=[])=>(await db.query(query,args)).rows[0].value;
 const list=(filters={},scope={})=>value('SELECT public.get_nfse_documents_secure($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) value',
  [scope.context??id(10),scope.polo??id(1),scope.environment??'PRODUCAO',scope.month??'2026-11',filters.status??'EMITIDA',
   filters.search??null,filters.page??1,filters.size??25,filters.from??null,filters.to??null,filters.type??null,filters.origin??null]);
 const deny=(promise,code='22023')=>assert.rejects(promise,e=>e.code===code);
 const state=()=>value(`SELECT jsonb_build_object('operations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM private.nfse_individual_operations o),
  'cancellations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM private.nfse_individual_cancellations c),
  'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY source_id) FROM private.nfse_queue_operation_links l)) value`);
 const add=async(n,{kind='ACADEMIC_QUEUE',type=null,fallback=null,date='2026-11-10T12:00:00-03:00',raw=null,
   polo=1,month='2026-11',status='AUTHORIZED'}={})=>{
  const academic={classLabel:`TURMA SINTÉTICA ${n}`,...(type?{courseType:type}:{}),...(fallback?{descriptionContext:{courseType:fallback}}:{})};
  const snapshot={recipient:{name:`ALUNO SINTÉTICO ${n}`,type:'Aluno'},model:{definition:{name:'MODELO SINTÉTICO',nbsCode:'122020000'}},
   source:{kind,preparation:{snapshot:{academic}}}};
  await db.query(`INSERT INTO private.nfse_individual_operations VALUES($1,$2,$3,'PRODUCAO',$4,$5,$6,$7,'{"amount":"1.00"}',
   '2026-11-01T10:00:00Z',$8)`,[id(n),id(n+100),id(polo),month,status,{number:String(n),accessKey:String(n).padStart(50,'0'),message:'ESTADO SINTÉTICO'},
   snapshot,status==='AUTHORIZED'?(raw??xml(date)):null]);
  await db.query('INSERT INTO private.nfse_queue_operation_links VALUES($1,$2,$3)',[id(n),kind,id(n+200)]);
 };
 try{
  await db.exec(fixture);
  await db.query('INSERT INTO public.test_scope VALUES($1,$2,$3,$4,$5,true)',[id(11),id(10),id(1),'PRODUCAO','2026-11']);
  await db.exec(`SET test.actor='${id(11)}'`);
  await db.exec(await sql('20261111004624_nfse_operation_read_models.sql'));
  await db.exec(await sql('20261111014607_nfse_issued_document_filters.sql'));
  await add(1,{kind:'PARTNER_SERVICE',type:'TECNICO',date:'2026-11-11T00:30:00Z'});
  await add(2,{type:'TECNICO',date:'2026-11-11T03:10:00Z'});
  await add(3,{fallback:'EAD',date:'2026-11-10T16:00:00-03:00'});
  await add(4,{raw:`<NFSe xmlns="${ns}"><infNFSe><DPS><infDPS><dhEmi>2026-11-10T12:00:00Z</dhEmi></infDPS></DPS></infNFSe></NFSe>`});
  await add(5,{type:'LIVRE',polo:2});await add(6,{type:'ESPECIALIZACAO',month:'2026-12'});
  await add(7,{raw:'<not-valid-xml'});await add(8,{type:'ESPECIALIZACAO',status:'REJECTED'});
  await add(9,{type:'LIVRE',status:'PROCESSING'});
  await db.query(`INSERT INTO private.nfse_individual_cancellations VALUES($1,$2,'CANCELLED','{"message":"CANCELADA SINTÉTICA"}')`,[id(300),id(2)]);
  const before=await state();
  await t.test('one public overload accepts legacy eight args; helpers and legacy function are private',async()=>{
   const functions=(await db.query(`SELECT pronargs,pronargdefaults FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_nfse_documents_secure'`)).rows;
   assert.deepEqual(functions,[{pronargs:12,pronargdefaults:7}]);
   assert.equal((await value('SELECT public.get_nfse_documents_secure($1,$2,$3,$4,$5,NULL,1,25) value',
    [id(10),id(1),'PRODUCAO','2026-11','EMITIDA'])).data.totalItems,5);
   assert.equal(await value("SELECT has_function_privilege('authenticated','public.get_nfse_documents_secure(uuid,uuid,text,text,text,text,integer,integer,text,text,text,text)','EXECUTE') value"),true);
   for(const role of ['anon','authenticated','service_role']){
    assert.equal(await value(`SELECT has_function_privilege('${role}','private.nfse_authorized_xml_emitted_at(text)','EXECUTE') value`),false);
    assert.equal(await value(`SELECT has_function_privilege('${role}','public.get_nfse_documents_legacy_20261111(uuid,uuid,text,text,text,text,integer,integer)','EXECUTE') value`),false);
   }
  });
  await t.test('date bounds use original dhProc in Maceio and server filters precede pagination',async()=>{
   const first=(await list({from:'2026-11-10',to:'2026-11-10',size:1})).data;
   assert.equal(first.totalItems,2);assert.equal(first.rows.length,1);assert.equal(first.rows[0].id,id(1));
   assert.equal(Date.parse(first.rows[0].emittedAt),Date.parse('2026-11-11T00:30:00Z'));
   assert.equal(first.rows[0].dateSource,'NFSE_DH_PROC');
   const second=(await list({from:'2026-11-10',to:'2026-11-10',size:1,page:2})).data;
   assert.equal(second.rows[0].id,id(3));assert.equal(second.totalItems,2);
   assert.deepEqual((await list({from:'2026-11-11',to:'2026-11-11'})).data.rows.map(r=>r.id),[id(2)]);
  });
  await t.test('source kind controls origin; partner type or model NBS never implies an academic course',async()=>{
   const services=(await list({origin:'SERVICO'})).data;
   assert.equal(services.totalItems,1);assert.equal(services.rows[0].id,id(1));
   assert.equal(services.rows[0].origin,'SERVICO');assert.equal(services.rows[0].courseType,null);assert.equal(services.rows[0].courseTypeLabel,null);
   const academic=(await list({origin:'ALUNO',type:'TECNICO'})).data;
   assert.equal(academic.totalItems,1);assert.equal(academic.rows[0].id,id(2));assert.equal(academic.rows[0].courseTypeLabel,'Técnico');
   assert.equal(academic.rows[0].state,'CANCELLED');assert.equal(academic.rows[0].status,'EMITIDA');
   assert.equal((await list({origin:'SERVICO',type:'TECNICO'})).data.totalItems,0);
  });
  await t.test('course choices span the scoped issued set and ignore active filters/search/page',async()=>{
   const expected=[{value:'EAD',label:'EAD'},{value:'TECNICO',label:'Técnico'}];
   for(const filters of [{},{type:'TECNICO',page:2,size:1},{origin:'SERVICO'},
     {from:'2026-11-11',to:'2026-11-11'},{search:'no matching person'}]){
    assert.deepEqual((await list(filters)).data.courseTypes,expected);
   }
   assert.equal((await list({status:'ERRO'})).data.courseTypes[0].value,'ESPECIALIZACAO');
  });
  await t.test('missing or malformed fiscal dates and missing course metadata stay unknown',async()=>{
   const result=(await list()).data;assert.equal(result.totalItems,5);
   for(const n of [4,7]){const row=result.rows.find(r=>r.id===id(n));assert.equal(row.emittedAt,null);assert.equal(row.dateSource,null);
    assert.equal(row.courseType,null);}
   assert.equal(new Set(result.rows.map(r=>r.id)).size,result.rows.length);
   assert.deepEqual((await list({search:'SINTÉTICO 3'})).data.rows.map(r=>r.id),[id(3)]);
  });
  await t.test('XML extraction is exact, namespace-aware, bounded and refuses DTD or duplicate timestamps',async()=>{
   const extract=input=>value('SELECT private.nfse_authorized_xml_emitted_at($1) value',[input]);
   for(const input of [null,'<invalid',xml('not-a-date'),xml('2026-02-30T12:00:00Z'),
     xml('2026-11-10T12:00:00Z').replace(ns,'https://example.invalid'),
     `<NFSe xmlns="${ns}"><infNFSe><dhProc>2026-11-10T12:00:00Z</dhProc><dhProc>2026-11-11T12:00:00Z</dhProc></infNFSe></NFSe>`,
     `<!DOCTYPE NFSe [<!ENTITY secret SYSTEM "file:///not-read">]>${xml('2026-11-10T12:00:00Z')}`,'x'.repeat(4500001)])assert.equal(await extract(input),null);
   assert.equal(Date.parse(await extract(xml('2026-11-10T12:00:00-03:00'))),Date.parse('2026-11-10T15:00:00Z'));
  });
  await t.test('invalid filters fail clearly and revoked/foreign scope fails before payload validation',async()=>{
   for(const filters of [{from:'2026-02-30'},{from:'2026-11-11',to:'2026-11-10'},{from:'2026-1-01'},
    {to:'2026-11-10T00:00:00Z'},{type:'x'.repeat(101)},{origin:'ALUNO_OR_SERVICO'},{page:0},{size:101}])await deny(list(filters));
   await deny(list({origin:'invalid'},{polo:id(2)}),'42501');await deny(list({},{context:id(99)}),'42501');
   await deny(list({},{month:'2026-12'}),'42501');await deny(list({},{environment:'HOMOLOGACAO'}),'42501');
   await db.exec('UPDATE public.test_scope SET allowed=false');await deny(list(),'42501');
   assert.deepEqual(await state(),before,'List filtering must never change original XML, fiscal state or source links');
  });
 }finally{await db.close();}
});
