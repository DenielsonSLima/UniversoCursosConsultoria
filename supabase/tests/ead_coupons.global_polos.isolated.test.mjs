import test from 'node:test';
import assert from 'node:assert/strict';
import {createCouponHarness} from './fixtures/ead-coupons.harness.mjs';

test('cupom da Matriz: uso em todos os polos ativos da mesma instituição',async t=>{
  const h=await createCouponHarness();
  const {db,ids,scalar,asManager,asStudent,asService,id}=h;
  const branch=ids.otherPolo,branchTurma=id(1200),branchCourse=id(1100),onlyBranchTurma=id(1201);
  const foreignPolo=id(1300),foreignTurma=id(1202),foreignCourse=id(1101),foreignOnlyTurma=id(1203);
  let sequence=90000;
  const next=()=>id(sequence++);
  const call=async(name,args)=>{
    const r=await h.rpc(name,args);
    if(r.error)throw Object.assign(new Error(r.error.message),{code:r.error.code});
    return r.data;
  };
  const save=async(code,percent=37.5,overrides={})=>{
    await asManager();
    return call('ead_coupons_save',{p_polo_id:ids.polo,p_request_id:next(),p_coupon:{code,discountPercent:percent,
      totalLimit:null,startsAt:'2020-01-01',endsAt:'2099-01-01',perStudentLimit:2,
      active:true,allCourses:true,courseIds:[],...overrides}});
  };
  const quote=(code,course=ids.course,turma=null)=>call('ead_coupon_quote',{
    p_code:code,p_course_id:course,p_turma_id:turma,
  });
  const free=(code,turma=branchTurma,request=next())=>call('ead_coupon_redeem_free',{
    p_code:code,p_turma_id:turma,p_request_id:request,
  });
  const paid=async(code,student,turma=branchTurma,request=next())=>{
    await asService();
    return call('ead_coupon_prepare_checkout',{p_code:code,p_aluno_id:student,p_turma_id:turma,p_request_id:request,
      p_provider:'banese_card',p_environment:'sandbox',p_payment_method:'BOLETO',p_due_date:'2090-01-07',p_description:'Curso fictício filial'});
  };
  const rejected=(fn,code)=>assert.rejects(fn,error=>error.code===code);
  try{
    await db.query(`insert into public.polos(id,nome,company_id,is_matriz,status)
      values($1,'Outra instituição fictícia',$2,false,'ATIVO')`,[foreignPolo,id(99001)]);
    await db.query(`insert into public.cursos(id,nome,modalidade,status,publicar_site,valor)
      values($1,'EAD somente filial','EAD','ATIVO',true,200),($2,'EAD de outra instituição','EAD','ATIVO',true,200)`,[branchCourse,foreignCourse]);
    for(const [turma,course,polo] of [[branchTurma,ids.course,branch],[onlyBranchTurma,branchCourse,branch],
      [foreignTurma,ids.course,foreignPolo],[foreignOnlyTurma,foreignCourse,foreignPolo]]){
      await db.query(`insert into public.turmas(id,curso_id,polo_id,status,vagas_totais)
        values($1,$2,$3,'EM_ANDAMENTO',100)`,[turma,course,polo]);
    }
    for(const n of [1,2,3,5,6])await db.query('update public.parceiros set polo_id=$2,polo_ids=array[$2::uuid] where id=$1',[id(n),branch]);
    await t.test('lista e seleção de cursos abrangem filiais, mas excluem outra instituição',async()=>{
      const courses=await call('ead_coupons_courses',{p_polo_id:ids.polo});
      assert.ok(courses.some(c=>c.id===branchCourse));assert.ok(!courses.some(c=>c.id===foreignCourse));
      await save('GLOBAL375');await save('GLOBALFREE',100);
      await save('SELECIONADOFILIAL',25,{allCourses:false,courseIds:[branchCourse]});
      await rejected(()=>save('FORADAEMPRESA',25,{allCourses:false,courseIds:[foreignCourse]}),'42501');
      await asStudent();assert.equal((await quote('SELECIONADOFILIAL',branchCourse,onlyBranchTurma)).turmaId,onlyBranchTurma);
    });

    await t.test('quote3 respeita turma explícita; quote2 e null escolhem polo do aluno e fallback válido',async()=>{
      await asStudent();
      for(const price of [await quote('GLOBAL375'),await call('ead_coupon_quote',{p_code:'GLOBAL375',p_course_id:ids.course})]){
        assert.equal(price.turmaId,branchTurma);assert.equal(price.poloId,branch);assert.equal(price.ownerPoloId,ids.polo);
      }
      assert.equal((await quote('GLOBAL375',ids.course,ids.turma)).turmaId,ids.turma);
      await db.query("update public.turmas set status='FINALIZADA' where id=$1",[branchTurma]);
      assert.equal((await quote('GLOBAL375')).turmaId,ids.turma,'filial sem turma disponível usa a turma canônica válida da instituição');
      await db.query("update public.turmas set status='EM_ANDAMENTO' where id=$1",[branchTurma]);
      await rejected(()=>quote('GLOBAL375',ids.course,onlyBranchTurma),'22023');
    });

    await t.test('gratuidade em filial registra dono Matriz e polo real, sem dívida',async()=>{
      await asStudent(id(2));const request=next(),result=await free('GLOBALFREE',branchTurma,request);
      assert.equal(result.payableAmount,0);
      const redemption=(await db.query('select * from public.ead_coupon_redemptions where request_id=$1',[request])).rows[0];
      assert.equal(redemption.polo_id,branch);assert.equal(redemption.turma_id,branchTurma);
      assert.equal(await scalar('select polo_id value from public.ead_coupons where id=$1',[redemption.coupon_id]),ids.polo);
      assert.equal(await scalar('select turma_id value from public.matriculas where id=$1',[result.matriculaId]),branchTurma);
      assert.equal(await scalar('select count(*)::int value from public.contas_receber where cliente_id=$1',[id(2)]),0);
      assert.deepEqual(await free('GLOBALFREE',branchTurma,request),result);
      await rejected(()=>quote('GLOBALFREE',ids.course,ids.turma),'PT409');
    });

    await t.test('desconto em filial conserva polo financeiro e histórico central autorizado pela campanha',async()=>{
      const attempt=await paid('GLOBAL375',id(3));
      assert.equal(attempt.receivable.polo_id,branch);assert.equal(Number(attempt.receivable.valor),125);
      await h.recordSyntheticBankProof(attempt.receivableId);
      await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1",[attempt.inscricaoId]);
      assert.equal(await scalar('select status value from public.matriculas where id=$1',[attempt.matriculaId]),'ATIVO');
      await asStudent(id(3));await rejected(()=>quote('GLOBAL375',ids.course,ids.turma),'PT409');
      await asManager();
      const coupon=await scalar("select id value from public.ead_coupons where code='GLOBAL375'");
      // Authorize the administrator only at the owner Matriz, not at the branch.
      await db.exec(`create or replace function public.is_financeiro_for_polo(uuid) returns boolean language sql stable as
        $$select $1='${ids.polo}'::uuid and (global_allowed or scoped_allowed) from test_caixa.access_state$$`);
      assert.equal(await scalar('select public.is_financeiro_for_polo($1) value',[branch]),false);
      const history=await call('ead_coupons_history',{p_polo_id:ids.polo,p_coupon_id:coupon});
      assert.equal(history.total,1);assert.equal(history.items[0].poloId,branch);assert.equal(history.items[0].ownerPoloId,ids.polo);
      assert.equal(history.items[0].receivedAmount,125);
      await rejected(()=>call('ead_coupons_history',{p_polo_id:branch,p_coupon_id:coupon}),'42501');
      await db.exec('grant usage on schema auth,test_caixa to authenticated;grant select on test_caixa.access_state to authenticated;set role authenticated');
      try{assert.equal(await scalar('select count(*)::int value from public.ead_coupon_redemptions where coupon_id=$1',[coupon]),1);}
      finally{await db.exec('reset role');}
      await db.query('delete from public.ead_coupon_events where coupon_id=$1',[coupon]);
      await db.query('update public.ead_coupon_redemptions set confirmed_at=confirmed_at where attempt_id=$1',[attempt.attemptId]);
      assert.equal(await scalar('select polo_id value from public.ead_coupon_events where coupon_id=$1',[coupon]),ids.polo);
      await db.exec('create or replace function public.is_financeiro_for_polo(uuid) returns boolean language sql stable as $$select global_allowed or scoped_allowed from test_caixa.access_state$$');
    });

    await t.test('outra companhia e polo inativo não recebem benefício nem cobrança',async()=>{
      await asStudent(id(8));
      await rejected(()=>quote('GLOBAL375',ids.course,foreignTurma),'22023');
      await rejected(()=>quote('GLOBAL375',foreignCourse,foreignOnlyTurma),'22023');
      await rejected(()=>free('GLOBALFREE',foreignTurma),'22023');
      await rejected(()=>paid('GLOBAL375',id(8),foreignTurma),'22023');
      await db.query("update public.polos set status='INATIVO' where id=$1",[branch]);
      await asStudent(id(8));await rejected(()=>quote('GLOBAL375',ids.course,branchTurma),'22023');
      await rejected(()=>free('GLOBALFREE',branchTurma),'22023');
      assert.equal(await scalar('select count(*)::int value from public.contas_receber where cliente_id=$1',[id(8)]),0);
      await db.query("update public.polos set status='ATIVO' where id=$1",[branch]);
    });

    await t.test('última utilização é global entre polos nos dois intercalamentos serializados',async()=>{
      await db.exec(`create function public.test_global_coupon_claim(code text,student uuid,turma uuid,request uuid)
        returns jsonb language plpgsql as $$begin
          update test_caixa.access_state set actor=(select auth_user_id from public.parceiros where id=student),
            aluno=student,role_name='authenticated';
          return public.ead_coupon_redeem_free(code,turma,request);
        end;$$`);
      for(const [code,first,second] of [['QUOTAGLOBALA',[id(4),ids.turma],[id(5),branchTurma]],
        ['QUOTAGLOBALB',[id(6),branchTurma],[id(7),ids.turma]]]){
        const coupon=await save(code,100,{totalLimit:1});
        // PGlite is one connection; both actual RPC interleavings are queued.
        const outcomes=await Promise.allSettled([first,second].map(([student,turma])=>scalar(
          'select public.test_global_coupon_claim($1,$2,$3,$4) value',[code,student,turma,next()])));
        assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
        assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/esgotaram/);
        assert.equal(await scalar('select count(*)::int value from public.ead_coupon_redemptions where coupon_id=$1',[coupon.id]),1);
      }
    });
  }finally{await db.close();}
});
