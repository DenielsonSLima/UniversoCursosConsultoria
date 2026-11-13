import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {id} from './nfse_service_receivables.fixture.mjs';
import {prepareServiceCancellation,service,cancelFiscal,call,value,proof,dispatchAmbiguous,bankProof} from './nfse_service_cancellation.fixture.mjs';
const {PGlite}=await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const args=j=>[j.jobId,j.leaseToken];
const status=(db,title)=>value(db,'SELECT status value FROM public.contas_receber WHERE id=$1',[title]);
const dto=(db,title)=>value(db,'SELECT private.nfse_service_receivable_projection($1) value',[title]);

test('confirmed fiscal cancellation cancels three local installments durably without Financeiro',async()=>{
  const db=new PGlite();try{
    await prepareServiceCancellation(db);const s=await service(db,500,{installments:3,amount:'100.01'});
    await cancelFiscal(db,s);await db.exec("SET test.receber='false';SET test.finance='false'");
    await db.query("UPDATE private.nfse_individual_cancellations SET state='CANCELLED' WHERE id=$1",[s.cancellation]);
    assert.equal(await value(db,'SELECT count(*)::int value FROM private.nfse_service_cancellation_jobs'),3);
    const before=await value(db,'SELECT count(*)::int value FROM net.synthetic_requests');
    for(let n=0;n<3;n++){
      const j=await call(db,'claim_nfse_service_cancellation_job_internal');
      assert.equal((await call(db,'get_nfse_service_cancellation_material_internal',args(j))).action,'LOCAL_CANCEL');
      const p=proof('LOCAL_CANCELLED');
      assert.deepEqual(await call(db,'complete_nfse_service_cancellation_job_internal',[...args(j),p]),{completed:true,receivableId:j.receivableId});
      assert.equal((await call(db,'complete_nfse_service_cancellation_job_internal',[...args(j),p])).completed,true);
      assert.equal(await status(db,j.receivableId),'CANCELADO');assert.equal((await dto(db,j.receivableId)).nfse_cancellation_state,'CANCELLED');
    }
    assert.equal(await call(db,'claim_nfse_service_cancellation_job_internal'),null);
    assert.equal(await value(db,'SELECT count(*)::int value FROM public.payment_gateway_transactions'),0);
    assert.equal(await value(db,'SELECT count(*)::int value FROM net.synthetic_requests')-before,2);
    assert.equal(await value(db,'SELECT sum(valor)::text value FROM public.contas_receber WHERE id=ANY($1::uuid[])',[s.titles]),'100.01');
  }finally{await db.close();}
});

test('fiscal cancellation fences an unstarted bank POST and keeps the other credit route isolated',async()=>{
  const db=new PGlite();try{
    await prepareServiceCancellation(db);const s=await service(db,501,{bolepix:true});
    const issue=await call(db,'claim_nfse_service_bolepix_job_internal');
    await call(db,'get_nfse_service_bolepix_material_internal',args(issue));
    await db.query(`UPDATE public.contas_receber SET gateway_boleto_nosso_numero='000004681',gateway_boleto_convenio='123',
      gateway_boleto_agencia='033' WHERE id=$1`,[issue.receivableId]);
    await cancelFiscal(db,s);const j=await call(db,'claim_nfse_service_cancellation_job_internal');
    assert.equal((await call(db,'get_nfse_service_cancellation_material_internal',args(j))).action,'LOCAL_CANCEL');
    await assert.rejects(call(db,'claim_banese_api_submission_attempt',[issue.receivableId,'production','123','033','000004681',20000,'2026-11-30',issue.leaseToken]),e=>e.code==='42501');
    await call(db,'complete_nfse_service_cancellation_job_internal',[...args(j),proof('LOCAL_CANCELLED')]);
    assert.equal(await value(db,'SELECT bank_our_number value FROM private.nfse_service_bolepix_jobs'),null);
    await assert.rejects(db.query('INSERT INTO internal_other_credit_cancellation.items VALUES($1)',[j.receivableId]),e=>e.code==='55000');
    await db.query(`INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria,tipo_lancamento)
      VALUES($1,$2,$3,'Outro crédito comum',10,'2026-11-30','PENDENTE','OUTROS_CREDITOS','OUTRO_CREDITO')`,[id(990),id(1),id(20)]);
    await db.query('INSERT INTO internal_other_credit_cancellation.items VALUES($1)',[id(990)]);
    assert.equal(await status(db,id(990)),'PENDENTE');
  }finally{await db.close();}
});

