import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { id,scope,sql,installAutomaticReviewFixture } from './nfse_automatic_review.fixture.mjs';
const {PGlite}=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const denied=(promise,code='22023')=>assert.rejects(promise,error=>error.code===code);
test('academic issue validates canonical facts automatically without claiming a human review',async t=>{
  const db=new PGlite();let documentId;let operation;
  const value=async(query,args=[])=>(await db.query(query,args)).rows[0].value;
  const get=()=>value('SELECT public.get_nfse_fiscal_review_secure($1,$2,$3,$4,$5,NULL) value',[...scope,documentId]);
  const preview=(request=100,doc=documentId,context=scope[0])=>value('SELECT private.nfse_queue_prepare_operation($1,$2,$3,$4,$5,$6,$7) value',
    [id(11),context,scope[1],scope[2],scope[3],id(request),{source:{kind:'ACADEMIC_QUEUE',id:doc}}]);
  const finance=()=>value(`SELECT jsonb_build_object('titles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.contas_receber r),
    'reservations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY receipt_id) FROM private.nfse_receipt_reservations r),
    'preparations',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM private.nfse_queue_documents q)) value`);
  const edit=(request,review,model=id(60))=>value('SELECT public.validate_nfse_fiscal_review_secure($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [...scope,documentId,id(request),review.revision,review.basisToken,model,review.service.modelVersion]);
  try{
    await installAutomaticReviewFixture(db);
    await t.test('new preview and optional editor acquire the same review mutex before the academic scope',async()=>{
      const source=await sql('20261112032034_nfse_automatic_review_queue_preview.sql');
      const create=source.slice(source.indexOf("IF FOUND THEN RAISE EXCEPTION 'A preparação já possui uma operação fiscal."));
      const requestLock=create.indexOf("hashtextextended('nfse-fiscal-review-request:'");
      const worker=create.indexOf('PERFORM private.validate_nfse_queue_fiscal_review');
      const academic=create.indexOf("hashtextextended('nfse-academic-scope:'");
      assert(requestLock>=0&&requestLock<worker&&worker<academic);
      const helper=await sql('20261112032026_nfse_automatic_fiscal_review.sql');
      assert(helper.indexOf("hashtextextended('nfse-fiscal-review-request:'")<helper.indexOf("hashtextextended('nfse-academic-scope:'"));
      assert(!source.slice(0,source.indexOf("IF FOUND THEN RAISE EXCEPTION 'A preparação já possui uma operação fiscal.")).includes('PERFORM private.validate_nfse_queue_fiscal_review'));
    });
    for(const [student,request]of [[30,90],[31,91]]){
      const prepared=await value('SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,1,$8) value',
        [...scope,id(request),[`${id(20)}:${id(student)}`],id(60),'2026-11']);
      if(student===30)documentId=prepared.data.documentIds[0];
    }
    const before=await finance();
    await t.test('a new preview creates an append-only system revision, keeping payment day, source, model and finance',async()=>{
      const initial=(await get()).data;assert.equal(initial.reviewStatus,'NOT_REVIEWED');
      assert(initial.checks.every(x=>!['RECIPIENT_CONFIRMATION_REQUIRED','COMPETENCE_REQUIRED','SERVICE_DATE_REQUIRED'].includes(x.code)));
      await db.exec("SET test.role='service_role'");operation=await preview();
      assert.equal(operation.state,'PREVIEWED');assert.equal(operation.signedDpsXml,null);
      assert.equal(operation.snapshot.command.competenceDate,'2026-11-09');
      assert.equal(operation.snapshot.command.serviceDate,'2026-11-09');
      const row=await value('SELECT to_jsonb(r) value FROM private.nfse_fiscal_review_revisions r WHERE document_id=$1',[documentId]);
      assert.equal(row.definition.validation.source,'SYSTEM_VALIDATED');assert.equal(row.definition.validation.humanConfirmed,false);
      assert.equal(row.definition.recipient.source,'SELECTED_PREPARATION');assert.equal('confirmed' in row.definition.recipient,false);
      assert.equal('classificationConfirmed' in row.definition,false);assert.equal('receiptsConfirmed' in row.definition,false);
      assert.deepEqual(await finance(),before);
      const read=(await get()).data;assert.equal(read.reviewComplete,true);assert.equal(read.validationSource,'SYSTEM_VALIDATED');
      assert.equal(read.recipient.confirmed,false);assert.match(read.checks.find(x=>x.code==='REVIEW_CONFIRMED').message,/automaticamente/);
    });
    await t.test('historical replay precedes mutable source lookup and cannot switch scope or source',async()=>{
      await db.exec("SET test.source_blocked='true'");assert.deepEqual(await preview(),operation);
      await denied(preview(100,documentId,id(99)),'42501');
      const other=await value('SELECT id value FROM private.nfse_queue_documents WHERE id<>$1',[documentId]);
      await denied(preview(100,other));await db.exec("SET test.source_blocked='false'");
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_fiscal_review_revisions'),1);
    });
    await t.test('a later preview guard rolls back an automatic revision together with the operation',async()=>{
      const other=await value('SELECT id value FROM private.nfse_queue_documents WHERE id<>$1',[documentId]);
      await db.exec("UPDATE private.nfse_certificates SET expires_at=now()-interval '1 minute'");
      await denied(preview(101,other));
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_fiscal_review_revisions'),1);
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_individual_operations'),1);
      await db.exec("UPDATE private.nfse_certificates SET expires_at=now()+interval '1 year'");
      assert.deepEqual(await finance(),before);
    });
    await t.test('optional editor has its own authorized immutable intent, no fake checkboxes and stable replay',async()=>{
      await db.exec("SET test.role='authenticated'");const current=(await get()).data;
      const result=await edit(110,current);assert.equal(result.data.revision,2);
      assert.match(result.data.message,/prévia anterior.*bloqueada.*prepare novamente/);
      await db.exec("SET test.source_blocked='true'");assert.deepEqual(await edit(110,current),result);
      await denied(edit(110,{...current,revision:2}));await db.exec("SET test.source_blocked='false'");
      const newest=(await get()).data;assert.equal(newest.validationSource,'SYSTEM_VALIDATED');
      assert.equal(newest.recipient.confirmed,false);assert.deepEqual(await finance(),before);
    });
    await t.test('an already valid manual revision keeps its original provenance, definition and bytes',async()=>{
      const other=await value('SELECT id value FROM private.nfse_queue_documents WHERE id<>$1',[documentId]);
      const manual=(await value('SELECT public.get_nfse_fiscal_review_secure($1,$2,$3,$4,$5,NULL) value',[...scope,other])).data;
      const definition={modelId:id(60),modelVersion:1,recipient:{mode:'STUDENT',confirmed:true},
        competenceDate:'2026-11-08',serviceDate:'2026-11-08',classificationConfirmed:true,receiptsConfirmed:true};
      await value('SELECT public.save_nfse_fiscal_review_secure($1,$2,$3,$4,$5,$6,0,$7,$8) value',
        [...scope,other,id(120),manual.basisToken,definition]);
      const saved=await value('SELECT to_jsonb(r) value FROM private.nfse_fiscal_review_revisions r WHERE document_id=$1',[other]);
      await db.exec("SET test.role='service_role'");const result=await preview(121,other);
      assert.equal(result.snapshot.source.reviewId,saved.id);
      assert.deepEqual(await value('SELECT to_jsonb(r) value FROM private.nfse_fiscal_review_revisions r WHERE document_id=$1',[other]),saved);
      const read=(await value('SELECT public.get_nfse_fiscal_review_secure($1,$2,$3,$4,$5,NULL) value',[...scope,other])).data;
      assert.equal(read.validationSource,'MANUAL');assert.equal(read.recipient.confirmed,true);
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_fiscal_review_revisions'),3);
      await db.exec("SET test.role='authenticated'");
    });
    await t.test('new validation fails closed after current source or selected model changes',async()=>{
      const current=(await get()).data;
      await db.query("UPDATE public.contas_receber SET valor_pago=99 WHERE id=$1",[id(200)]);
      await denied(edit(111,current));await db.query("UPDATE public.contas_receber SET valor_pago=100 WHERE id=$1",[id(200)]);
      await db.exec('UPDATE private.nfse_models SET version=version+1');await denied(edit(112,current),'40001');
      await db.exec('UPDATE private.nfse_models SET version=version-1');
      assert.equal(await value('SELECT count(*)::int value FROM private.nfse_fiscal_review_revisions'),3);
    });
    await t.test('actor scope is checked before replay and only the new public wrappers are exposed',async()=>{
      await db.exec('UPDATE public.test_context SET allowed=false');await denied(edit(110,{revision:1,basisToken:'a'.repeat(64),service:{modelVersion:1}}),'42501');
      await db.exec("SET test.role='service_role'");await denied(preview(),'42501');
      const grants=await value(`SELECT jsonb_build_object('app',has_function_privilege('authenticated','public.validate_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid,integer,text,uuid,integer)','EXECUTE'),
        'anon',has_function_privilege('anon','public.validate_nfse_fiscal_review_secure(uuid,uuid,text,text,uuid,uuid,integer,text,uuid,integer)','EXECUTE'),
        'worker',has_function_privilege('authenticated','private.validate_nfse_queue_fiscal_review(uuid,uuid,uuid,text,text,uuid,uuid,uuid,integer,integer,text)','EXECUTE'),
        'oldGet',has_function_privilege('authenticated','public.get_nfse_fiscal_review_core_20261112(uuid,uuid,text,text,uuid,uuid)','EXECUTE')) value`);
      assert.deepEqual(grants,{app:true,anon:false,worker:false,oldGet:false});
    });
  }finally{await db.close();}
});
