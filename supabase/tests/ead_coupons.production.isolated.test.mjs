import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createCouponHarness} from './fixtures/ead-coupons.harness.mjs';

const release = readFileSync(new URL('../migrations/20261116100118_ead_coupons_production_release.sql',import.meta.url),'utf8');

test('cupons: publicação e recuperação de produção em PostgreSQL fictício isolado',async t=>{
  const h=await createCouponHarness();
  const {db,ids,scalar,asManager,asStudent,asService,id}=h;
  let sequence=50000;
  const next=()=>id(sequence++);
  const call=async(name,args)=>{
    const result=await h.rpc(name,args);
    if(result.error) throw Object.assign(new Error(result.error.message),{code:result.error.code});
    return result.data;
  };
  const save=async(code,overrides={})=>{
    await asManager();
    return call('ead_coupons_save',{p_polo_id:ids.polo,p_request_id:next(),p_coupon:{
      code,discountPercent:50,totalLimit:null,startsAt:'2020-01-01T00:00:00Z',endsAt:'2099-01-01T00:00:00Z',
      perStudentLimit:2,active:true,allCourses:true,courseIds:[],...overrides,
    }});
  };
  const prepare=async(code,student=ids.student,request=next(),overrides={})=>{
    await asService();
    return call('ead_coupon_prepare_checkout',{p_code:code,p_aluno_id:student,p_turma_id:ids.turma,
      p_request_id:request,p_provider:'banese_card',p_environment:'production',p_payment_method:'BOLETO',
      p_due_date:'2090-01-07',p_description:'Curso fictício - inscrição',...overrides});
  };
  const rejected=(fn,code)=>assert.rejects(fn,error=>error.code===code);
  const bankFingerprint=()=>scalar(`select jsonb_build_object('runtime',(select jsonb_agg(r) from public.payment_gateway_runtime_config r),
    'routes',(select jsonb_agg(r order by id) from public.payment_gateway_routes r),
    'credentials',(select jsonb_agg(c order by id) from public.payment_gateway_credentials c)) value`);
  try{
    await save('PRODUCAO50');
    await t.test('instalação não libera produção nem muda configuração bancária',async()=>{
      assert.equal(await scalar('select allow_production value from internal_contas.ead_coupon_runtime'),false);
      await rejected(()=>prepare('PRODUCAO50'),'42501');
      const before=await bankFingerprint();
      await db.exec(release);
      assert.deepEqual(await bankFingerprint(),before);
      assert.equal(await scalar('select count(*)::int value from public.contas_receber'),0);
      assert.equal(await scalar('select release_reference value from internal_contas.ead_coupon_runtime'),'2026-11-16-cupons-ead-production');
      await rejected(()=>prepare('PRODUCAO50'),'55000','runtime bancário continua sandbox');
    });

    await t.test('capacidade exige runtime, rota única EAD BOLETO e credenciais Banese configuradas',async()=>{
      await db.exec("update public.payment_gateway_runtime_config set active_environment='production'");
      await db.exec("update public.payment_gateway_routes set enabled=false where environment='production'");
      await rejected(()=>prepare('PRODUCAO50'),'55000');
      await db.exec("update public.payment_gateway_routes set enabled=true,provider_code='asaas' where environment='production'");
      await rejected(()=>prepare('PRODUCAO50'),'55000');
      await db.exec("update public.payment_gateway_routes set provider_code='banese_card' where environment='production'");
      for(const column of ['configured','client_id_configured','client_secret_configured']){
        await db.exec(`update public.payment_gateway_credentials set ${column}=false where environment='production'`);
        await rejected(()=>prepare('PRODUCAO50'),'55000');
        await db.exec(`update public.payment_gateway_credentials set ${column}=true where environment='production'`);
      }
      await rejected(()=>prepare('PRODUCAO50',ids.student,next(),{p_payment_method:'PIX'}),'42501');
      await rejected(()=>prepare('PRODUCAO50',ids.student,next(),{p_payment_method:'CREDIT_CARD'}),'42501');
      await rejected(()=>prepare('PRODUCAO50',ids.student,next(),{p_provider:'mercado_pago'}),'42501');
      await db.exec('update public.payment_gateway_runtime_config set enabled=false');
      await rejected(()=>prepare('PRODUCAO50'),'55000');
      await db.exec('update public.payment_gateway_runtime_config set enabled=true');
      assert.equal(await scalar('select count(*)::int value from public.contas_receber'),0);
    });

    await t.test('produção reserva preço descontado, não emite de novo em replay e exige prova própria',async()=>{
      const request=next(),attempt=await prepare('PRODUCAO50',ids.student,request);
      assert.equal(attempt.action,'CREATE');assert.equal(attempt.receivable.gateway_environment,'production');
      assert.equal(Number(attempt.receivable.valor),100);
      const repeated=await prepare('PRODUCAO50',ids.student,request);
      assert.equal(repeated.receivableId,attempt.receivableId);assert.equal(repeated.creationToken,null);
      await h.recordSyntheticBankProof(attempt.receivableId);
      await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1",[attempt.inscricaoId]);
      assert.equal(await scalar('select status value from public.matriculas where id=$1',[attempt.matriculaId]),'ATIVO');
      assert.equal(await scalar('select count(*)::int value from public.contas_receber'),1);
    });

    await t.test('resposta perdida da gratuidade pode ser retomada mesmo após desativar campanha',async()=>{
      const coupon=await save('FREECOMMIT',{discountPercent:100,totalLimit:1});
      await asStudent(id(2));const request=next();
      const result=await call('ead_coupon_redeem_free',{p_code:'FREECOMMIT',p_turma_id:ids.turma,p_request_id:request});
      await db.query('update public.ead_coupons set active=false where id=$1',[coupon.id]);
      const quote=await call('ead_coupon_quote',{p_code:'FREECOMMIT',p_course_id:ids.course});
      assert.equal(quote.requestId,request);assert.equal(quote.payableAmount,0);
      assert.deepEqual(await call('ead_coupon_redeem_free',{p_code:'FREECOMMIT',p_turma_id:quote.turmaId,p_request_id:quote.requestId}),result);
      assert.equal(await scalar('select count(*)::int value from public.contas_receber'),1);
      await db.query("update public.matriculas set status='CANCELADO' where id=$1",[result.matriculaId]);
      await rejected(()=>call('ead_coupon_quote',{p_code:'FREECOMMIT',p_course_id:ids.course}),'PT409');
      await rejected(()=>call('ead_coupon_redeem_free',{p_code:'FREECOMMIT',p_turma_id:ids.turma,p_request_id:request}),'PT409');
      assert.equal(await scalar('select status value from public.matriculas where id=$1',[result.matriculaId]),'CANCELADO');
    });

    await t.test('liquidação tardia após quota liberada preserva fato bancário e revisão canônica',async()=>{
      const coupon=await save('TARDIO50',{totalLimit:1});
      const old=await prepare('TARDIO50',id(3));
      const tx=next();
      await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,inscricao_online_id,
        provider_code,environment,remote_payment_id,remote_status,amount)
        values($1,$2,$3,'banese_card','production','FICTICIO-TARDIO','CANCELED',100)`,[tx,old.receivableId,old.inscricaoId]);
      await db.query(`insert into public.banese_ead_checkout_expiration_jobs(receivable_id,matricula_id,
        inscription_id,transaction_id,environment,state,snapshot,expected_receivable_updated_at,
        expected_transaction_updated_at,expected_inscription_updated_at,first_expiration_day,canceled_at,remote_status)
        values($1,$2,$3,$4,'production','DONE','{}',now(),now(),now(),current_date,now(),'CANCELED')`,
        [old.receivableId,old.matriculaId,old.inscricaoId,tx]);
      await db.query("update public.ead_checkout_attempts set state='EXPIRED' where id=$1",[old.attemptId]);
      const replacement=await prepare('TARDIO50',id(4));
      assert.equal(replacement.action,'CREATE');
      const countBefore=await scalar('select count(*)::int value from public.contas_receber');
      await h.recordSyntheticBankProof(old.receivableId);
      await db.query("update public.ead_checkout_attempts set state='PAID_REVIEW' where id=$1",[old.attemptId]);
      await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1",[old.inscricaoId]);
      assert.equal(await scalar('select state value from public.ead_checkout_attempts where id=$1',[old.attemptId]),'PAID_REVIEW');
      assert.equal(await scalar('select status value from public.matriculas where id=$1',[old.matriculaId]),'PENDENTE');
      assert.equal(await scalar('select count(*)::int value from public.contas_receber'),countBefore);
      assert.equal(await scalar('select status value from public.ead_coupon_redemptions where attempt_id=$1',[old.attemptId]),'CONFIRMED');
      await asManager();const history=await call('ead_coupons_history',{p_polo_id:ids.polo,p_coupon_id:coupon.id});
      const row=history.items.find(item=>item.receivableId===old.receivableId);
      assert.equal(row.reviewRequired,true);assert.ok(row.releasedAt);assert.equal(row.receivedAmount,100);
      assert.equal(await scalar(`select count(*)::int value from public.ead_payment_reviews
        where attempt_id=$1 and evidence->>'code'='COUPON_PAYMENT_AFTER_RELEASE'`,[old.attemptId]),1);
    });

    await t.test('capacidade pública exige perfil ativo e autenticação; serviço não libera UI',async()=>{
      await asManager();assert.equal((await h.rpc('ead_coupons_available')).data,true);
      await asStudent(id(5));assert.equal((await h.rpc('ead_coupons_available')).data,true);
      await db.query("update public.parceiros set status='INATIVO' where id=$1",[id(5)]);
      assert.equal((await h.rpc('ead_coupons_available')).data,false);
      await asService();assert.equal((await h.rpc('ead_coupons_available')).data,false);
      await db.exec("update test_caixa.access_state set role_name='anon',actor=null,aluno=null");
      assert.equal((await h.rpc('ead_coupons_available')).data,false);
    });

    await t.test('outro título pago da mesma matrícula não comprova o recebível do cupom',async()=>{
      await save('PROPRIO50');
      const couponAttempt=await prepare('PROPRIO50',id(6));
      const otherAttempt=next(),otherReceipt=next(),otherInscription=next();
      await db.exec('begin');
      await db.query('update public.ead_checkout_attempts set is_current=false where id=$1',[couponAttempt.attemptId]);
      await db.query(`insert into public.ead_checkout_attempts(id,matricula_id,aluno_id,turma_id,curso_id,
        receivable_id,inscription_id,sequence_number,state)
        values($1,$2,$3,$4,$5,$6,$7,2,'RESERVED')`,
        [otherAttempt,couponAttempt.matriculaId,id(6),ids.turma,ids.course,otherReceipt,otherInscription]);
      await db.query(`insert into public.contas_receber(id,ead_checkout_attempt_id,polo_id,cliente_id,
        matricula_id,turma_id,tipo_lancamento,valor,status,data_vencimento,gateway_provider,gateway_environment,
        gateway_payment_method,origem_cronograma_id) values($1,$2,$3,$4,$5,$6,'MATRICULA',200,'PENDENTE',
        '2090-01-07','banese_card','production','BOLETO',$7)`,
        [otherReceipt,otherAttempt,ids.polo,id(6),couponAttempt.matriculaId,ids.turma,`ead_attempt:${otherAttempt}`]);
      await db.query(`insert into public.inscricoes_online(id,ead_checkout_attempt_id,curso_id,turma_id,aluno_id,
        matricula_id,receivable_id,status,valor,gateway_provider,gateway_environment)
        values($1,$2,$3,$4,$5,$6,$7,'AGUARDANDO_PAGAMENTO',200,'banese_card','production')`,
        [otherInscription,otherAttempt,ids.course,ids.turma,id(6),couponAttempt.matriculaId,otherReceipt]);
      await db.exec('commit');
      await h.recordSyntheticBankProof(otherReceipt);
      await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1",[otherInscription]);
      assert.equal(await scalar('select internal_academic.ead_has_confirmed_payment($1) value',[couponAttempt.matriculaId]),true);
      await db.query(`update public.contas_receber set status='PAGO',valor_pago=100,data_pagamento=current_date,
        gateway_status='PAID',origem_pagamento='BANESE' where id=$1`,[couponAttempt.receivableId]);
      await rejected(()=>db.query("update public.inscricoes_online set status='PAGO' where id=$1",[couponAttempt.inscricaoId]),'PT409');
      assert.equal(await scalar('select status value from public.ead_coupon_redemptions where attempt_id=$1',[couponAttempt.attemptId]),'RESERVED');
    });
  }finally{await db.close();}
});