test('a local-only service cannot bypass its plan through the generic POST marker before or after cancellation',async()=>{
  const db=new PGlite();try{
    await prepareServiceCancellation(db);const s=await service(db,507,{bolepix:false});
    assert.equal(await value(db,'SELECT count(*)::int value FROM private.nfse_service_bolepix_jobs'),0);
    // The generic manual banking route can prepare a local title before its
    // cancellation consumer runs. Its existing shared API marker is the fence.
    await db.query(`UPDATE public.contas_receber SET gateway_provider='banese_card',gateway_environment='production',
      gateway_payment_method='BOLETO',gateway_status='CREATING',gateway_creation_token=$2,
      gateway_issuer_polo_id=$3,gateway_boleto_nosso_numero='000004681',gateway_boleto_convenio='123',
      gateway_boleto_agencia='033' WHERE id=$1`,[s.titles[0],id(995),id(1)]);
    const marker=[s.titles[0],'production','123','033','000004681',20000,'2026-11-30',id(995)];
    await assert.rejects(call(db,'claim_banese_api_submission_attempt',marker),e=>e.code==='42501');
    await cancelFiscal(db,s);
    await assert.rejects(call(db,'claim_banese_api_submission_attempt',marker),e=>e.code==='42501');
    assert.equal(await value(db,'SELECT gateway_submission_status value FROM public.contas_receber WHERE id=$1',[s.titles[0]]),null);
    assert.equal(await value(db,'SELECT count(*)::int value FROM public.payment_gateway_transactions'),0);
    await db.query(`INSERT INTO public.contas_receber(id,polo_id,cliente_id,descricao,valor,data_vencimento,status,categoria,tipo_lancamento,
      gateway_provider,gateway_environment,gateway_payment_method,gateway_status,gateway_creation_token,gateway_issuer_polo_id,
      gateway_boleto_nosso_numero,gateway_boleto_convenio,gateway_boleto_agencia)
      VALUES($1,$2,$3,'Outro crédito comum',20000,'2026-11-30','PENDENTE','OUTROS_CREDITOS','OUTRO_CREDITO',
        'banese_card','production','BOLETO','CREATING',$4,$2,'000004681','123','033')`,[id(996),id(1),id(20),id(997)]);
    assert.equal(await call(db,'claim_banese_api_submission_attempt',[id(996),'production','123','033','000004681',20000,'2026-11-30',id(997)]),true);
  }finally{await db.close();}
});

