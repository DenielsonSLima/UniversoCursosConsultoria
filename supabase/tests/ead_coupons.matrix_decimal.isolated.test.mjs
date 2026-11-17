import test from 'node:test';
import assert from 'node:assert/strict';
import {createCouponHarness} from './fixtures/ead-coupons.harness.mjs';

test('cupons EAD: percentual manual decimal e gestão exclusiva da Matriz',async t=>{
  const h=await createCouponHarness();
  const {db,ids,scalar,asManager,asStudent,asService,id}=h;
  let sequence=80000;
  const next=()=>id(sequence++);
  const call=async(name,args)=>{
    const result=await h.rpc(name,args);
    if(result.error)throw Object.assign(new Error(result.error.message),{code:result.error.code});
    return result.data;
  };
  const draft=(code,percent=37.5)=>({code,discountPercent:percent,totalLimit:null,
    startsAt:'2020-01-01T00:00:00Z',endsAt:'2099-01-01T00:00:00Z',perStudentLimit:2,
    active:true,allCourses:true,courseIds:[]});
  const save=(coupon,request=next(),polo=ids.polo)=>call('ead_coupons_save',{
    p_polo_id:polo,p_coupon:coupon,p_request_id:request,
  });
  const quote=(code,course=ids.course)=>call('ead_coupon_quote',{p_code:code,p_course_id:course});
  const free=(code,request=next())=>call('ead_coupon_redeem_free',{p_code:code,p_turma_id:ids.turma,p_request_id:request});
  const paid=async(code,student=ids.student,request=next(),turma=ids.turma)=>{
    await asService();
    return call('ead_coupon_prepare_checkout',{p_code:code,p_aluno_id:student,p_turma_id:turma,
      p_request_id:request,p_provider:'banese_card',p_environment:'sandbox',p_payment_method:'BOLETO',
      p_due_date:'2090-01-07',p_description:'Curso EAD fictício decimal'});
  };
  const rejected=(fn,code)=>assert.rejects(fn,error=>error.code===code);
  try{
    await t.test('Matriz usa atributo canônico e situação ativa, independente do nome',async()=>{
      await db.query("update public.polos set nome='Nome alterado' where id=$1",[ids.polo]);
      await db.query("update public.polos set nome='Matriz' where id=$1",[ids.otherPolo]);
      assert.equal(await scalar('select public.ead_coupons_can_manage($1) value',[ids.polo]),true);
      assert.equal(await scalar('select public.ead_coupons_can_manage($1) value',[ids.otherPolo]),false);
      for(const [name,args] of [['ead_coupons_list',{p_polo_id:ids.otherPolo}],
        ['ead_coupons_courses',{p_polo_id:ids.otherPolo}],
        ['ead_coupons_history',{p_polo_id:ids.otherPolo,p_coupon_id:next()}]]){
        await rejected(()=>call(name,args),'42501');
      }
      await rejected(()=>save(draft('FILIAL'),next(),ids.otherPolo),'42501');
      const request=next(),coupon=draft('MATRIZDECIMAL');await save(coupon,request);
      await db.query("update public.polos set status='INATIVO' where id=$1",[ids.polo]);
      await rejected(()=>save(coupon,request),'42501');
      await db.query("update public.polos set status='ATIVO',is_matriz=false where id=$1",[ids.polo]);
      await rejected(()=>save(coupon,request),'42501');
      await db.query('update public.polos set is_matriz=true where id=$1',[ids.polo]);
      assert.equal((await save(coupon,request)).discountPercent,37.5);
    });

    await t.test('percentual é obrigatório, numérico, maior que zero e até100 com até2casas',async()=>{
      for(const percent of [undefined,null,'', '37.5',false,0,-1,100.01,37.555,99.999]){
        const coupon=draft('INVALIDO');
        if(percent===undefined)delete coupon.discountPercent;else coupon.discountPercent=percent;
        await rejected(()=>save(coupon),'22023');
      }
      for(const [code,percent] of [['MINIMO',0.01],['INTEIRO',10],['DUASCASAS',37.55],['QUASETOTAL',99.99],['GRATUITO',100]]){
        assert.equal((await save(draft(code,percent))).discountPercent,percent);
      }
    });

    await t.test('filial com módulos e acesso global não ativa cupom; RLS esconde seu cadastro legado',async()=>{
      await asManager();
      // Simulate a pre-correction row only in this disposable database.
      const legacy=next();
      await db.query(`insert into public.ead_coupons(id,polo_id,code,discount_percent,total_limit,starts_at,ends_at,
        per_student_limit,active,all_courses,course_ids,created_by,updated_by)
        select $1,$2,'LEGADOFILIAL',discount_percent,total_limit,starts_at,ends_at,
          per_student_limit,false,all_courses,course_ids,created_by,updated_by
        from public.ead_coupons where code='MATRIZDECIMAL'`,[legacy,ids.otherPolo]);
      assert.equal(await scalar('select public.gestor_has_module($1) value',['secretaria']),true);
      assert.equal(await scalar('select public.gestor_has_module($1) value',['financeiro']),true);
      assert.equal(await scalar('select public.is_financeiro_for_polo($1) value',[ids.otherPolo]),true);
      await rejected(()=>save({...draft('LEGADOFILIAL'),id:legacy,active:true},next(),ids.otherPolo),'42501');
      await db.exec('grant usage on schema auth,test_caixa to authenticated; grant select on test_caixa.access_state to authenticated');
      await db.exec('set role authenticated');
      try{
        assert.equal(await scalar('select count(*)::int value from public.ead_coupons where polo_id=$1',[ids.otherPolo]),0);
        assert.ok(await scalar('select count(*)::int value from public.ead_coupons where polo_id=$1',[ids.polo])>0);
        await rejected(()=>db.query('update public.ead_coupons set active=true where id=$1',[legacy]),'42501');
      }finally{await db.exec('reset role');}
      await db.exec('update test_caixa.access_state set global_allowed=false,scoped_allowed=false');
      assert.equal(await scalar('select public.ead_coupons_can_manage($1) value',[ids.polo]),false);
      assert.equal((await h.rpc('ead_coupons_available')).data,false);
      await rejected(()=>save(draft('SEMESCOPO')),'42501');
      await asManager();await asStudent(id(9));
      await rejected(()=>quote('LEGADOFILIAL'),'22023');
      await asManager();
    });

    await t.test('37,5% calcula valores canônicos e snapshot paga exatamente a diferença',async()=>{
      await asStudent();
      const first=await quote('MATRIZDECIMAL');
      assert.equal(first.originalAmount,200);assert.equal(first.discountAmount,75);assert.equal(first.payableAmount,125);
      const second=await quote('MATRIZDECIMAL',ids.otherCourse);
      assert.equal(second.originalAmount,99.9);assert.equal(second.discountAmount,37.46);assert.equal(second.payableAmount,62.44);
      const attempt=await paid('MATRIZDECIMAL',ids.student,next(),ids.otherTurma);
      assert.equal(Number(attempt.receivable.valor),62.44);
      const snapshot=(await db.query('select discount_percent,original_amount,discount_amount,payable_amount from public.ead_coupon_redemptions where attempt_id=$1',[attempt.attemptId])).rows[0];
      assert.deepEqual(Object.fromEntries(Object.entries(snapshot).map(([key,value])=>[key,Number(value)])),
        {discount_percent:37.5,original_amount:99.9,discount_amount:37.46,payable_amount:62.44});
      assert.equal(await scalar('select status value from public.matriculas where id=$1',[attempt.matriculaId]),'PENDENTE');
    });

    await t.test('99,99% continua sendo pago, sem cast que arredonde para100 nem RPC gratuita',async()=>{
      await asStudent(id(2));const price=await quote('QUASETOTAL');
      assert.equal(price.discountPercent,99.99);assert.equal(price.payableAmount,0.02);
      await rejected(()=>free('QUASETOTAL'),'22023');
      assert.equal(await scalar('select count(*)::int value from public.matriculas where aluno_id=$1',[id(2)]),0);
      const attempt=await paid('QUASETOTAL',id(2));
      assert.equal(Number(attempt.receivable.valor),0.02);
      await h.recordSyntheticBankProof(attempt.receivableId);
      await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1",[attempt.inscricaoId]);
      assert.equal(await scalar('select status value from public.matriculas where id=$1',[attempt.matriculaId]),'ATIVO');
      assert.equal(Number(await scalar('select discount_percent value from public.ead_coupon_redemptions where attempt_id=$1',[attempt.attemptId])),99.99);
    });

    await t.test('100% continua gratuito sem cobrança e compra sem cupom continua integral',async()=>{
      await asStudent(id(3));const result=await free('GRATUITO');
      assert.equal(result.payableAmount,0);assert.equal(result.discountAmount,200);
      assert.equal(await scalar('select count(*)::int value from public.contas_receber where cliente_id=$1',[id(3)]),0);
      await asService();const ordinary=await scalar(`select public.ead_prepare_checkout_attempt($1,$2,$3,
        'banese_card','sandbox','BOLETO',200,'2090-01-07','Curso sem cupom',null,null,false) value`,[id(4),ids.turma,next()]);
      assert.equal(Number(ordinary.receivable.valor),200);
    });

    await t.test('arredondamento não converte desconto parcial em gratuidade nem em desconto zero',async()=>{
      await asManager();await save(draft('PEQUENO',1));
      await db.query('update public.cursos set valor=0.01 where id=$1',[ids.otherCourse]);
      await asStudent(id(5));
      await rejected(()=>quote('PEQUENO',ids.otherCourse),'22023');
      await rejected(()=>quote('QUASETOTAL',ids.otherCourse),'22023');
      await db.query('update public.cursos set valor=99.9 where id=$1',[ids.otherCourse]);
      assert.equal((await quote('MINIMO')).discountAmount,0.02);
    });

    await t.test('novos usos exigem dono Matriz ativo, mas retomada e pagamento existentes preservam fatos',async()=>{
      await asManager();await save(draft('CONTINUAR',25));
      const request=next(),attempt=await paid('CONTINUAR',id(6),request);
      await db.query("update public.polos set status='INATIVO' where id=$1",[ids.polo]);
      await asStudent(id(7));await rejected(()=>quote('CONTINUAR'),'22023');
      await asStudent(id(6));const resumed=await quote('CONTINUAR');assert.equal(resumed.requestId,request);
      const replay=await paid('CONTINUAR',id(6),request);assert.equal(replay.receivableId,attempt.receivableId);
      await h.recordSyntheticBankProof(attempt.receivableId);
      await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1",[attempt.inscricaoId]);
      assert.equal(await scalar('select status value from public.matriculas where id=$1',[attempt.matriculaId]),'ATIVO');
      await asStudent(id(3));assert.equal((await quote('GRATUITO')).payableAmount,0);
      await db.query("update public.polos set status='ATIVO' where id=$1",[ids.polo]);
    });

    await t.test('curso técnico, livre e modalidade ausente nunca participam de cupom EAD',async()=>{
      await asStudent(id(8));
      for(const modalidade of ['TECNICO','LIVRE',null]){
        await db.query('update public.cursos set modalidade=$2 where id=$1',[ids.course,modalidade]);
        await rejected(()=>quote('MATRIZDECIMAL'),'22023');
        await rejected(()=>free('GRATUITO'),'22023');
      }
      await db.query("update public.cursos set modalidade='EAD' where id=$1",[ids.course]);
    });
  }finally{await db.close();}
});
