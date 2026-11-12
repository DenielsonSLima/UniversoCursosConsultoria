import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { id, sql, installAutomaticReviewFixture } from './nfse_automatic_review.fixture.mjs';
const pgModule = await import(pathToFileURL(resolve(process.env.NFSE_PG_MODULE)).href);
const { Client } = pgModule.default ?? pgModule;
const connect = async name => {
  const client = new Client({connectionString:process.env.NFSE_TEST_DATABASE_URL,application_name:name});
  await client.connect(); client.exec = q => client.query(q); return client;
};
const scope = [id(10),id(1),'PRODUCAO','2026-11'];
const value = async (db,q,args=[]) => (await db.query(q,args)).rows[0].value;
const bridge = (db,op,actor,context,action,input=null) => value(db,
  'select public.nfse_individual_operation_internal($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
  [actor,context,...scope.slice(1),op.requestId,action,op.previewId,input]);
const remove = (db,source,request) => value(db,
  'select public.remove_nfse_partner_services_secure($1,$2,$3,$4,$5,$6) value',[...scope,request,[source]]);
// Wait on PostgreSQL's lock graph, not an arbitrary timing sleep.
async function blocked(observer,waiter,holder) {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline) {
    if(await value(observer,'select $2=any(pg_blocking_pids($1)) value',[waiter,holder]))return;
    await new Promise(setImmediate);
  }
  throw Error('Expected concurrent session did not wait on lock owner');
}
test('real PostgreSQL: two actors get one dispatch lease and removed sources cannot dispatch',{timeout:60000},async()=>{
 const admin=await connect('nfse-fixture'),a=await connect('nfse-actor-a'),b=await connect('nfse-actor-b');
 try {
  await installAutomaticReviewFixture(admin);
  await admin.exec(`CREATE OR REPLACE FUNCTION private.reject_nfse_preparation_change() RETURNS trigger LANGUAGE plpgsql AS
    $$BEGIN RAISE EXCEPTION 'immutable' USING ERRCODE='55000';END$$;
    ALTER TABLE public.contas_receber ADD COLUMN cliente_id uuid;
    ALTER TABLE private.nfse_partner_services ADD PRIMARY KEY(id);
    CREATE TABLE public.nfse_change_events(id uuid default gen_random_uuid(),polo_id uuid,environment text,month text,resource text);`);
  for(const name of ['20261112012759_nfse_operation_service_location.sql','20261112012806_nfse_prepared_service_location_guard.sql',
   '20261112152151_nfse_unsigned_address_refresh_store.sql','20261112152203_nfse_unsigned_address_refresh_preview.sql',
   '20261112152213_nfse_unsigned_address_refresh_bridge.sql','20261112171501_nfse_multiuser_operation_core.sql',
   '20261112171502_nfse_multiuser_operation_bridge.sql','20261112171503_nfse_multiuser_unsigned_refresh.sql',
   '20261112171504_nfse_multiuser_queue_preview.sql','20261111092451_nfse_error_archive_without_identity.sql',
   '20261111105000_nfse_partner_service_removal.sql','20261112173000_nfse_unsigned_service_removal.sql'])await admin.exec(await sql(name));
  const consumers=await sql('20261111121001_nfse_shared_model_consumers.sql');
  const start=consumers.indexOf('FUNCTION private.nfse_queue_operation_basis(');
  await admin.exec('CREATE OR REPLACE '+consumers.slice(start,consumers.indexOf('$function$;',start)+12));
  await admin.exec(`UPDATE private.nfse_models SET definition=jsonb_set(definition,'{peopleOptions,recipientAddressSource}','"FROM_PARTNER"');
    UPDATE private.nfse_models SET definition=definition||'{"serviceOptions":{"version":1,"countryCode":"BRA","municipalityCode":"2803401"}}';
    UPDATE public.parceiros SET endereco='RUA SINTÉTICA',numero='S/N',bairro='CENTRO',cidade='CIDADE SINTÉTICA',uf='SE',cep='49000-000';
    INSERT INTO public.test_context VALUES('${id(13)}','${id(12)}',true,false,ARRAY['${id(1)}'::uuid]);`);
  for(const [client,actor]of [[admin,11],[a,11],[b,12]])await client.exec(`SET test.actor='${id(actor)}';SET test.role='service_role';SET statement_timeout='10s';`);
  const pidA=await value(a,'select pg_backend_pid() value'),pidB=await value(b,'select pg_backend_pid() value');
  const make=async n=>{
    await admin.query(`INSERT INTO private.nfse_partner_services(id,polo_id,environment,service_date,status,model_id,model_snapshot,partner_id,amount,service_description)
      SELECT $1,$2,'PRODUCAO','2026-11-01','PREPARADO',id,definition||jsonb_build_object('id',id,'version',version),$3,100,'SERVIÇO SINTÉTICO' FROM private.nfse_models WHERE id=$4`,[id(n),id(1),id(30),id(60)]);
    const op=await value(admin,'select private.nfse_queue_prepare_operation($1,$2,$3,$4,$5,$6,$7) value',
      [id(11),...scope,id(n+100),{source:{kind:'PARTNER_SERVICE',id:id(n)},competenceDate:'2026-11-01'}]);
    return {...op,requestId:id(n+100)};
  };
  const input=op=>{
    const c=op.snapshot.command,r=op.snapshot.recipient,issuer=op.snapshot.issuer.cnpj.replace(/\D/g,'');
    const dps=`DPS28034012${issuer}${op.series}${op.number.padStart(15,'0')}`;
    return {dpsId:dps,fiscalInput:{environment:'PRODUCAO',series:op.series,number:op.number,issuedAt:op.issuedAt,
      competence:c.competenceDate,issuer:{taxId:{type:'CNPJ',value:issuer}},recipient:{name:r.name,taxId:{type:'CPF',value:r.document},
      address:{street:'RUA SINTÉTICA',district:'CENTRO',postalCode:'49000000',number:'S/N'}},
      service:{municipalityCode:'2803401',nationalTaxCode:'080201',nbs:'122020000',description:op.snapshot.source.serviceDescription},values:{serviceAmount:c.amount}},
      signedDpsXml:`<DPS Id="${dps}"><Signature/></DPS>`};
  };
  const op=await make(300);
  await bridge(admin,op,id(11),id(10),'PREPARE',input(op));
  await a.exec('BEGIN');
  assert.equal((await bridge(a,op,id(11),id(10),'CLAIM')).dispatch,true);
  const second=bridge(b,op,id(12),id(13),'CLAIM');
  await blocked(admin,pidB,pidA);await a.exec('COMMIT');
  assert.notEqual((await second).dispatch,true);
  assert.equal(await value(admin,'select count(*)::int value from private.nfse_operation_actor_audit where operation_id=$1 and dispatch',[op.previewId]),1);
  // Removal wins before the competing worker's signing/CLAIM transaction.
  const removed=await make(301);await a.exec('BEGIN');
  await remove(a,id(301),id(800));
  const signing=bridge(b,removed,id(12),id(13),'PREPARE',input(removed)).then(()=>null,e=>e);
  await blocked(admin,pidB,pidA);await a.exec('COMMIT');
  assert.equal((await signing).code,'40001');
  await assert.rejects(bridge(b,removed,id(12),id(13),'CLAIM'),e=>e.code==='40001');
  assert.equal(await value(admin,'select count(*)::int value from private.nfse_operation_actor_audit where operation_id=$1 and dispatch',[removed.previewId]),0);
  // CLAIM wins first; removal waits then rejects, without losing fiscal evidence.
  const claimed=await make(302);await bridge(admin,claimed,id(11),id(10),'PREPARE',input(claimed));
  await a.exec('BEGIN');assert.equal((await bridge(a,claimed,id(11),id(10),'CLAIM')).dispatch,true);
  // Removal uses actor A's authorized context from an independent connection.
  await b.exec(`SET test.actor='${id(11)}'`);
  const deleting=remove(b,id(302),id(801)).then(()=>null,e=>e);
  await blocked(admin,pidB,pidA);await a.exec('COMMIT');
  assert.equal((await deleting).code,'40001');
  assert.equal(await value(admin,'select count(*)::int value from private.nfse_partner_service_removals where service_id=$1',[id(302)]),0);
  assert.equal(await value(admin,'select state value from private.nfse_individual_operations where id=$1',[claimed.previewId]),'PROCESSING');
 }finally{await Promise.all([a.end(),b.end(),admin.end()]);}
});
