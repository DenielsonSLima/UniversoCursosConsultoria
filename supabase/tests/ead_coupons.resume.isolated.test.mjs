import test from 'node:test';
import assert from 'node:assert/strict';
import { createCouponHarness } from './fixtures/ead-coupons.harness.mjs';
const h=await createCouponHarness();const {db,ids,id,scalar}=h;
const call=async(name,args)=>{const r=await h.rpc(name,args);if(r.error)throw Object.assign(new Error(r.error.message),{code:r.error.code});return r.data;};
await h.asManager();await call('ead_coupons_save',{p_polo_id:ids.polo,p_coupon:{code:'RETOMADA',discountPercent:100,totalLimit:null,startsAt:'2020-01-01',endsAt:'2099-01-01',perStudentLimit:2,active:true,allCourses:true,courseIds:[]},p_request_id:id(555)});
await h.asService();
const a=await scalar(`select public.ead_prepare_checkout_attempt($1,$2,$3,'banese_card','sandbox','BOLETO',200,'2090-01-07','FICTICIO',null,null,false) value`,[ids.student,ids.turma,id(600)]);
const tx=id(601),remote='FICTICIO-NAO-PAGAVEL';
await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,inscricao_online_id,provider_code,environment,remote_payment_id,remote_status,amount) values($1,$2,$3,'banese_card','sandbox',$4,'CANCELED',200)`,[tx,a.receivableId,a.inscricaoId,remote]);
await db.query(`update public.ead_checkout_attempts set transaction_id=$2,state='EXPIRED',canceled_at=now() where id=$1`,[a.attemptId,tx]);
await db.query(`update public.contas_receber set status='CANCELADO',gateway_status='CANCELED',gateway_creation_token=null,gateway_payment_id=$2 where id=$1`,[a.receivableId,remote]);
await db.query(`update public.inscricoes_online set status='CANCELADO',gateway_payment_id=$2 where id=$1`,[a.inscricaoId,remote]);
await db.query(`insert into public.banese_ead_checkout_expiration_jobs(receivable_id,matricula_id,inscription_id,transaction_id,attempt_id,environment,state,snapshot,expected_receivable_updated_at,expected_transaction_updated_at,expected_inscription_updated_at,first_expiration_day,canceled_at,remote_status) values($1,$2,$3,$4,$5,'sandbox','DONE','{}',now(),now(),now(),current_date,now(),'CANCELED')`,[a.receivableId,a.matriculaId,a.inscricaoId,tx,a.attemptId]);
await db.query('update public.matriculas set gerar_cobranca_inicial=true,sincronizar_asaas=true where id=$1',[a.matriculaId]);
await h.asStudent();
const quote=()=>call('ead_coupon_quote',{p_code:'RETOMADA',p_course_id:ids.course});
const free=(req=id(700))=>call('ead_coupon_redeem_free',{p_code:'RETOMADA',p_turma_id:ids.turma,p_request_id:req});
const snapshot=()=>scalar('select internal_contas.ead_coupon_financial_snapshot($1) value',[a.matriculaId]);
await test('cancelled prior purchase is eligible in quote',async()=>assert.equal((await quote()).payableAmount,0));
for(const [name,sql] of [
 ['non-expired attempt',`update public.ead_checkout_attempts set state='OPEN'`],
 ['no cancellation proof',`update public.banese_ead_checkout_expiration_jobs set canceled_at=null`],
 ['job under review',`update public.banese_ead_checkout_expiration_jobs set state='REVIEW_REQUIRED'`],
 ['payment observed during cancel',`update public.banese_ead_checkout_expiration_jobs set processing_payment_detected_at=now()`],
 ['gateway no longer cancelled',`update public.payment_gateway_transactions set remote_status='PAID'`],
 ['unknown gateway state',`update public.payment_gateway_transactions set remote_status=null`],
 ['receipt payment evidence',`update public.contas_receber set valor_pago=1`],
 ['receipt payment date',`update public.contas_receber set data_pagamento=current_date`],
 ['inscription payment date',`update public.inscricoes_online set pago_em=now()`],
 ['wrong receipt polo',`update public.contas_receber set polo_id='${ids.otherPolo}'`],
 ['wrong inscription provider',`update public.inscricoes_online set gateway_provider='other'`],
 ['orphan receivable',`insert into public.contas_receber(id,matricula_id,cliente_id,turma_id,status) values('${id(805)}','${a.matriculaId}','${ids.student}','${ids.turma}','CANCELADO')`],
 ['unmatched remote identity',`update public.payment_gateway_transactions set remote_payment_id='WRONG'`],
 ['missing transaction',`update public.ead_checkout_attempts set transaction_id=null`],
 ['historically active enrollment',`insert into public.matricula_movimentacoes(id,matricula_id,status_anterior,status_novo) values('${id(800)}','${a.matriculaId}','ATIVO','PENDENTE')`],
 ['future billing flag',`update public.matriculas set gerar_cobranca_futura=true`],
 ['ledger payment',`insert into public.financial_payment_events(id,source_kind,source_id,payment_cents) values('${id(801)}','RECEIVABLE','${a.receivableId}',100)`],
 ['pending manual settlement',`insert into public.receivable_manual_settlements(id,receivable_id) values('${id(803)}','${a.receivableId}')`],
 ['referenced manual settlement',`update public.contas_receber set manual_settlement_id='${id(804)}'`],
 ['manual payment',`insert into public.receivable_manual_settlements(id,receivable_id,completed_at,received_cents) values('${id(802)}','${a.receivableId}',now(),100)`],
 ['open review',`insert into public.ead_payment_reviews(attempt_id,receivable_id,polo_id,reason,evidence) values('${a.attemptId}','${a.receivableId}','${ids.polo}','PAYMENT_EVIDENCE_MISMATCH','{}')`],
 ['financial plan',`insert into public.turmas_plano_financeiro_unico values('${ids.turma}')`],
 ])await test(name+' blocks quote and redemption without changes',async()=>{
 await db.exec('begin');try{await db.exec(sql);const before=await snapshot();await assert.rejects(quote,e=>e.code==='PT409'); // RPC failure aborts transaction; restore before testing mutation.
 }finally{await db.exec('rollback')}
 await db.exec('begin');try{await db.exec(sql);await assert.rejects(free,e=>e.code==='PT409');}finally{await db.exec('rollback')}
 assert.equal(await scalar('select status value from public.matriculas where id=$1',[a.matriculaId]),'PENDENTE');
 assert.equal(await scalar('select count(*)::int value from public.ead_coupon_redemptions'),0);
});
await test('activation side effect rolls back whole redemption',async()=>{
 await db.exec(`create function public.test_bad_activation() returns trigger language plpgsql as $$begin update public.contas_receber set descricao='UNEXPECTED' where matricula_id=new.id;return new;end;$$;create trigger z_test_bad after update on public.matriculas for each row execute function public.test_bad_activation()`);
 const before=await snapshot();await assert.rejects(free,/alterou histórico financeiro/);assert.deepEqual(await snapshot(),before);
 assert.equal(await scalar('select status value from public.matriculas where id=$1',[a.matriculaId]),'PENDENTE');
 await db.exec('drop trigger z_test_bad on public.matriculas;drop function public.test_bad_activation()');
});
await test('safe resumption activates original enrollment without changing history or creating debt',async()=>{
 const before=await snapshot();const result=await free();assert.equal(result.matriculaId,a.matriculaId);assert.equal(result.status,'CONFIRMED');assert.deepEqual(await snapshot(),before);
 assert.equal(await scalar('select status value from public.matriculas where id=$1',[a.matriculaId]),'ATIVO');
 assert.equal(await scalar('select count(*)::int value from public.matriculas'),1);
 assert.equal(await scalar('select count(*)::int value from public.contas_receber'),1);
 const audit=await scalar(`select request_payload->'resumedHistory' value from public.ead_coupon_redemptions`);assert.equal(audit.matriculaId,a.matriculaId);assert.deepEqual(audit.attemptIds,[a.attemptId]);
 assert.deepEqual(audit.previousFlags,{gerarCobrancaInicial:true,sincronizarAsaas:true});
 assert.equal(await scalar('select gerar_cobranca_inicial or sincronizar_asaas value from public.matriculas where id=$1',[a.matriculaId]),false);
});
await test('same request replays without duplicate redemption',async()=>{assert.equal((await free()).matriculaId,a.matriculaId);assert.equal(await scalar('select count(*)::int value from public.ead_coupon_redemptions'),1)});
await test('new request cannot repeat coupon use',async()=>await assert.rejects(()=>free(id(701))));
await test('another authenticated student cannot replay request',async()=>{await h.asStudent(ids.secondStudent);await assert.rejects(free,/Request id/);await h.asStudent()});
await test('same request with another class is rejected',async()=>await assert.rejects(()=>call('ead_coupon_redeem_free',{p_code:'RETOMADA',p_turma_id:ids.otherTurma,p_request_id:id(700)}),/Request id/));
await test('another course without history is still free',async()=>{const r=await call('ead_coupon_redeem_free',{p_code:'RETOMADA',p_turma_id:ids.otherTurma,p_request_id:id(702)});assert.equal(r.payableAmount,0);assert.equal(await scalar('select count(*)::int value from public.contas_receber'),1)});
await test('late bank payment is preserved and opens financial review after free resumption',async()=>{
 await h.recordSyntheticBankProof(a.receivableId,200);
 assert.equal(await scalar('select status value from public.contas_receber where id=$1',[a.receivableId]),'PAGO');
 assert.equal(await scalar('select status value from public.matriculas where id=$1',[a.matriculaId]),'ATIVO');
 assert.equal(await scalar('select status value from public.ead_coupon_redemptions where matricula_id=$1',[a.matriculaId]),'CONFIRMED');
 assert.equal(await scalar("select evidence->>'code' value from public.ead_payment_reviews where attempt_id=$1",[a.attemptId]),'PAYMENT_AFTER_COUPON_FREE_RESUMPTION');
 await db.query("update public.contas_receber set status='PAGO' where id=$1",[a.receivableId]);
 assert.equal(await scalar('select count(*)::int value from public.ead_payment_reviews where attempt_id=$1',[a.attemptId]),1);
});
await db.close();
