import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareTrustPayment,reserveTrustTitle,bindTrustTitle,confirmTrustBankPayment,trustId,trustPolo,trustTurma,value} from './ead_trust_payment.fixture.mjs';
const url=pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href;
const {PGlite}=await import(url),{pgcrypto}=await import(new URL('./contrib/pgcrypto.js',url).href);
const paid=(db,a)=>value(db,'select internal_academic.ead_has_confirmed_payment($1) value',[a.matriculaId]);
const blocked=(db,a)=>value(db,'select internal_academic.ead_trust_financial_blocked($1) value',[a.matriculaId]);
const grant=(db,a)=>value(db,'select public.ead_liberar_por_confianca($1) value',[a.matriculaId]);
const trust=(db,a)=>value(db,'select internal_academic.ead_has_trust_access($1) value',[a.matriculaId]);
const trustRow=async(db,a)=>{
 await db.exec("update test_caixa.access_state set role_name='authenticated'");
 try{return (await value(db,'select public.ead_get_turma_trust_access($1) value',[trustTurma]))
  .find(row=>row.matriculaId===a.matriculaId);}
 finally{await db.exec("update test_caixa.access_state set role_name='service_role'");}
};

test('trust uses actual managed financial identity, effective manual evidence and the current attempt only',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});let a,b,deadline;
 try{
  await prepareTrustPayment(db);
  a=await reserveTrustTitle(db,101);b=await reserveTrustTitle(db,102);
  await t.test('ATIVO, amount alone and backdated confirmation timestamps are not payment evidence',async()=>{
   await db.query("update public.matriculas set status='ATIVO' where id=$1",[a.matriculaId]);
   assert.equal(await paid(db,a),false);
   await db.query("update public.contas_receber set status='PAGO',valor_pago=99.9,data_pagamento=current_date where id=$1",[a.receivableId]);
   await db.query("update public.inscricoes_online set confirmado_em='2026-01-01' where id=$1",[a.inscricaoId]);
   assert.equal(await paid(db,a),false);
   await confirmTrustBankPayment(db,b);assert.equal(await paid(db,b),true);assert.equal(await paid(db,a),false);
   await db.query("update public.matriculas set status='PENDENTE' where id=$1",[a.matriculaId]);
  });
  await t.test('the real managed projection and exact Banese transaction produce canonical confirmation',async()=>{
   await confirmTrustBankPayment(db,a);
   assert.equal(await value(db,'select status value from public.matriculas where id=$1',[a.matriculaId]),'ATIVO');
   assert.equal(await paid(db,a),true);
   await db.query("update public.ead_checkout_attempts set state='EXPIRED' where id=$1",[a.attemptId]);
   assert.equal(await paid(db,a),false,'A stale expired attempt cannot manufacture a paid proof');
   await db.query("update public.ead_checkout_attempts set state='PAID' where id=$1",[a.attemptId]);
   await db.query('update public.payment_gateway_transactions set amount=100 where id=$1',[a.transactionId]);
   assert.equal(await paid(db,a),false);
   await db.query('update public.payment_gateway_transactions set amount=99.9 where id=$1',[a.transactionId]);
   await db.query("update public.contas_receber set gateway_settlement_evidence='{\"paymentCount\":\"invalid\"}' where id=$1",[a.receivableId]);
   assert.equal(await paid(db,a),false);
   await db.query("update public.contas_receber set gateway_settlement_evidence='{\"paymentCount\":1}' where id=$1",[a.receivableId]);
   await assert.rejects(()=>db.query('update public.inscricoes_online set matricula_id=$2 where id=$1',
    [a.inscricaoId,b.matriculaId]),e=>e.code==='PT409');
   assert.equal(await paid(db,a),true);
  });
  await t.test('effective manual payment events finish principal plus discount despite a canceled gateway',async()=>{
   await db.query("update public.contas_receber set gateway_status='CANCELED',valor_pago=90 where id=$1",[a.receivableId]);
   assert.equal(await paid(db,a),false);
   await db.query(`insert into public.financial_payment_events values($1,'RECEIVABLE',$2,$3,9990,3000,0,3000,null)`,
    [trustId(501),a.receivableId,'00000000-0000-0000-0000-000000000001']);
   assert.equal(await paid(db,a),false,'A partial payment cannot complete the trust condition');
   await db.query(`insert into public.financial_payment_events values($1,'RECEIVABLE',$2,$3,9990,6000,990,6000,null)`,
    [trustId(502),a.receivableId,'00000000-0000-0000-0000-000000000001']);
   assert.equal(await paid(db,a),true);
   await db.query('update public.financial_payment_events set reversed_at=now() where id=$1',[trustId(502)]);
   assert.equal(await paid(db,a),false);
   await db.query('update public.financial_payment_events set reversed_at=null,polo_id=$2 where id=$1',[trustId(502),trustId(999)]);
   assert.equal(await paid(db,a),false);
   await db.exec('delete from public.financial_payment_events');
  });
  await t.test('legacy manual settlement requires its own audit, confirmed cancellation and no reversal',async()=>{
   await db.query(`insert into public.receivable_manual_settlements(id,receivable_id,state,polo_id,completed_at,
    principal_cents,received_cents,requires_remote_cancellation) values($1,$2,'COMPLETED',$3,now(),9990,9000,true)`,
    [trustId(601),a.receivableId,trustPolo]);
   await db.query('update public.contas_receber set manual_settlement_id=$2 where id=$1',[a.receivableId,trustId(601)]);
   assert.equal(await paid(db,a),false);
   await db.query('update public.receivable_manual_settlements set remote_canceled_at=now() where id=$1',[trustId(601)]);
   assert.equal(await paid(db,a),true);
   await db.query('update public.receivable_manual_settlements set reversed_at=now() where id=$1',[trustId(601)]);
   assert.equal(await paid(db,a),false);
   await db.query('update public.contas_receber set manual_settlement_id=null where id=$1',[a.receivableId]);
  });
  await t.test('the closed rollout preserves study, activation blocks only a current terminal attempt and new grants',async()=>{
   a=await reserveTrustTitle(db,104);
   await db.query("update public.contas_receber set status='CANCELADO',gateway_status='CANCELED' where id=$1",[a.receivableId]);
   await db.query("update public.payment_gateway_transactions set remote_status='CANCELED' where id=$1",[a.transactionId]);
   await db.query("update public.ead_checkout_attempts set state='EXPIRED' where id=$1",[a.attemptId]);
   assert.equal(await blocked(db,a),true);
   deadline=await grant(db,a);assert.equal(await trust(db,a),true,'The default-false gate preserves the deployed study-only contract');
   assert.equal((await trustRow(db,a)).acessoTemporarioAtivo,true);
   await db.exec('update internal_academic.ead_trust_runtime_control set full_course_enabled=true');
   assert.equal(await trust(db,a),false);
   assert.equal((await trustRow(db,a)).acessoTemporarioAtivo,false);
   assert.equal((await grant(db,a)).getTime(),deadline.getTime(),'Existing grant never receives another deadline');
   const fresh=await reserveTrustTitle(db,103);
   await db.query("update public.contas_receber set status='CANCELADO' where id=$1",[fresh.receivableId]);
   await db.query("update public.ead_checkout_attempts set state='EXPIRED' where id=$1",[fresh.attemptId]);
   await assert.rejects(()=>grant(db,fresh),e=>e.code==='55000');
  });
  await t.test('an old terminal attempt cannot block a new OPEN purchase or extend the original deadline',async()=>{
   // Use the real reservation owner to create the next purchase identity.
   await db.query("update public.inscricoes_online set status='CANCELADO' where id=$1",[a.inscricaoId]);
   // The real reservation owner also requires the durable confirmed bank-close
   // record. The cancellation processor itself has its separate integration suite.
   await db.query(`insert into public.banese_ead_checkout_expiration_jobs(receivable_id,matricula_id,inscription_id,
    transaction_id,environment,state,snapshot,expected_receivable_updated_at,expected_transaction_updated_at,
    expected_inscription_updated_at,first_expiration_day,canceled_at,remote_status,attempt_id)
    select c.id,c.matricula_id,i.id,tx.id,'production','DONE',internal_contas.ead_expiration_identity(c.id),
     c.updated_at,tx.updated_at,i.updated_at,current_date,now(),'CANCELED',$2
    from public.contas_receber c join public.inscricoes_online i on i.receivable_id=c.id
    join public.payment_gateway_transactions tx on tx.receivable_id=c.id where c.id=$1`,[a.receivableId,a.attemptId]);
   const next=await value(db,`select public.ead_prepare_checkout_attempt($1,$2,$3,'banese_card','production','BOLETO',
    99.9,'2026-12-30','Compra EAD renovada',null,null) value`,[trustId(104),'00000000-0000-0000-0000-000000000022',trustId(2104)]);
   assert.equal(next.action,'CREATE');await bindTrustTitle(db,next,204);
   assert.equal(await value(db,'select state value from public.ead_checkout_attempts where id=$1',[next.attemptId]),'OPEN');
   assert.equal(next.matriculaId,a.matriculaId);assert.notEqual(next.receivableId,a.receivableId);
   const attempts=await db.query('select id,state,is_current from public.ead_checkout_attempts where matricula_id=$1',[next.matriculaId]);
   assert.equal(await blocked(db,next),false,JSON.stringify({action:next.action,attempts:attempts.rows}));
   assert.equal(await trust(db,next),true);
   assert.equal((await trustRow(db,next)).acessoTemporarioAtivo,true);
   assert.equal((await grant(db,next)).getTime(),deadline.getTime());
  });
  await t.test('private payment and financial-blocking helpers cannot be executed by browser or service roles',async()=>{
   for(const fn of ['ead_has_confirmed_payment','ead_trust_financial_blocked'])for(const role of ['anon','authenticated','service_role']){
    assert.equal(await value(db,`select has_function_privilege($1,'internal_academic.${fn}(uuid)','EXECUTE') value`,[role]),false);
   }
  });
 }finally{await db.close();}
});
