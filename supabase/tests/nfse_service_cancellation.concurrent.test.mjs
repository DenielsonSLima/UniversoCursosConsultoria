import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {id} from './nfse_service_receivables.fixture.mjs';
import {prepareServiceCancellation,service,cancelFiscal,call,value,proof,dispatchAmbiguous,bankProof} from './nfse_service_cancellation.fixture.mjs';
const url=new URL(process.env.NFSE_TEST_DATABASE_URL);
if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash
  ||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/nfse_service_cancellation_test'){
  throw Error('A disposable local nfse_service_cancellation_test database is required');
}
const imported=await import(pathToFileURL(resolve(process.env.NFSE_PG_MODULE)).href);
const {Client}=imported.default??imported;
async function connect(name){
  const db=new Client({connectionString:url.href,application_name:name});await db.connect();
  db.exec=sql=>db.query(sql);return db;
}
const args=j=>[j.jobId,j.leaseToken];
async function setup(db){await db.exec(`SET test.actor='${id(11)}';SET test.polo='${id(1)}';
  SET test.finance='true';SET test.receber='true';SET test.role='service_role';SET statement_timeout='10s'`);}

test('PostgreSQL17: cancellation owns one lease, fences late POST and preserves concurrent actual payment',async t=>{
  const admin=await connect('cancel-fixture'),a=await connect('cancel-worker-a'),b=await connect('late-bank-return');
  try{
    const version=await value(admin,"SELECT current_setting('server_version_num')::int value");
    assert.ok(version>=170000&&version<180000,'This concurrency proof requires PostgreSQL17');
    await prepareServiceCancellation(admin);await setup(a);await setup(b);
    await t.test('SKIP LOCKED grants one cancellation job while old API evidence remains auditable',async()=>{
      const s=await service(admin,600,{bolepix:true});const {job:issue,material}=await dispatchAmbiguous(admin);
      await cancelFiscal(admin,s);
      await a.exec('BEGIN');const j=await call(a,'claim_nfse_service_cancellation_job_internal');
      assert.equal(await call(b,'claim_nfse_service_cancellation_job_internal'),null);
      assert.equal((await call(a,'get_nfse_service_cancellation_material_internal',args(j))).action,'CANCEL_BANK');
      const original={request:{NossoNumero:'000004681',ValorNominal:20000,DataVencimento:'2026-11-30'},
        creationResponse:{Id:'original-late-post'},pixPayload:'synthetic-pix',pixEncodedImage:'synthetic-image'};
      await assert.rejects(call(b,'preserve_nfse_service_bolepix_creation_internal',[issue.jobId,issue.leaseToken,original]),e=>e.code==='55P03');
      await call(a,'begin_nfse_service_cancellation_bank_internal',args(j));
      await call(a,'complete_nfse_service_cancellation_job_internal',[...args(j),bankProof(material.receivable.gateway_financial_terms)]);
      await a.exec('COMMIT');
      await call(b,'preserve_nfse_service_bolepix_creation_internal',[issue.jobId,issue.leaseToken,original]);
      assert.equal(await value(admin,"SELECT creation_evidence#>>'{creationResponse,Id}' value FROM private.nfse_service_bolepix_jobs"),'original-late-post');
      assert.equal(await value(admin,'SELECT status value FROM public.contas_receber WHERE id=$1',[j.receivableId]),'CANCELADO');
      assert.equal(await value(admin,'SELECT count(*)::int value FROM public.payment_gateway_transactions'),1);
      await assert.rejects(call(b,'claim_banese_api_submission_attempt',[j.receivableId,'production','123','033','000004681',20000,'2026-11-30',issue.leaseToken]));
    });
    await t.test('payment row lock wins over a stale local-cancel snapshot and no paid evidence is erased',async()=>{
      const s=await service(admin,601);await cancelFiscal(admin,s);
      const j=await call(b,'claim_nfse_service_cancellation_job_internal');
      assert.equal((await call(b,'get_nfse_service_cancellation_material_internal',args(j))).action,'LOCAL_CANCEL');
      await a.exec('BEGIN');await a.query("UPDATE public.contas_receber SET status='PAGO',valor_pago=valor,data_pagamento='2026-11-12' WHERE id=$1",[j.receivableId]);
      await assert.rejects(call(b,'complete_nfse_service_cancellation_job_internal',[...args(j),proof('LOCAL_CANCELLED')]),e=>e.code==='55P03');
      await a.exec('COMMIT');
      await assert.rejects(call(b,'complete_nfse_service_cancellation_job_internal',[...args(j),proof('LOCAL_CANCELLED')]),e=>e.code==='40001');
      assert.equal((await call(b,'get_nfse_service_cancellation_material_internal',args(j))).action,'PRESERVE_PAID');
      await call(b,'complete_nfse_service_cancellation_job_internal',[...args(j),proof('PAID')]);
      const paid=await value(admin,'SELECT to_jsonb(c) value FROM public.contas_receber c WHERE id=$1',[j.receivableId]);
      assert.equal(paid.status,'PAGO');assert.equal(Number(paid.valor_pago),20000);assert.equal(paid.data_pagamento,'2026-11-12');
      assert.equal(await value(admin,'SELECT outcome value FROM private.nfse_service_cancellation_jobs WHERE id=$1',[j.jobId]),'PAID');
    });
  }finally{
    await Promise.all([a.query('ROLLBACK'),b.query('ROLLBACK')]);
    await Promise.all([a.end(),b.end(),admin.end()]);
  }
});
