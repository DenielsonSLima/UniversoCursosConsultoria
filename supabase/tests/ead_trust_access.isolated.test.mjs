import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {database,applyRevisions,progress,submit,state,alumno,other,course,enrollment,turma,unit} from './ead_assessment_revision.harness.mjs';

test('closed full-course rollout preserves canonical study trust, scope and exact expiry',async t=>{
 const db=await database();
 const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 const grant=(key=enrollment)=>scalar('select public.ead_liberar_por_confianca($1) value',[key]);
 const readTrust=(key=turma)=>scalar('select public.ead_get_turma_trust_access($1) value',[key]);
 let expires;
 try{
  await applyRevisions(db);
  // Only environment authorization is controlled. The grant, protected column,
  // audit, progress read/write, quiz and certificate owners are real migrations.
  await db.exec(`create function auth.uid() returns uuid language sql as
    $$select nullif(current_setting('test.actor',true),'')::uuid$$;
   create function public.gestor_has_module(text) returns boolean language sql as
    $$select $1='gestao' and current_setting('test.gestor',true)='true'$$;
   create function public.gestor_has_effective_financeiro_tab(text) returns boolean language sql as
    $$select current_setting('test.finance',true)='true'$$;
   create function public.can_write_turma(p_id uuid) returns boolean language sql as $$
    select current_setting('test.scope',true)='true' and exists(select 1 from public.turmas t
      where t.id=p_id and t.polo_id=nullif(current_setting('test.polo',true),'')::uuid)$$;`);
  for(const f of ['20261112141935_ead_temporary_trust_access.sql',
   '20261112141950_trust_ead_get_aluno_progress_core_20260822.sql',
   '20261112141956_trust_ead_update_aluno_progress.sql',
   '20261112225450_ead_trust_full_course_rollout_gate.sql',
   '20261112225500_ead_trust_quiz_completion.sql','20261112225600_ead_trust_quiz_guard.sql',
   '20261112225650_ead_trust_quiz_read.sql']){
   await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  }
  await db.exec(`update matriculas set status='PENDENTE';set test.actor='${other}';set test.polo='${unit}';
   alter table parceiros add email text,add telefone text;
   create table inscricoes_online(id uuid,matricula_id uuid,status text,asaas_payment_id text,
     asaas_payment_link_id text,valor numeric,created_at timestamptz,updated_at timestamptz);`);
  await db.exec(await readFile(new URL('../migrations/20261112225750_ead_trust_current_access_projection.sql',import.meta.url),'utf8'));

  await t.test('missing Gestão, missing polo and anonymous calls cannot grant access',async()=>{
   await db.exec("set test.gestor='false';set test.scope='true';set test.finance='true'");
   await assert.rejects(()=>grant(),e=>e.code==='42501');
   await assert.rejects(()=>readTrust(),e=>e.code==='42501');
   await db.exec("set test.gestor='true';set test.scope='false'");
   await assert.rejects(()=>grant(),e=>e.code==='42501');
   await assert.rejects(()=>readTrust(),e=>e.code==='42501');
   await db.exec(`set test.scope='true';set test.polo='${other}'`);
   await assert.rejects(()=>grant(),e=>e.code==='42501');
   await assert.rejects(()=>readTrust(),e=>e.code==='42501');
   await db.exec(`set test.polo='${unit}';set test.actor=''`);
   await assert.rejects(()=>grant(),e=>e.code==='42501');
   await assert.rejects(()=>readTrust(),e=>e.code==='42501');
   await db.exec(`set test.actor='${other}';set role anon`);
   await assert.rejects(()=>grant(),e=>e.code==='42501');
   await assert.rejects(()=>readTrust(),e=>e.code==='42501');
   await db.exec('reset role');
   await db.exec("set test.auth_role='service_role'");
   await assert.rejects(()=>readTrust(),e=>e.code==='42501');
   await db.exec("set test.auth_role='authenticated'");
   assert.equal(await scalar('select count(*)::int value from internal_academic.ead_trust_access_audit'),0);
  });
  await t.test('Técnico, Livre and Especialização are denied even with Gestão and the authorized polo',async()=>{
   let sequence=100;
   const key=n=>`99999999-9999-4999-8999-${String(n).padStart(12,'0')}`;
   for(const modality of ['TECNICO','LIVRE','ESPECIALIZACAO']){
    const c=key(sequence++),group=key(sequence++),registration=key(sequence++);
    await db.query("insert into cursos(id,nome,modalidade,ead_config,carga_horaria) values($1,'Curso sintético',$2,'{}',120)",[c,modality]);
    await db.query('insert into turmas(id,curso_id,polo_id) values($1,$2,$3)',[group,c,unit]);
    await db.query("insert into matriculas(id,aluno_id,turma_id,status) values($1,$2,$3,'PENDENTE')",[registration,alumno,group]);
    await assert.rejects(()=>grant(registration),e=>e.code==='42501');
    await assert.rejects(()=>readTrust(group),e=>e.code==='42501');
   }
   assert.equal(await scalar('select count(*)::int value from internal_academic.ead_trust_access_audit'),0);
  });
  await t.test('internal Gestão profiles without Financeiro may grant and replay the same exact 86400 seconds',async()=>{
   await db.exec("set test.finance='false';set role authenticated");
   assert.equal(await scalar("select public.gestor_has_effective_financeiro_tab('receber') value"),false);
   expires=await grant();assert.ok(expires);
   await db.exec(`set test.actor='${alumno}'`);
   assert.equal((await grant()).toISOString(),expires.toISOString(),'Another authorized profile cannot extend the grant');
   await db.exec(`reset role;set test.actor='${other}'`);
   const audit=await scalar('select to_jsonb(a) value from internal_academic.ead_trust_access_audit a where matricula_id=$1',[enrollment]);
   assert.equal(audit.granted_by,other);
   assert.equal(await scalar('select extract(epoch from expires_at-granted_at)::int value from internal_academic.ead_trust_access_audit'),86400);
   assert.equal((await state(db)).enrollment.status,'PENDENTE');
   assert.equal(await scalar('select count(*)::int value from inscricoes_online'),0,'Trust never manufactures a paid inscription');
   const list=await readTrust();
   assert.equal(list.length,1);assert.equal(Date.parse(list[0].acessoTemporarioAte),expires.getTime());
   assert.deepEqual(Object.keys(list[0]).sort(),['matriculaId','nome','status','acessoTemporarioAte','acessoTemporarioAtivo'].sort());
   for(const [role,allowed] of [['authenticated',true],['anon',false],['service_role',false]]){
    assert.equal(await scalar("select has_function_privilege($1,'public.ead_get_turma_trust_access(uuid)','EXECUTE') value",[role]),allowed);
   }
  });
  await t.test('the closed rollout permits study but blocks the final quiz until certificate guards are installed',async()=>{
   assert.equal(await scalar('select internal_academic.ead_trust_full_course_enabled() value'),false);
   await db.exec('delete from ead_aluno_progresso');
   const initial=await progress(db);
   assert.equal(initial.summary.temporaryAccess,true);assert.equal(initial.summary.canTakeQuiz,false);
   assert.equal(initial.progress.completedContentIds.length,0);
   await db.query("select public.ead_update_aluno_progress($1,$2,'toggle_content','old-lesson','{}')",[alumno,course]);
   assert.ok((await progress(db)).progress.completedContentIds.includes('old-lesson'));
   await assert.rejects(()=>submit(db),e=>e.code==='23514'&&/confirmação do pagamento/.test(e.message));
   assert.equal((await state(db)).certificates.length,0);
  });
  await t.test('the authenticated caller cannot change the protected deadline directly',async()=>{
   await db.exec('grant select,update on matriculas to authenticated;set role authenticated');
   await assert.rejects(()=>db.query("update matriculas set acesso_temporario_ate=now()+interval '7 days' where id=$1",[enrollment]),e=>e.code==='42501');
   await db.exec('reset role');
   assert.equal(Date.parse((await state(db)).enrollment.acesso_temporario_ate),expires.getTime());
  });
  await t.test('expired audit cannot renew and expired pending access denies study reads and writes',async()=>{
   await db.query(`update internal_academic.ead_trust_access_audit
     set granted_at=statement_timestamp()-interval '25 hours',expires_at=statement_timestamp()-interval '1 hour'
     where matricula_id=$1`,[enrollment]);
   await db.query("update matriculas set acesso_temporario_ate=statement_timestamp()-interval '1 hour' where id=$1",[enrollment]);
   const before=await state(db);
   await assert.rejects(()=>grant(),e=>e.code==='PT409');
   await assert.rejects(()=>progress(db));
   await assert.rejects(()=>db.query("select public.ead_update_aluno_progress($1,$2,'toggle_content','old-lesson','{}')",[alumno,course]),e=>e.code==='23514');
   assert.deepEqual(await state(db),before,'Denied expiry/renewal leaves progress, status and certificate history unchanged');
  });
  await t.test('canceled enrollment is denied even if its temporary deadline is in the future',async()=>{
   await db.query("update matriculas set status='CANCELADO',acesso_temporario_ate=statement_timestamp()+interval '1 hour' where id=$1",[enrollment]);
   await assert.rejects(()=>progress(db));await assert.rejects(()=>grant(),e=>e.code==='23514');
   await assert.rejects(()=>db.query("select public.ead_update_aluno_progress($1,$2,'toggle_content','old-lesson','{}')",[alumno,course]),e=>e.code==='23514');
  });
  await t.test('confirmed active enrollment keeps its own study access after the temporary deadline',async()=>{
   // ATIVO is the outcome projected by payment confirmation. This trust test
   // neither simulates a bank settlement nor grants permanent access by RPC.
   await db.query("update matriculas set status='ATIVO',acesso_temporario_ate=statement_timestamp()-interval '1 hour' where id=$1",[enrollment]);
   await assert.rejects(()=>progress(db,other),e=>e.code==='42501');
   assert.equal((await progress(db)).summary.temporaryAccess,false);
   await db.query("select public.ead_update_aluno_progress($1,$2,'set_activity_answer','old-activity','{\"answer\":\"0\"}')",[alumno,course]);
   assert.equal((await progress(db)).progress.activityAnswers['old-activity'],'0');
   assert.equal((await state(db)).enrollment.status,'ATIVO');
  });
 }finally{await db.close();}
});
