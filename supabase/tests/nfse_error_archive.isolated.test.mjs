import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql = name => readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const fixture = `
CREATE TABLE public.polos(id uuid PRIMARY KEY);
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE public.test_scope(actor uuid,context uuid,polo uuid,environment text,month text,allowed boolean);
CREATE FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text) RETURNS void LANGUAGE plpgsql STABLE AS $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.test_scope WHERE actor=auth.uid() AND context=$1 AND polo=$2 AND environment=$3 AND month=$4 AND allowed)
 THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501';END IF;END$$;
CREATE FUNCTION private.authorize_nfse_configuration_scope(uuid,uuid,text,text) RETURNS void LANGUAGE sql STABLE AS $$SELECT private.authorize_nfse_model_scope($1,$2,$3,$4)$$;
CREATE TABLE private.nfse_individual_operations(id uuid PRIMARY KEY,request_id uuid,polo_id uuid,environment text,month text,
 state text,result jsonb,snapshot jsonb,command jsonb,created_at timestamptz,authorized_xml text,dps_id text,signed_dps_xml text);
CREATE TABLE private.nfse_individual_cancellations(id uuid PRIMARY KEY,operation_id uuid UNIQUE,state text,result jsonb,event_xml text);
CREATE TABLE private.nfse_queue_operation_links(operation_id uuid UNIQUE,source_kind text,source_id uuid,PRIMARY KEY(source_kind,source_id));
CREATE TABLE private.nfse_models(id uuid,polo_id uuid,environment text,definition jsonb,version integer);
CREATE TABLE private.nfse_queue_documents(id uuid,polo_id uuid,environment text,queue_month text,class_id uuid,snapshot jsonb,amount numeric);
CREATE TABLE private.nfse_queue_removals(document_id uuid);
CREATE TABLE private.nfse_partner_services(id uuid,polo_id uuid,environment text,service_date date,amount numeric);
CREATE SEQUENCE private.nfse_individual_operations_number_seq START WITH 25;
CREATE TABLE private.nfse_receipt_reservations(environment text,receipt_id uuid,document_id uuid,source_receivable_id uuid,payment_event_id uuid);
ALTER TABLE private.nfse_individual_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfse_individual_cancellations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.nfse_queue_change_events(id uuid DEFAULT gen_random_uuid(),version integer DEFAULT 1,polo_id uuid,environment text,month text,created_at timestamptz DEFAULT now());
CREATE FUNCTION private.reject_nfse_preparation_change() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'immutable' USING ERRCODE='55000';END$$;
CREATE FUNCTION private.publish_nfse_queue_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 INSERT INTO public.nfse_queue_change_events(polo_id,environment,month) VALUES(NEW.polo_id,NEW.environment,NEW.queue_month);RETURN NEW;END$$;
`;