test('a late accepted POST remains audited while cancellation retries are GET-only and code5-confirmed',async()=>{
  const db=new PGlite();try{
    await prepareServiceCancellation(db);const s=await service(db,502,{bolepix:true});
    const {job:issue,material:issueMaterial}=await dispatchAmbiguous(db);await cancelFiscal(db,s);
    let j=await call(db,'claim_nfse_service_cancellation_job_internal');
    assert.equal((await call(db,'get_nfse_service_cancellation_material_internal',args(j))).action,'CANCEL_BANK');
    await db.exec("SET test.receber='false'");
    await assert.rejects(call(db,'begin_nfse_service_cancellation_bank_internal',args(j)),e=>e.code==='42501');
    await db.exec("SET test.receber='true'");
    await db.query(`INSERT INTO public.banese_reconciliation_queue(receivable_id,state,lease_until) VALUES($1,'LEASED',now()+interval '1 minute')`,[j.receivableId]);
    await assert.rejects(call(db,'begin_nfse_service_cancellation_bank_internal',args(j)),e=>e.code==='55P03');
    await db.exec("UPDATE public.banese_reconciliation_queue SET state='READY',lease_until=NULL");
    assert.deepEqual(await call(db,'begin_nfse_service_cancellation_bank_internal',args(j)),{started:true});
    await assert.rejects(call(db,'begin_nfse_service_cancellation_bank_internal',args(j)),e=>e.code==='40001');
    const intent=await value(db,'SELECT cancel_intent_at::text value FROM private.nfse_service_cancellation_jobs');
    await call(db,'fail_nfse_service_cancellation_job_internal',[...args(j),true,'TRANSPORT']);
    assert.equal(await call(db,'claim_nfse_service_cancellation_job_internal'),null);
    await db.exec("UPDATE private.nfse_service_cancellation_jobs SET next_check_at=now()-interval '1 second'");
    const stale=j;j=await call(db,'claim_nfse_service_cancellation_job_internal');
    assert.equal((await call(db,'get_nfse_service_cancellation_material_internal',args(j))).action,'OBSERVE_BANK');
    await assert.rejects(call(db,'begin_nfse_service_cancellation_bank_internal',args(j)),e=>e.code==='40001');
    const result=bankProof(issueMaterial.receivable.gateway_financial_terms);
    await assert.rejects(call(db,'complete_nfse_service_cancellation_job_internal',[...args(stale),result]),e=>e.code==='40001');
    for(const patch of [{situationCode:7},{paymentsCount:1},{nossoNumero:'999999999'},{financialTerms:{}},{identityValidated:false}]){
      await assert.rejects(call(db,'complete_nfse_service_cancellation_job_internal',[...args(j),{...result,...patch}]),e=>e.code==='40001');
      assert.equal(await status(db,j.receivableId),'PENDENTE');
    }
    await call(db,'complete_nfse_service_cancellation_job_internal',[...args(j),{...result,alreadyCanceled:true}]);
    const original={request:{NossoNumero:'000004681',ValorNominal:20000,DataVencimento:'2026-11-30'},
      creationResponse:{Id:'late-original-post'},pixPayload:'synthetic-pix',pixEncodedImage:'synthetic-image'};
    await call(db,'preserve_nfse_service_bolepix_creation_internal',[issue.jobId,issue.leaseToken,original]);
    assert.equal(await value(db,"SELECT creation_evidence#>>'{creationResponse,Id}' value FROM private.nfse_service_bolepix_jobs"),'late-original-post');
    assert.equal(await value(db,'SELECT count(*)::int value FROM public.payment_gateway_transactions'),1);
    assert.equal(await value(db,'SELECT remote_status value FROM public.payment_gateway_transactions'),'CANCELED');
    assert.equal(await status(db,j.receivableId),'CANCELADO');
    assert.equal(await value(db,'SELECT cancel_intent_at::text value FROM private.nfse_service_cancellation_jobs'),intent);
    assert.equal((await dto(db,j.receivableId)).nfse_cancellation_state,'CANCELLED');
  }finally{await db.close();}
});

