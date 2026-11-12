import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {id,scope,sql,installAutomaticReviewFixture} from './nfse_automatic_review.fixture.mjs';
const {PGlite}=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const denied=(promise,code='40001')=>assert.rejects(promise,error=>error.code===code);
const migrations=['20261112152151_nfse_unsigned_address_refresh_store.sql','20261112152203_nfse_unsigned_address_refresh_preview.sql',
  '20261112152213_nfse_unsigned_address_refresh_bridge.sql'];
test('multiuser read refresh prepare claim preserves creator and same fiscal identity',async t=>{
 const db=new PGlite();let docs=[],ops=[],actor=id(11),context=scope[0];
 const value=async(q,args=[])=>(await db.query(q,args)).rows[0].value;
 const preview=i=>value('SELECT private.nfse_queue_prepare_operation($1,$2,$3,$4,$5,$6,$7) value',
  [actor,context,scope[1],scope[2],scope[3],id(100+i),{source:{kind:'ACADEMIC_QUEUE',id:docs[i]}}]);
 const bridge=(i,action,input=null)=>value('SELECT public.nfse_individual_operation_internal($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
  [actor,context,scope[1],scope[2],scope[3],id(100+i),action,ops[i].previewId,input]);
 const rows=table=>value(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]') value FROM ${table} r`);
 try{
  await installAutomaticReviewFixture(db);
  await db.exec(`CREATE OR REPLACE FUNCTION private.reject_nfse_preparation_change() RETURNS trigger LANGUAGE plpgsql AS
    $$BEGIN RAISE EXCEPTION 'immutable' USING ERRCODE='55000';END$$;
    CREATE TRIGGER immutable_link BEFORE UPDATE OR DELETE ON private.nfse_queue_operation_links
      FOR EACH ROW EXECUTE FUNCTION private.reject_nfse_preparation_change();
    ALTER TABLE public.contas_receber ADD COLUMN cliente_id uuid;
    `);
  await db.exec(await sql('20261112012759_nfse_operation_service_location.sql'));
  await db.exec(await sql('20261112012806_nfse_prepared_service_location_guard.sql'));
  // Real canonical review, basis, PREPARE and CLAIM. Synthetic XML only; no network worker.
  const consumers=await sql('20261111121001_nfse_shared_model_consumers.sql');
  const start=consumers.indexOf('FUNCTION private.nfse_queue_operation_basis(');
  await db.exec('CREATE OR REPLACE '+consumers.slice(start,consumers.indexOf('$function$;',start)+12));
  await db.exec(`UPDATE private.nfse_models SET definition=jsonb_set(definition,'{peopleOptions,recipientAddressSource}','"FROM_PARTNER"');
   UPDATE private.nfse_models SET definition=definition||'{"serviceOptions":{"version":1,"countryCode":"BRA","municipalityCode":"2803401"}}';
   UPDATE public.parceiros SET endereco='RUA SINTÉTICA',bairro='CENTRO',cidade='CIDADE SINTÉTICA',uf='SE',cep='49000-000';
   UPDATE public.contas_receber SET origem_pagamento=CASE WHEN id='${id(200)}' THEN 'PROESC' ELSE 'BANESE' END;`);
  for(const [student,request]of [[30,90],[31,91]]){
   const prepared=await value('SELECT public.prepare_nfse_batch_secure($1,$2,$3,$4,$5,$6,$7,1,$8) value',
     [...scope,id(request),[`${id(20)}:${id(student)}`],id(60),'2026-11']);docs.push(prepared.data.documentIds[0]);
  }
  // Cover both prior provisional 00 and a genuinely missing number before S/N.
  await db.exec(`UPDATE public.parceiros SET numero='00' WHERE id='${id(30)}'`);
  await db.exec("SET test.role='service_role'");ops=[await preview(0),await preview(1)];
  const originalLinks=await rows('private.nfse_queue_operation_links');
  const originalReviews=await rows('private.nfse_fiscal_review_revisions');
  const finance=await rows('public.contas_receber');const preparations=await rows('private.nfse_queue_documents');
  for(const migration of migrations)await db.exec(await sql(migration));
  for(const migration of ['20261112171501_nfse_multiuser_operation_core.sql','20261112171502_nfse_multiuser_operation_bridge.sql','20261112171503_nfse_multiuser_unsigned_refresh.sql','20261112171504_nfse_multiuser_queue_preview.sql'])await db.exec(await sql(migration));
  actor=id(12);context=id(13);
  await db.exec(`INSERT INTO public.test_context VALUES('${context}','${actor}',true,false,ARRAY['${scope[1]}'::uuid]);SET test.actor='${actor}';`);
  await t.test('authorized second actor reads same operation without changing creator; wrong identities denied',async()=>{
   assert.equal((await bridge(0,'READ')).previewId,ops[0].previewId);
   const read=(patch={})=>value('SELECT public.nfse_individual_operation_internal($1,$2,$3,$4,$5,$6,$7,$8,$9) value',Object.values({actor,context,polo:scope[1],env:scope[2],month:scope[3],request:id(100),action:'READ',preview:ops[0].previewId,input:null,...patch}));
   for(const patch of [{context:id(99)},{polo:id(99)},{env:'HOMOLOGACAO'},{month:'2026-11'},{request:id(999)},{preview:id(999)}])await denied(read(patch),'42501');
   const owner=await value("SELECT jsonb_build_object('actor',actor_id,'context',context_id) value FROM private.nfse_individual_operations WHERE id=$1",[ops[0].previewId]);
   assert.deepEqual(owner,{actor:id(11),context:scope[0]});
  });

  await t.test('both paid sources refresh 00 or missing number to S/N without new operation or DPS number',async()=>{
   await db.exec("UPDATE public.parceiros SET numero='S/N'");
   for(let i=0;i<2;i++){
    const before=ops[i];const after=await preview(i);
    for(const field of ['previewId','requestId','number','series','issuedAt','state'])assert.equal(after[field],before[field]);
    assert.deepEqual(after.snapshot.command,before.snapshot.command);
    assert.equal(after.snapshot.recipient.address.number,'S/N');assert.equal(after.signedDpsXml,null);ops[i]=after;
   }
   assert.equal(await value('SELECT count(*)::int value FROM private.nfse_individual_operations'),2);
   assert.equal(await value('SELECT count(*)::int value FROM private.nfse_operation_address_revisions'),2);
   assert.deepEqual(await rows('private.nfse_queue_operation_links'),originalLinks);
   const revisions=await rows('private.nfse_fiscal_review_revisions');
   for(const old of originalReviews)assert.deepEqual(revisions.find(r=>r.id===old.id),old);
   assert.deepEqual(await rows('public.contas_receber'),finance);assert.deepEqual(await rows('private.nfse_queue_documents'),preparations);
  });
  await t.test('repeated refresh is idempotent and journal/link cannot be rewritten',async()=>{
   await Promise.all([preview(0),preview(0)]);
   assert.equal(await value('SELECT count(*)::int value FROM private.nfse_operation_address_revisions'),2);
   await denied(db.exec("UPDATE private.nfse_operation_address_revisions SET basis='{}'"),'55000');
   await denied(db.exec('DELETE FROM private.nfse_queue_operation_links'),'55000');
  });
  await t.test('expired retry renews the same identity and certificate changes do not refresh it',async()=>{
   await db.query("UPDATE private.nfse_individual_operations SET expires_at=now()-interval '1 minute' WHERE id=$1",[ops[1].previewId]);
   const renewed=await preview(1);assert.equal(renewed.previewId,ops[1].previewId);assert.equal(renewed.number,ops[1].number);
   assert(Date.parse(renewed.expiresAt)>Date.now());
   await db.exec("UPDATE private.nfse_certificates SET fingerprint=repeat('b',64)");await denied(preview(1));
   await db.exec("UPDATE private.nfse_certificates SET fingerprint=repeat('a',64)");
   assert.equal(await value('SELECT count(*)::int value FROM private.nfse_operation_address_revisions'),2);
  });
  await t.test('non-address facts fail closed and appended review rolls back with rejection',async()=>{
   const before=await rows('private.nfse_fiscal_review_revisions');
   await db.exec(`UPDATE public.parceiros SET nome='NOME ALTERADO' WHERE id='${id(30)}'`);
   await denied(preview(0));assert.deepEqual(await rows('private.nfse_fiscal_review_revisions'),before);
   await db.exec(`UPDATE public.parceiros SET nome='ALUNO SINTÉTICO',cidade='OUTRA CIDADE' WHERE id='${id(30)}'`);
   await denied(preview(0));await db.exec(`UPDATE public.parceiros SET cidade='CIDADE SINTÉTICA' WHERE id='${id(30)}'`);
   await db.exec(`UPDATE public.contas_receber SET valor_pago=99 WHERE id='${id(200)}'`);
   await denied(preview(0),'22023');await db.exec(`UPDATE public.contas_receber SET valor_pago=100 WHERE id='${id(200)}'`);
  });
  await t.test('stale worker cannot prepare after refresh; signed-first refresh is rejected',async()=>{
   const op=ops[0];const command=op.snapshot.command;const recipient=op.snapshot.recipient;
   const issuer=op.snapshot.issuer.cnpj.replace(/\D/g,'');
   const dps=`DPS28034012${issuer}${op.series}${op.number.padStart(15,'0')}`;
   const input={dpsId:dps,fiscalInput:{environment:'PRODUCAO',series:op.series,number:op.number,issuedAt:op.issuedAt,
    competence:command.competenceDate,issuer:{taxId:{type:'CNPJ',value:issuer}},
    recipient:{name:recipient.name,taxId:{type:'CPF',value:recipient.document},
     address:{street:'RUA SINTÉTICA',district:'CENTRO',postalCode:'49000000',number:''}},
    service:{municipalityCode:'2803401',nationalTaxCode:'080201',nbs:'122020000',description:op.snapshot.source.serviceDescription},
    values:{serviceAmount:command.amount}},signedDpsXml:`<DPS Id="${dps}"><Signature/></DPS>`};
   await denied(bridge(0,'PREPARE',input));input.fiscalInput.recipient.address.number='S/N';
   await bridge(0,'PREPARE',input);
   await db.exec(`UPDATE public.parceiros SET numero='00' WHERE id='${id(30)}'`);await denied(preview(0));
   assert.equal(await value('SELECT count(*)::int value FROM private.nfse_operation_address_revisions'),2);
   await db.exec(`UPDATE public.parceiros SET numero='S/N' WHERE id='${id(30)}'`);
   assert.equal((await bridge(0,'CLAIM')).dispatch,true);
   assert.notEqual((await bridge(0,'CLAIM')).dispatch,true);
   const sent=await preview(0);assert.equal(sent.state,'PROCESSING');
   await db.exec(`UPDATE public.parceiros SET numero='99' WHERE id='${id(30)}'`);
   assert.deepEqual(await preview(0),sent);
  });
  await t.test('audit records real second executor while original creator stays unchanged',async()=>{
   const entries=await rows('private.nfse_operation_actor_audit');
   assert(entries.some(r=>r.action==='CLAIM'&&r.dispatch===true));
   assert(entries.every(r=>r.actor_id===actor&&r.context_id===context));
   assert.equal(entries.filter(r=>r.action==='CLAIM'&&r.dispatch===true).length,1);
   assert.equal(await value("SELECT bool_and(actor_id=$1 AND context_id=$2) value FROM private.nfse_individual_operations",[id(11),scope[0]]),true);
   await denied(db.exec("UPDATE private.nfse_operation_actor_audit SET action='FINISH'"),'55000');
  });
  await t.test('authorization still precedes refresh/replay and private table has no client grants',async()=>{
   await db.exec('UPDATE public.test_context SET allowed=false');await denied(preview(1),'42501');
   assert.equal(await value("SELECT has_table_privilege('authenticated','private.nfse_operation_address_revisions','SELECT') value"),false);
  });
 }finally{await db.close();}
});