test('definitive error archiving is reversible, atomic and preserves fiscal/financial history',async t=>{
 const db=new PGlite();
 const value=async(query,args=[])=>(await db.query(query,args)).rows[0].value;
 const scope={context:id(100),polo:id(1),environment:'PRODUCAO',month:'2026-11'};
 const archive=(ids,action='ARCHIVE',request=500,s={})=>value(
  'SELECT public.archive_nfse_errors_secure($1,$2,$3,$4,$5,$6,$7) value',
  [s.context??scope.context,s.polo??scope.polo,s.environment??scope.environment,s.month??scope.month,id(request),ids?.map(id)??null,action]);
 const list=(mode=null,filters={},s={})=>value('SELECT public.get_nfse_documents_secure($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) value',
  [s.context??scope.context,s.polo??scope.polo,s.environment??scope.environment,s.month??scope.month,filters.status??'ERRO',filters.search??null,
   filters.page??1,filters.size??25,filters.from??null,filters.to??null,filters.type??null,filters.origin??null,filters.issuedState??null,mode]);
 const deny=(promise,code='40001')=>assert.rejects(promise,error=>error.code===code);
 const records=()=>value(`SELECT jsonb_build_object('operations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM private.nfse_individual_operations o),
  'cancellations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM private.nfse_individual_cancellations c),
  'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY source_id) FROM private.nfse_queue_operation_links l),
  'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY receipt_id) FROM private.nfse_receipt_reservations r),
  'counter',(SELECT last_value FROM private.nfse_individual_operations_number_seq)) value`);
 const requests=()=>value('SELECT count(*)::integer value FROM private.nfse_error_archive_requests');
 const add=async(n,state='REJECTED',{polo=1,environment='PRODUCAO',month='2026-11',kind='ACADEMIC_QUEUE',codes=['E0120'],mismatch=false,authorized=false,identity={}}={})=>{
  const dps=`DPS${String(n).padStart(42,'0')}`;
  const xml=authorized||state==='AUTHORIZED'?'<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe><dhProc>2026-11-10T12:00:00-03:00</dhProc><cStat>100</cStat></infNFSe></NFSe>':null;
  await db.query(`INSERT INTO private.nfse_individual_operations VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{"amount":"1.00"}',
   '2026-11-10T12:00:00Z',$9,$10,'<DPS>ORIGINAL SINTÉTICA ASSINADA</DPS>')`,
   [id(n),id(n+1000),id(polo),environment,month,state,{state,dpsId:mismatch?'OTHER':dps,codes,
    ...(state==='AUTHORIZED'?{number:String(n),accessKey:String(n).padStart(50,'0')}:identity)},
    {recipient:{name:`PESSOA SINTÉTICA ${n}`},model:{definition:{name:'MODELO SINTÉTICO'}},source:{preparation:{snapshot:{academic:{courseType:n===2?'EAD':'TECNICO'}}}}},xml,dps]);
  await db.query('INSERT INTO private.nfse_queue_operation_links VALUES($1,$2,$3)',[id(n),kind,id(n+2000)]);
 };
 try{
  await db.exec(fixture);
  await db.query('INSERT INTO public.polos VALUES($1),($2)',[id(1),id(2)]);
  for(const environment of ['PRODUCAO','HOMOLOGACAO'])await db.query('INSERT INTO public.test_scope VALUES($1,$2,$3,$4,$5,true)',[id(101),id(100),id(1),environment,'2026-11']);
  await db.exec(`SET test.actor='${id(101)}'`);
  for(const name of ['20261111004624_nfse_operation_read_models.sql','20261111004626_nfse_queue_workspace_reads.sql',
   '20261111014607_nfse_issued_document_filters.sql','20261111042040_nfse_cancelled_document_partition.sql','20261111091445_nfse_error_archive.sql',
   '20261111092451_nfse_error_archive_without_identity.sql'])await db.exec(await sql(name));
  await add(1,'REJECTED',{kind:'PARTNER_SERVICE'});await add(2);await add(3,'BLOCKED');await add(4,'AWAITING_CONFIRMATION');
  await add(5,'PROCESSING');await add(6,'AUTHORIZED');await add(7,'REJECTED',{codes:null});await add(8,'REJECTED',{mismatch:true});
  await add(9,'REJECTED',{polo:2});await add(10,'REJECTED',{month:'2026-12'});await add(11,'REJECTED',{environment:'HOMOLOGACAO'});
  await add(12,'AUTHORIZED');await add(13,'REJECTED',{authorized:true});await add(14,'REJECTED',{codes:['INVALID\nCODE']});
  await add(15,'REJECTED',{identity:{number:'777'}});await add(16,'REJECTED',{identity:{accessKey:'7'.repeat(50)}});
  await db.query(`UPDATE private.nfse_individual_operations SET result=result||'{"number":null,"accessKey":null}' WHERE id=$1`,[id(2)]);
  await db.query(`INSERT INTO private.nfse_individual_cancellations VALUES($1,$2,'CANCELLED','{"code":"CONFIRMED","eventCode":"101101"}','<evento>PROVA SINTÉTICA</evento>')`,[id(3012),id(12)]);
  await db.query("INSERT INTO private.nfse_receipt_reservations VALUES('PRODUCAO',$1,$2,$3,NULL)",[id(91),id(2002),id(92)]);
  const before=await records();
  await t.test('authoritative flags distinguish definitive rejection from blocked/uncertain or malformed results',async()=>{
   const rows=(await list()).data.rows;assert.equal(rows.length,9);
   assert.deepEqual(rows.filter(row=>row.canArchive).map(row=>row.id).sort(),[id(1),id(2)]);
   assert(rows.every(row=>row.canRestore===false&&row.archivedAt===null));
   assert(rows.filter(row=>row.canArchive).every(row=>row.number===null&&row.accessKey===null));
   for(const n of [15,16]){const row=rows.find(item=>item.id===id(n));assert.equal(row.canArchive,false);assert.equal(row.canRestore,false);}
   for(const n of [3,4,5,6,7,8,12,13,14,15,16])await deny(archive([n]));
   await deny(archive([1,15]));await deny(archive([1,16]));
   for(const field of ['number','accessKey'])assert.equal(await value(`SELECT private.nfse_error_archivable(
    jsonb_populate_record(NULL::private.nfse_individual_operations,to_jsonb(o)||jsonb_build_object('result',o.result||jsonb_build_object($1::text,'')))) value
    FROM private.nfse_individual_operations o WHERE id=$2`,[field,id(1)]),false,'Even empty fiscal identity must prevent archiving');
   assert.equal(await requests(),0);
   assert.equal(await value('SELECT count(*)::integer value FROM private.nfse_error_archives'),0);
   assert.equal(await value('SELECT count(*)::integer value FROM public.nfse_queue_change_events'),0);
  });
  await t.test('mixed batches and changed final state fail atomically; invalid arrays/actions are bounded',async()=>{
   await deny(archive([1,3]));assert.equal(await requests(),0);
   await db.query("UPDATE private.nfse_individual_operations SET state='PROCESSING' WHERE id=$1",[id(1)]);
   await deny(archive([1,2]));assert.equal(await requests(),0);
   await db.query("UPDATE private.nfse_individual_operations SET state='REJECTED' WHERE id=$1",[id(1)]);
   for(const ids of [[],[1,1],Array.from({length:101},(_,n)=>n+1),null])await deny(archive(ids),'22023');
   await deny(archive([1],'DELETE'),'22023');
   const source=await sql('20261111091445_nfse_error_archive.sql');
   assert.match(source,/ORDER BY id FOR UPDATE/,'Archive uses the same physical row lock as fiscal FINISH');
  });
  await t.test('archive/replay binds sorted IDs and action; original operation bytes and counters are untouched',async()=>{
   const response=await archive([2,1]);assert.equal(response.data.changedCount,2);assert.deepEqual(response.data.operationIds,[id(1),id(2)]);
   assert.deepEqual(await archive([1,2]),response);assert.equal(await requests(),1);
   await deny(archive([1]),'22023');await deny(archive([1,2],'RESTORE'),'22023');
   const archived=(await list('ARCHIVED')).data;assert.equal(archived.totalItems,2);
   assert(archived.rows.every(row=>row.status==='ERRO'&&row.state==='REJECTED'&&!row.canArchive&&row.canRestore&&row.archivedAt));
   assert.equal(archived.rows.find(row=>row.id===id(1)).errorCode,'E0120');
   assert.equal((await list()).data.totalItems,7);
   assert.equal((await archive([1,2],'ARCHIVE',501)).data.changedCount,0);
   assert.deepEqual(await records(),before);
   const hints=(await db.query('SELECT * FROM public.nfse_queue_change_events')).rows;
   assert.equal(hints.length,2);assert(hints.every(h=>h.polo_id===id(1)&&h.environment==='PRODUCAO'&&h.month==='2026-11'));
   assert.deepEqual(Object.keys(hints[0]).sort(),['id','version','polo_id','environment','month','created_at'].sort());
  });
  await t.test('archive partition and all fiscal filters precede pagination/contours; reversal restores the default list',async()=>{
   const first=(await list('ARCHIVED',{size:1})).data,second=(await list('ARCHIVED',{size:1,page:2})).data;
   assert.equal(first.totalItems,2);assert.equal(second.totalItems,2);assert.notEqual(first.rows[0].id,second.rows[0].id);
   assert.equal((await list('ARCHIVED',{origin:'SERVICO',search:'SINTÉTICA 1'})).data.rows[0].id,id(1));
   assert.equal((await list('ARCHIVED',{from:'2026-11-10',to:'2026-11-10'})).data.totalItems,0,
    'A rejected DPS has no authorized NFSe dhProc; archiving never invents an emission date');
   assert.equal((await list('ARCHIVED',{type:'EAD',origin:'ALUNO'})).data.rows[0].id,id(2));
   const summary=()=>value('SELECT public.get_nfse_workspace_secure($1,$2,$3,$4) value',[id(100),id(1),'PRODUCAO','2026-11']);
   assert.equal((await summary()).data.summary.errorCount,7);
   const restored=await archive([1],'RESTORE',502);assert.equal(restored.data.changedCount,1);
   assert.deepEqual(await archive([1],'RESTORE',502),restored);
   assert.equal((await list('ARCHIVED')).data.totalItems,1);assert.equal((await list()).data.totalItems,8);
   assert.equal((await summary()).data.summary.errorCount,8);
   assert((await list()).data.rows.find(row=>row.id===id(1)).canArchive);
   assert.equal((await archive([1],'RESTORE',503)).data.changedCount,0);
   const legacy=await value('SELECT public.get_nfse_documents_secure($1,$2,$3,$4,$5,NULL,1,25) value',[id(100),id(1),'PRODUCAO','2026-11','ERRO']);
   assert.equal(legacy.data.totalItems,8);
   assert.equal((await list(null,{status:'EMITIDA',issuedState:'CANCELLED'})).data.totalItems,1);
   assert.equal((await list(null,{status:'EMITIDA',issuedState:'ACTIVE'})).data.totalItems,1);
   await deny(list('INVALID'),'22023');await deny(list('ARCHIVED',{status:'EMITIDA'}),'22023');
  });
  await t.test('scope authorization precedes replay; private audit/marks have RLS and minimal grants',async()=>{
   for(const s of [{polo:id(2)},{context:id(999)},{month:'2026-12'}])await deny(archive([1],'ARCHIVE',500,s),'42501');
   await deny(archive([9,1],'ARCHIVE',504));await deny(archive([11],'ARCHIVE',504));
   assert.equal((await list(null,{}, {environment:'HOMOLOGACAO'})).data.totalItems,1);
   const signatures=(await db.query(`SELECT pronargs,pronargdefaults FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_nfse_documents_secure'`)).rows;
   assert.deepEqual(signatures,[{pronargs:14,pronargdefaults:9}]);
   for(const table of ['nfse_error_archive_requests','nfse_error_archives']){
    assert.equal(await value(`SELECT relrowsecurity value FROM pg_class WHERE oid='private.${table}'::regclass`),true);
    for(const role of ['anon','authenticated','service_role'])assert.equal(await value(`SELECT has_table_privilege('${role}','private.${table}','SELECT,INSERT,UPDATE,DELETE') value`),false);
   }
   await deny(db.exec('UPDATE private.nfse_error_archive_requests SET payload=payload'),'55000');
   await deny(db.exec('DELETE FROM private.nfse_error_archives'),'55000');
   await db.exec('SET ROLE authenticated');
   assert.equal((await list('ARCHIVED')).data.totalItems,1);
   await deny(value('SELECT count(*) value FROM private.nfse_error_archives'),'42501');
   await db.exec('RESET ROLE');await db.exec('UPDATE public.test_scope SET allowed=false');
   await deny(archive([1,2]),'42501');await deny(list('ARCHIVED'),'42501');
   assert.deepEqual(await records(),before);
  });
 }finally{await db.close();}
});
