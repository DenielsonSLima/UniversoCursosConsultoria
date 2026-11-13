import assert from 'node:assert/strict';
import test from 'node:test';
import {manualDatabase,seedFinancial,settleTrustManual,grant,submit,state,scalar,delivery,validate,
 alumno,other,course,enrollment,unit,id} from './ead_trust_manual_payment.fixture.mjs';

const ledger=db=>scalar(db,'SELECT to_jsonb(i) value FROM internal_academic.ead_trust_certificate_issues i');
const issue=async db=>{await seedFinancial(db,{managed:true});await grant(db);await submit(db);return(await state(db)).certificates[0];};
const audit=db=>scalar(db,"SELECT jsonb_agg(event ORDER BY id) value FROM internal_academic.ead_trust_certificate_audit");
async function replayManual(db){
 await db.exec('BEGIN');
 try{await scalar(db,"SELECT internal_financial_payments.refresh_source('RECEIVABLE',$1) value",[id(1)]);
  await db.exec('COMMIT');}catch(error){await db.exec('ROLLBACK');throw error;}
}
async function expire(db){
 await db.exec(`UPDATE internal_academic.ead_trust_certificate_issues SET deadline=statement_timestamp()-interval '1 hour';
 UPDATE internal_academic.ead_trust_access_audit SET expires_at=statement_timestamp()-interval '1 hour',
  granted_at=statement_timestamp()-interval '25 hours';
 UPDATE public.matriculas SET acesso_temporario_ate=statement_timestamp()-interval '1 hour' WHERE id='${enrollment}';`);
}

test('a full effective manual receipt activates the trust enrollment once without changing its canceled bank identity or certificate',async()=>{
 const db=await manualDatabase();
 try{
  const cert=await issue(db),before=await state(db);
  await settleTrustManual(db,{principalCents:9000,paymentCents:9000,discountCents:1000});
  const result=await state(db),confirmed=await ledger(db);
  assert.equal(result.enrollment.status,'ATIVO');assert.equal(confirmed.state,'DEFINITIVE');
  assert.equal(await scalar(db,'SELECT internal_academic.ead_has_confirmed_payment($1) value',[enrollment]),true);
  assert.deepEqual(result.certificates,before.certificates);assert.deepEqual(result.documents,before.documents);
  assert.equal((await delivery(db,cert.id)).state,'DEFINITIVE');
  assert.equal((await validate(db,cert.codigo_validacao)).status,'ACTIVE');
  const account=await scalar(db,'SELECT to_jsonb(c) value FROM public.contas_receber c WHERE id=$1',[id(1)]);
  assert.equal(account.gateway_status,'CANCELED');assert.equal(account.gateway_boleto_nosso_numero,'NN-SYNTHETIC');
  assert.equal(Number(account.valor_pago),90);assert.equal(account.origem_pagamento,null,'The academic projection does not invent a bank settlement source');
  assert.equal(await scalar(db,'SELECT remote_status value FROM public.payment_gateway_transactions WHERE id=$1',[id(3)]),'CANCELED');
  await replayManual(db);
  assert.deepEqual(await ledger(db),confirmed,'Replaying the same receipt does not move the first-confirmed clock');
  assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.financial_payment_events'),1);
  assert.deepEqual((await state(db)).certificates,before.certificates);
  assert.deepEqual(await audit(db),['ISSUED_TEMPORARY','PAYMENT_CONFIRMED']);
 }finally{await db.close();}
});

for(const runCron of [false,true])test(`a late manual receipt creates exactly one new certificate code ${runCron?'after':'before'} persistent revocation`,async()=>{
 const db=await manualDatabase();
 try{
  const cert=await issue(db),original=(await state(db)).documents[0];
  await expire(db);
  assert.equal((await validate(db,cert.codigo_validacao)).status,'REVOKED');
  if(runCron)await scalar(db,'SELECT internal_academic.process_expired_ead_trust_certificates(100) value');
  await settleTrustManual(db);
  const result=await state(db),replacement=result.certificates[0],frozen=await ledger(db);
  assert.equal(result.enrollment.status,'ATIVO');assert.equal(replacement.id,cert.id);
  assert.notEqual(replacement.codigo_validacao,cert.codigo_validacao);assert.equal(frozen.state,'REISSUED');
  const old=result.documents.find(document=>document.codigo===cert.codigo_validacao);
  const next=result.documents.find(document=>document.codigo===replacement.codigo_validacao);
  assert.equal(old.status,'REVOGADO');assert.deepEqual(old.dados_emissao,original.dados_emissao);
  assert.deepEqual(next.dados_emissao,original.dados_emissao);
  assert.equal((await validate(db,cert.codigo_validacao)).status,'REVOKED');
  assert.equal((await validate(db,replacement.codigo_validacao)).status,'ACTIVE');
  assert.equal((await delivery(db,cert.id)).code,replacement.codigo_validacao);
  await replayManual(db);assert.deepEqual(await ledger(db),frozen);
  assert.equal((await state(db)).documents.length,2);
 }finally{await db.close();}
});

for(const scenario of ['partial','reversed','wrong-polo','review','cancelled'])test(`manual ${scenario} evidence cannot permanently release a trust enrollment or its certificate`,async()=>{
 const db=await manualDatabase();
 try{
  const cert=await issue(db);
  if(scenario==='review')await db.query("UPDATE public.ead_checkout_attempts SET state='PAID_REVIEW' WHERE id=$1",[id(4)]);
  if(scenario==='cancelled'){
   await db.query("UPDATE public.matriculas SET status='CANCELADO' WHERE id=$1",[enrollment]);
   await scalar(db,'SELECT internal_academic.process_expired_ead_trust_certificates(100) value');
  }
  await settleTrustManual(db,scenario==='partial'?{principalCents:4000,paymentCents:4000}:
   scenario==='reversed'?{reversed:true}:scenario==='wrong-polo'?{poloId:other}:{});
  assert.equal((await state(db)).enrollment.status,scenario==='cancelled'?'CANCELADO':'PENDENTE');
  assert.equal(await scalar(db,'SELECT internal_academic.ead_has_confirmed_payment($1) value',[enrollment]),false);
  assert.notEqual((await ledger(db)).state,'DEFINITIVE');assert.notEqual((await ledger(db)).state,'REISSUED');
  assert.equal((await state(db)).documents.length,1);
  assert.equal((await state(db)).certificates[0].codigo_validacao,cert.codigo_validacao);
  if(scenario==='cancelled')assert.equal((await validate(db,cert.codigo_validacao)).status,'REVOKED');
 }finally{await db.close();}
});

test('manual payment for another enrollment never promotes the certificate linked to this trust grant',async()=>{
 const db=await manualDatabase();
 try{
  await issue(db);const before=await state(db);
  await db.query('INSERT INTO public.matriculas(id,aluno_id,turma_id,status) VALUES($1,$2,$3,\'PENDENTE\')',
   [id(902),alumno,before.enrollment.turma_id]);
  await db.query('UPDATE public.contas_receber SET matricula_id=$1 WHERE id=$2',[id(902),id(1)]);
  await settleTrustManual(db);
  assert.equal((await state(db)).enrollment.status,'PENDENTE');
  assert.equal((await ledger(db)).state,'TEMPORARY');assert.deepEqual((await state(db)).certificates,before.certificates);
  assert.equal((await state(db)).certificates[0].curso_id,course);
  assert.equal((await state(db)).certificates[0].polo_id,unit);
 }finally{await db.close();}
});
