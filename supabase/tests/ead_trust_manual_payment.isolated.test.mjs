import assert from 'node:assert/strict';
import test from 'node:test';
import {manualDatabase,settleTrustManual,seedFinancial,grant,submit,state,scalar,enrollment,id,unit,
 source,manualMigration} from './ead_trust_manual_payment.fixture.mjs';

const own=db=>scalar(db,'SELECT internal_academic.ead_has_own_trust_manual_payment($1) value',[id(1)]);
const certificateState=db=>scalar(db,'SELECT state value FROM internal_academic.ead_trust_certificate_issues');
const academicState=db=>scalar(db,`SELECT jsonb_build_object(
 'enrollment',(SELECT status FROM public.matriculas WHERE id=$1),
 'inscription',(SELECT status FROM public.inscricoes_online WHERE id=$2),
 'attempt',(SELECT state FROM public.ead_checkout_attempts WHERE id=$3),
 'bank',(SELECT gateway_status FROM public.contas_receber WHERE id=$4),
 'transaction',(SELECT remote_status FROM public.payment_gateway_transactions WHERE id=$5)) value`,
 [enrollment,id(2),id(4),id(1),id(3)]);

test('a paid amount with null bank evidence cannot pass the real managed academic trigger',async()=>{
 const db=await manualDatabase();
 try{
  await seedFinancial(db,{managed:true});await grant(db);
  await db.query(`UPDATE public.contas_receber SET status='PAGO',valor_pago=100,data_pagamento=CURRENT_DATE,
   gateway_status=NULL,origem_pagamento=NULL WHERE id=$1`,[id(1)]);
  assert.equal(await own(db),false);
  await assert.rejects(db.query("UPDATE public.inscricoes_online SET status='PAGO' WHERE id=$1",[id(2)]),e=>e.code==='PT409');
  assert.equal((await academicState(db)).enrollment,'PENDENTE');
 }finally{await db.close();}
});

for(const managed of [true,false])for(const issueCertificate of [false,true])test(
 `integral own manual ledger activates ${managed?'managed':'legacy'} trust ${issueCertificate?'with':'without'} certificate in the same transaction`,async()=>{
 const db=await manualDatabase();
 try{
  await seedFinancial(db,{managed});await grant(db);if(issueCertificate)await submit(db);
  await settleTrustManual(db);
  const projected=await academicState(db);
  assert.equal(projected.enrollment,'ATIVO');assert.equal(projected.inscription,'PAGO');
  assert.equal(projected.bank,'CANCELED');assert.equal(projected.transaction,'CANCELED');
  if(managed)assert.equal(projected.attempt,'PAID');
  if(issueCertificate)assert.equal(await certificateState(db),'DEFINITIVE');
  else assert.equal((await state(db)).certificates.length,0);
 }finally{await db.close();}
});

test('partial, reversed, foreign-polo and unconfirmed-bank evidence cannot activate trust',async()=>{
 for(const input of [{principalCents:5000,paymentCents:5000},{reversed:true},{poloId:id(999)}]){
  const db=await manualDatabase();
  try{
   await seedFinancial(db,{managed:true});await grant(db);await submit(db);
   await settleTrustManual(db,input);
   assert.equal(await own(db),false);assert.equal((await academicState(db)).enrollment,'PENDENTE');
   assert.equal(await certificateState(db),'TEMPORARY');
  }finally{await db.close();}
 }
 const db=await manualDatabase();
 try{
  await seedFinancial(db,{managed:true});await grant(db);
  await db.exec('BEGIN');
  await db.query(`INSERT INTO public.financial_payment_events VALUES($1,'RECEIVABLE',$2,NULL,$3,10000,10000,0,10000,CURRENT_DATE,now())`,[id(901),id(1),unit]);
  await scalar(db,"SELECT internal_financial_payments.refresh_source('RECEIVABLE',$1) value",[id(1)]);
  await db.exec('COMMIT');
  assert.equal(await own(db),false);assert.equal((await academicState(db)).enrollment,'PENDENTE');
 }finally{await db.close();}
});

