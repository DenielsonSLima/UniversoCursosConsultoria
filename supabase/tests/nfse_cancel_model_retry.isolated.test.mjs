import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql=name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const scope=[id(11),id(10),id(1),'PRODUCAO','2026-11'];
const deny=(p,code='22023')=>assert.rejects(p,e=>e.code===code);
test('canonical cancellation model snapshots and one explicit same-event retry preserve the prior lease',async t=>{
 const db=new PGlite();let legacy,selected,custom;const key='2'.repeat(50);
 const value=async(query,args=[])=>(await db.query(query,args)).rows[0].value;
 const call=(op,action,input=null,cancel=null)=>value('SELECT public.nfse_individual_cancellation_internal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
  [...scope,id(op+100),action,id(op),cancel,input]);
 const server=()=>db.exec(`SET request.jwt.claims='{"role":"service_role"}'`);
 const user=()=>db.exec(`SET request.jwt.claims='{"role":"authenticated"}'`);
 const create=op=>db.query(`INSERT INTO private.nfse_individual_operations(id,actor_id,context_id,polo_id,environment,month,request_id,
   command,snapshot,configuration_version,certificate_fingerprint,state,result,authorized_xml)
   VALUES($1,$2,$3,$4,'PRODUCAO','2026-11',$5,'{}',$6,1,repeat('a',64),'AUTHORIZED',$7,'<NFSe><Signature/></NFSe>')`,
   [id(op),id(11),id(10),id(1),id(op+100),{issuer:{cnpj:'0'.repeat(14)}},{accessKey:key,number:String(op)}]);
 const selection=(model='SYSTEM:SERVICE_NOT_PROVIDED',detail='Operação sintética não realizada.',version=1)=>({cancellationModel:{id:model,version},detail});
 const prepare=async(op,row)=>call(op,'PREPARE',{eventInput:{environment:'PRODUCAO',accessKey:key,eventCode:'101101',reasonCode:row.reasonCode,
   reason:row.justification,author:{type:'CNPJ',value:'0'.repeat(14)},occurredAt:row.occurredAt},eventReferenceId:row.eventReferenceId,
   signedEventXml:`<pedRegEvento Id="${row.eventReferenceId}"><Signature/></pedRegEvento>`},row.cancelPreviewId);
 const proof=async row=>({retryRequestId:id(900),checkedAt:new Date().toISOString(),httpStatus:404,probeCode:'REGISTERED_EVENT_NOT_FOUND',
   signedEventSha256:await value('SELECT encode(sha256(convert_to(signed_event_xml,\'UTF8\')),\'hex\') value FROM private.nfse_individual_cancellations WHERE id=$1',[row.cancelPreviewId])});
 try{
  await db.exec(await readFile(new URL('./nfse_individual_production.fixture.sql',import.meta.url),'utf8'));
  await db.exec(`CREATE FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text) RETURNS void LANGUAGE plpgsql AS $$BEGIN
   PERFORM private.authorize_nfse_configuration_scope($1,$2,$3,$4);END$$;
   INSERT INTO public.test_authorization VALUES('${id(11)}','${id(10)}','${id(1)}',true);
   INSERT INTO public.polos VALUES('${id(1)}','00000000000000','ativo'),('${id(2)}','00000000000001','ativo');
   SET request.jwt.claim.sub='${id(11)}';`);
  for(const name of ['20261111001718_nfse_individual_store.sql','20261111001723_nfse_individual_cancellation.sql',
   '20261111014713_nfse_cancel_preview_renewal.sql','20261111015424_nfse_cancellation_models.sql'])await db.exec(await sql(name));
  await server();await create(50);legacy=await call(50,'PREVIEW',{reasonCode:'1',justification:'Erro no valor da operação sintética.'});
  legacy=await prepare(50,legacy);await call(50,'CLAIM',null,legacy.cancelPreviewId);
  await call(50,'FINISH',{state:'CANCELLATION_PENDING',accessKey:key,code:'EVENT_JSON_CONTRACT_UNVERIFIED',message:'Aguardando consulta.'},legacy.cancelPreviewId);
  const original=await value('SELECT to_jsonb(c) value FROM private.nfse_individual_cancellations c WHERE id=$1',[legacy.cancelPreviewId]);
  for(const name of ['20261111021203_nfse_cancel_model_review.sql','20261111021211_nfse_cancel_manual_retry.sql'])await db.exec(await sql(name));
  await t.test('existing frozen cancellation remains byte-identical and cannot be replaced by a model',async()=>{
   const after=await value("SELECT to_jsonb(c)-'cancellation_model_snapshot'-'cancellation_model_detail' value FROM private.nfse_individual_cancellations c WHERE id=$1",[legacy.cancelPreviewId]);
   assert.deepEqual(after,original);const replay=await call(50,'PREVIEW',{reasonCode:'1',justification:legacy.justification});
   assert.equal(replay.cancelPreviewId,legacy.cancelPreviewId);assert.equal(replay.cancellationModel,null);
   await deny(call(50,'PREVIEW',selection()),'40001');
  });
  await t.test('selected model resolves official reason and final text on the server; client prefixes and tokens are refused',async()=>{
   await create(51);selected=await call(51,'PREVIEW',selection());assert.equal(selected.reasonCode,'2');
   assert.equal(selected.cancellationModel.id,'SYSTEM:SERVICE_NOT_PROVIDED');assert.equal(selected.cancellationModel.version,1);
   assert.equal(selected.detail,'Operação sintética não realizada.');assert(!selected.justification.includes('{{'));
   assert(selected.justification.startsWith('Solicito o cancelamento da NFS-e porque o serviço nela descrito não foi prestado.'));
   await deny(call(51,'PREVIEW',{...selection(),justification:'Prefixo arbitrário não permitido.'}));
   await create(52);await deny(call(52,'PREVIEW',{reasonCode:'9',justification:'Motivo avulso não permitido.'}));
   await deny(call(52,'PREVIEW',{reasonCode:'1',justification:'Texto com {{detalhe}} pendente.'}));
   await deny(call(52,'PREVIEW',selection('SYSTEM:OTHER_REASON','{{nome}}')));
   await deny(call(52,'PREVIEW',selection('SYSTEM:OTHER_REASON','x'.repeat(255))));
   const other=await call(52,'PREVIEW',selection('SYSTEM:OTHER_REASON'));assert.equal(other.reasonCode,'9');
  });
  await t.test('historical model replay uses its frozen version after edit/deactivation; new selections revalidate scope',async()=>{
   await user();const definition={category:'SERVICO',name:'Modelo sintético',active:true,eventCode:'101101',reasonCode:'2',textTemplate:'Pedido fundamentado pelos fatos específicos: {{detalhe}}.'};
   custom=(await value('SELECT public.save_nfse_cancellation_model_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
    [id(10),id(1),'PRODUCAO','2026-11',id(800),null,null,definition])).data.model;
   await server();await create(53);const frozen=await call(53,'PREVIEW',selection(custom.id));
   await user();await value('SELECT public.save_nfse_cancellation_model_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
    [id(10),id(1),'PRODUCAO','2026-11',id(801),custom.id,1,{...definition,active:false}]);
   await server();const replay=await call(53,'PREVIEW',selection(custom.id));assert.equal(replay.justification,frozen.justification);
   assert.equal(replay.cancellationModel.version,1);await deny(call(53,'PREVIEW',selection(custom.id,'Outros fatos.')),'40001');
   await deny(call(53,'PREVIEW',selection(custom.id,selection().detail,2)),'40001');
   await create(54);await deny(call(54,'PREVIEW',selection(custom.id)),'40001');
   await db.query('UPDATE private.nfse_cancellation_models SET polo_id=$1 WHERE id=$2',[id(2),custom.id]);
   await deny(call(54,'PREVIEW',selection(custom.id,selection().detail,2)),'40001');
   await deny(db.query("UPDATE private.nfse_individual_cancellations SET cancellation_model_detail='alterado' WHERE id=$1",[frozen.cancelPreviewId]),'55000');
  });
  await t.test('reason2 follows the same canonical preparation and original single dispatch lease',async()=>{
   const row=await prepare(51,selected);assert.equal(row.eventInput.reasonCode,'2');
   assert.equal((await call(51,'CLAIM',null,row.cancelPreviewId)).dispatch,true);
   assert.equal((await call(51,'CLAIM',null,row.cancelPreviewId)).dispatch,false);
  });
  await t.test('retry requires fresh specific404, same bytes and a two-minute wait; lease is additional and unique',async()=>{
   let input=await proof(legacy);await deny(call(50,'RETRY_CLAIM',input,legacy.cancelPreviewId),'40001');
   await db.query("UPDATE private.nfse_individual_cancellations SET updated_at=now()-interval '3 minutes' WHERE id=$1",[legacy.cancelPreviewId]);
   for(const patch of [{httpStatus:200},{probeCode:'UNKNOWN'},{signedEventSha256:'b'.repeat(64)},
    {checkedAt:new Date(Date.now()-120000).toISOString()}])await deny(call(50,'RETRY_CLAIM',{...input,...patch},legacy.cancelPreviewId),
      patch.httpStatus||patch.probeCode?'22023':'40001');
   input=await proof(legacy);const claimed=await call(50,'RETRY_CLAIM',input,legacy.cancelPreviewId);assert.equal(claimed.dispatch,true);
   assert.equal(claimed.cancelPreviewId,legacy.cancelPreviewId);assert.equal(claimed.signedEventXml,legacy.signedEventXml);
   assert.equal(claimed.state,'CANCELLATION_PENDING');assert.equal(claimed.retryUsed,true);
   assert.equal((await call(50,'RETRY_CLAIM',input,legacy.cancelPreviewId)).dispatch,false);
   await deny(call(50,'RETRY_CLAIM',{...input,retryRequestId:id(901)},legacy.cancelPreviewId),'40001');
   assert.equal(await value('SELECT count(*)::int value FROM private.nfse_cancellation_retry_leases'),1);
   const unchanged=await value('SELECT signed_event_xml value FROM private.nfse_individual_cancellations WHERE id=$1',[legacy.cancelPreviewId]);assert.equal(unchanged,legacy.signedEventXml);
   await deny(db.exec('DELETE FROM private.nfse_cancellation_retry_leases'),'55000');
  });
  await t.test('scope is reauthorized before retry replay and app roles cannot grant dispatch or edit the audit',async()=>{
   await db.exec('UPDATE public.test_authorization SET allowed=false');
   await deny(call(50,'RETRY_CLAIM',await proof(legacy),legacy.cancelPreviewId),'42501');
   await db.exec('UPDATE public.test_authorization SET allowed=true');await user();
   await deny(call(50,'READ',null,legacy.cancelPreviewId),'42501');
   for(const role of ['anon','authenticated','service_role'])assert.equal(await value(`SELECT has_table_privilege('${role}',
    'private.nfse_cancellation_retry_leases','SELECT,INSERT,UPDATE,DELETE') value`),false);
   assert.equal(await value("SELECT has_function_privilege('service_role','public.nfse_individual_cancellation_core(uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,jsonb)','EXECUTE') value"),false);
  });
 }finally{await db.close();}
});
