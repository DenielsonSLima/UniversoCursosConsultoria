import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { id,scope,sql,installAutomaticReviewFixture } from './nfse_automatic_review.fixture.mjs';
const {PGlite}=await import(pathToFileURL(process.argv[2]));
const db=new PGlite();
const value=async(query,args=[])=>(await db.query(query,args)).rows[0].value;
await installAutomaticReviewFixture(db);
await db.exec(`CREATE SCHEMA internal_finance;
 ALTER TABLE public.parceiros ADD COLUMN nome_fantasia text;
 CREATE TABLE private.nfse_partner_service_requests(actor_id uuid,request_id uuid,payload jsonb,response jsonb);
 ALTER TABLE private.nfse_partner_services ADD COLUMN partner_snapshot jsonb,ADD COLUMN receivable_action text,ADD COLUMN created_by uuid;
 CREATE TABLE private.nfse_academic_cancellation_releases(document_id uuid);
 CREATE FUNCTION private.nfse_academic_receipt_claim_active(p_document_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM private.nfse_queue_removals WHERE document_id=p_document_id)
 AND NOT EXISTS(SELECT 1 FROM private.nfse_academic_cancellation_releases WHERE document_id=p_document_id); $$;
 UPDATE private.nfse_models SET definition=definition||'{"modelType":"ALUNO"}'::jsonb;
`);
await db.exec(await sql('20261112015247_nfse_academic_description_optional_installment.sql'));
await db.exec(`CREATE OR REPLACE FUNCTION private.reject_nfse_preparation_change() RETURNS trigger LANGUAGE plpgsql AS
 $$BEGIN RAISE EXCEPTION 'immutable' USING ERRCODE='55000';END$$;
 ALTER TABLE public.contas_receber ADD COLUMN cliente_id uuid;`);
for (const name of ['20261112012759_nfse_operation_service_location.sql','20261112012806_nfse_prepared_service_location_guard.sql',
 '20261112152151_nfse_unsigned_address_refresh_store.sql','20261112152203_nfse_unsigned_address_refresh_preview.sql',
 '20261112152213_nfse_unsigned_address_refresh_bridge.sql','20261112171501_nfse_multiuser_operation_core.sql',
 '20261112171502_nfse_multiuser_operation_bridge.sql','20261112171503_nfse_multiuser_unsigned_refresh.sql',
 '20261112171504_nfse_multiuser_queue_preview.sql']) await db.exec(await sql(name));

for (const name of ['0_nfse_model_period_contract','1_nfse_model_type_save','2_nfse_model_type_guards','3_nfse_service_period_prepare','4_nfse_known_model_classification']) {
 await db.exec(await sql(`2026111220300${name}.sql`));
}
const acl=await value(`SELECT jsonb_build_object(
 'coreAuth',has_function_privilege('authenticated','public.save_nfse_model_core_20261112(uuid,uuid,text,text,uuid,uuid,integer,jsonb)','EXECUTE'),
 'prepareAnon',has_function_privilege('anon','public.prepare_nfse_batch_secure(uuid,uuid,text,text,uuid,text[],uuid,integer,text)','EXECUTE'),
 'prepareAuth',has_function_privilege('authenticated','public.prepare_nfse_batch_secure(uuid,uuid,text,text,uuid,text[],uuid,integer,text)','EXECUTE'),
 'basisAuth',has_function_privilege('authenticated','private.nfse_queue_operation_basis(text,uuid,uuid,text,text)','EXECUTE')) value`);
assert.deepEqual(acl,{coreAuth:false,prepareAnon:false,prepareAuth:true,basisAuth:false});
const before=await value(`SELECT jsonb_agg(to_jsonb(c) ORDER BY id) value FROM public.contas_receber c`);
const prepare=(request=90,student=30,model=60)=>value('SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,1,$8) value',
 [...scope,id(request),[`${id(20)}:${id(student)}`],id(model),'2026-11']);
await db.exec(`INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
 SELECT '${id(61)}',polo_id,environment,jsonb_set(definition,'{modelType}','"AMBOS"'),created_by,updated_by FROM private.nfse_models WHERE id='${id(60)}';`);
const bothAcademic=await prepare(92,31,61);
assert.equal(bothAcademic.data.documentCount,1);
const bothService=await value('SELECT public.save_nfse_partner_service_secure($1,$2,$3,$4,$5,$6) value',
 [...scope,id(93),{partnerId:id(31),modelId:id(61),modelVersion:1,serviceDate:'2026-12-01',serviceDescription:'SERVIÇOS EDUCACIONAIS',amount:'50.00'}]);
assert.ok(bothService.data.id,'same Ambos model works in services with common literal content');
await db.exec(`UPDATE private.nfse_models SET definition=jsonb_set(definition,'{serviceDescription}','"Texto {{periodo}}"') WHERE id='${id(61)}';`);
await assert.rejects(prepare(94,31,61),/sem período manual/);
const prepared=await prepare();
assert.deepEqual(await prepare(),prepared);
const documentId=prepared.data.documentIds[0];
const facts=await value('SELECT private.nfse_fiscal_review_basis($1,$2) value',[documentId,id(60)]);
assert.equal(facts.issues.includes('MODEL_SERVICE_NOT_APPROVED'),false);
await db.exec("SET test.role='service_role'");
const operation=await value('SELECT private.nfse_queue_prepare_operation($1,$2,$3,$4,$5,$6,$7) value',
 [id(11),...scope,id(100),{source:{kind:'ACADEMIC_QUEUE',id:documentId}}]);
assert.equal(operation.state,'PREVIEWED');assert.equal(operation.signedDpsXml,null);
const oldSnapshot=await value('SELECT snapshot value FROM private.nfse_individual_operations WHERE id=$1',[operation.previewId]);
await db.exec(`UPDATE private.nfse_models SET definition=jsonb_set(definition,'{modelType}','"SERVICO"'),version=version+1 WHERE id='${id(60)}'`);
const changed=await value('SELECT private.nfse_fiscal_review_basis($1,$2) value',[documentId,id(60)]);
assert.equal(changed.issues.includes('MODEL_SERVICE_NOT_APPROVED'),true);
await assert.rejects(value('SELECT private.nfse_queue_operation_basis($1,$2,$3,$4,$5) value',
 ['ACADEMIC_QUEUE',documentId,scope[1],scope[2],scope[3]]));
assert.deepEqual(await value('SELECT snapshot value FROM private.nfse_individual_operations WHERE id=$1',[operation.previewId]),oldSnapshot);
await db.exec(`UPDATE private.nfse_models SET version=1 WHERE id='${id(60)}'; SET test.role='authenticated';`);
await assert.rejects(prepare(91,31),/tipo Alunos/);
assert.deepEqual(await value(`SELECT jsonb_agg(to_jsonb(c) ORDER BY id) value FROM public.contas_receber c`),before);
await db.close();
console.log('PASS: all five migrations applied locally; academic prepare/replay, review basis, unsigned preview, type mismatch, immutable snapshot and finance preservation');