test('own completed manual-settlement audit is accepted without inventing a paid bank transaction',async()=>{
 const db=await manualDatabase();
 try{
  await seedFinancial(db,{managed:true});await grant(db);
  await db.exec('BEGIN');
  await db.query(`INSERT INTO public.receivable_manual_settlements(id,receivable_id,polo_id,state,completed_at,
   principal_cents,received_cents,requires_remote_cancellation,remote_canceled_at)
   VALUES($1,$2,$3,'COMPLETED',now(),10000,9000,true,now())`,[id(951),id(1),unit]);
  await db.query("UPDATE public.payment_gateway_transactions SET remote_status='CANCELED' WHERE id=$1",[id(3)]);
  await db.query(`UPDATE public.contas_receber SET status='PAGO',valor_pago=90,data_pagamento=CURRENT_DATE,
   gateway_status='CANCELED',manual_settlement_id=$2 WHERE id=$1`,[id(1),id(951)]);
  await db.exec('COMMIT');
  assert.equal(await own(db),true);assert.equal((await academicState(db)).enrollment,'ATIVO');
  assert.equal((await academicState(db)).transaction,'CANCELED');
 }finally{await db.close();}
});

test('manual confirmation remains bound to its audit, current attempt, exact inscription, transaction and academic polo',async()=>{
 for(const [label,change] of [
  ['missing audit',null],
  ['old purchase',"UPDATE public.ead_checkout_attempts SET is_current=false"],
  ['another inscription student',"UPDATE public.inscricoes_online SET aluno_id='99999999-9999-4999-8999-999999999999'"],
  ['another inscription enrollment',"UPDATE public.inscricoes_online SET matricula_id='99999999-9999-4999-8999-999999999999'"],
  ['another gateway inscription',"UPDATE public.payment_gateway_transactions SET inscricao_online_id='99999999-9999-4999-8999-999999999999'"],
  ['another gateway identity',"UPDATE public.payment_gateway_transactions SET remote_payment_id='FOREIGN-SYNTHETIC'"],
  ['different payment amount',"UPDATE public.payment_gateway_transactions SET amount=99"],
  ['conflicting gateway environment',"UPDATE public.inscricoes_online SET gateway_environment='FOREIGN-SYNTHETIC'"],
  ['remote title disguised as local',"UPDATE public.contas_receber SET gateway_provider='local'"],
  ['another financial polo',"UPDATE public.contas_receber SET polo_id='99999999-9999-4999-8999-999999999999'"]
 ]){
  const db=await manualDatabase();
  try{
   await seedFinancial(db,{managed:true});if(change!==null)await grant(db);
   if(change)await db.exec(change);
   await settleTrustManual(db);
   assert.equal(await own(db),false,label);
   assert.equal(await scalar(db,'SELECT internal_academic.ead_has_confirmed_payment($1) value',[enrollment]),false,label);
   assert.equal((await academicState(db)).enrollment,'PENDENTE',label);
  }finally{await db.close();}
 }
});

test('legacy confirmation and exact discount finish the title without dropping its older null turma column',async()=>{
 const db=await manualDatabase();
 try{
  await seedFinancial(db);await grant(db);
  await db.query("UPDATE public.matriculas SET status='AGUARDANDO_CONFIRMACAO' WHERE id=$1",[enrollment]);
  await db.query('UPDATE public.contas_receber SET turma_id=NULL WHERE id=$1',[id(1)]);
  await settleTrustManual(db,{principalCents:9000,discountCents:1000,paymentCents:9000});
  const result=await academicState(db);
  assert.equal(result.enrollment,'ATIVO');assert.equal(result.inscription,'PAGO');
  assert.equal(result.bank,'CANCELED');assert.equal(result.transaction,'CANCELED');
 }finally{await db.close();}
});

test('manual helpers remain private and the existing six deferred callbacks remain the only financial hooks',async()=>{
 const db=await manualDatabase();
 try{
  for(const role of ['anon','authenticated','service_role'])for(const fn of [
   'internal_academic.ead_has_own_trust_manual_payment(uuid)','internal_academic.project_ead_trust_manual_payment(uuid)',
   'public.ead_activate_matricula_on_paid_inscricao()']){
   assert.equal(await scalar(db,"SELECT has_function_privilege($1,$2,'EXECUTE') value",[role,fn]),false);
  }
  assert.equal(await scalar(db,"SELECT count(*)::int value FROM pg_trigger WHERE tgfoid='internal_academic.sync_ead_trust_certificate_after_financial_write()'::regprocedure AND tgdeferrable AND tginitdeferred"),6);
  assert((await source(manualMigration)).split('\n').length<=500);
 }finally{await db.close();}
});