test('partial history becomes explicit review while fully paid remains paid without a bank mutation',async()=>{
  const db=new PGlite();try{
    await prepareServiceCancellation(db);const partial=await service(db,503);
    await db.query('INSERT INTO public.financial_payment_events(id,source_kind,source_id,received_amount) VALUES($1,\'RECEIVABLE\',$2,20)',[id(991),partial.titles[0]]);
    await db.query("UPDATE public.contas_receber SET valor_pago=20,data_pagamento='2026-11-12' WHERE id=$1",[partial.titles[0]]);
    await assert.rejects(db.query("UPDATE public.contas_receber SET status='CANCELADO' WHERE id=$1",[partial.titles[0]]),e=>e.message.includes('PAYMENT_SOURCE_PROJECTION_MISMATCH'));
    await cancelFiscal(db,partial);let j=await call(db,'claim_nfse_service_cancellation_job_internal');
    await assert.rejects(call(db,'get_nfse_service_cancellation_material_internal',args(j)),e=>e.code==='55000'&&e.message.includes('PAYMENT_HISTORY'));
    await call(db,'fail_nfse_service_cancellation_job_internal',[...args(j),false,'PAYMENT_HISTORY']);
    assert.equal((await dto(db,j.receivableId)).nfse_cancellation_state,'REVIEW_REQUIRED');
    assert.equal((await dto(db,j.receivableId)).nfse_cancellation_reason,'PAYMENT_HISTORY');
    assert.equal(await status(db,j.receivableId),'PENDENTE');
    assert.equal(await value(db,'SELECT count(*)::int value FROM public.financial_payment_events'),1);
    const paid=await service(db,504);await db.query("UPDATE public.contas_receber SET status='PAGO',valor_pago=valor WHERE id=$1",[paid.titles[0]]);
    await cancelFiscal(db,paid);j=await call(db,'claim_nfse_service_cancellation_job_internal');
    assert.equal((await call(db,'get_nfse_service_cancellation_material_internal',args(j))).action,'PRESERVE_PAID');
    await call(db,'complete_nfse_service_cancellation_job_internal',[...args(j),proof('PAID')]);
    assert.equal(await status(db,j.receivableId),'PAGO');assert.equal((await dto(db,j.receivableId)).nfse_cancellation_state,'PAID');
    assert.equal(await value(db,'SELECT count(*)::int value FROM public.payment_gateway_transactions'),0);
  }finally{await db.close();}
});

test('malformed fiscal proof, wrong current scope, anonymous callers and stale retries cannot cancel',async()=>{
  const db=new PGlite();try{
    await prepareServiceCancellation(db);const bad=await service(db,505);await cancelFiscal(db,bad,{valid:false});
    assert.equal((await dto(db,bad.titles[0])).nfse_cancellation_state,'REVIEW_REQUIRED');
    assert.equal(await call(db,'claim_nfse_service_cancellation_job_internal'),null);
    const s=await service(db,506);await cancelFiscal(db,s);
    await db.exec("SET test.role='authenticated'");
    await assert.rejects(call(db,'claim_nfse_service_cancellation_job_internal'),e=>e.code==='42501');
    assert.equal(await value(db,"SELECT has_function_privilege('authenticated','public.complete_nfse_service_cancellation_job_internal(uuid,uuid,jsonb)','EXECUTE') value"),false);
    await db.exec("SET test.role='anon'");
    await assert.rejects(call(db,'claim_nfse_service_cancellation_job_internal'),e=>e.code==='42501');
    assert.equal(await value(db,"SELECT has_function_privilege('anon','public.begin_nfse_service_cancellation_bank_internal(uuid,uuid)','EXECUTE') value"),false);
    await db.exec("SET test.role='service_role'");const j=await call(db,'claim_nfse_service_cancellation_job_internal');
    await db.query('UPDATE public.test_context SET polos=ARRAY[$1::uuid]',[id(2)]);
    await assert.rejects(call(db,'get_nfse_service_cancellation_material_internal',args(j)),e=>e.code==='42501');
    assert.equal(await status(db,j.receivableId),'PENDENTE');
    await db.query('UPDATE public.test_context SET polos=ARRAY[$1::uuid]',[id(1)]);
    await db.exec("UPDATE private.nfse_service_cancellation_jobs SET created_at=now()-interval '8 days' WHERE state='LEASED'");
    await call(db,'fail_nfse_service_cancellation_job_internal',[...args(j),true,'TRANSPORT']);
    assert.equal((await dto(db,j.receivableId)).nfse_cancellation_state,'REVIEW_REQUIRED');
    assert.equal(await call(db,'claim_nfse_service_cancellation_job_internal'),null);
  }finally{await db.close();}
});
