import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleUrl=process.env.PGLITE_MODULE_PATH
  ?pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href:'@electric-sql/pglite';
const {PGlite}=await import(moduleUrl);
const db=new PGlite();
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const source=name=>read(`../migrations/${name}`);
const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const turma='00000000-0000-0000-0000-000000000022';
const course='00000000-0000-0000-0000-000000000012';
const polo='00000000-0000-0000-0000-000000000001';
const actor=id(900),otherActor=id(901);
const functionSource=(sql,name)=>{
  const start=sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
  assert.ok(start>=0,name);const tail=sql.slice(start),tag=tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0,tail.indexOf(`${tag};`)+tag.length+1);
};
const role=name=>db.query('update test_caixa.access_state set role_name=$1',[name]);
const free=(n,request=1000+n,who=turma,confirm=true)=>scalar(
  'select public.ead_adicionar_aluno_sem_cobranca_secure($1,$2,$3,$4) value',[who,id(n),id(request),confirm]);
const charge=(n,request=2000+n)=>scalar(`select public.ead_prepare_checkout_attempt(
  $1,$2,$3,'banese_card','sandbox','BOLETO',129.9,'2028-12-31','Curso sintético',null,null,true) value`,[id(n),turma,id(request)]);
const addStudent=n=>db.query("insert into public.parceiros(id,nome,cpf_cnpj) values($1,'Aluno sintético','00000000000')",[id(n)]);
const denied=fn=>assert.rejects(fn,error=>error.code==='42501');
const dashboard=()=>scalar('select public.ead_get_turma_dashboard($1) value',[turma]);

try {
  for(const file of ['caixa_monthly_optimization.fixture.sql','optional_ead_checkout.fixture.sql',
    'ead_checkout_expiration.fixture.sql','ead_checkout_attempts.fixture.sql']) {
    await db.exec(read(file).replace('CREATE EXTENSION pgcrypto WITH SCHEMA extensions;',''));
  }
  for(const file of ['20261005015448_ead_checkout_expiration_schema.sql',
    '20261005015533_ead_checkout_attempt_model.sql','20261005015535_ead_checkout_attempt_reservation.sql',
    '20261105230100_allow_manager_ead_private_course_checkout.sql']) await db.exec(source(file));
  await db.exec(read('ead_no_charge_enrollment.fixture.sql'));
  const deferred=source('20260809060000_create_deferred_technical_financial_activation.sql');
  await db.exec(functionSource(deferred,'internal_academic.ensure_technical_financial_pending')
    .replace('internal_academic.ensure_technical_financial_pending(',
      'internal_academic.ensure_technical_financial_pending_before_proesc_bootstrap('));
  await db.exec(functionSource(source('20260913191200_proesc_imported_cycle_configuration.sql'),
    'internal_academic.ensure_technical_financial_pending'));
  await db.exec(functionSource(deferred,'public.criar_financeiro_ao_matricular'));
  await db.exec(functionSource(source('20260812005933_create_nontechnical_single_plan_financial.sql'),
    'internal_academic.guard_nontechnical_single_plan_enrollment'));
  await db.exec(`create trigger test_actual_finance after insert or update of status on public.matriculas
    for each row when(new.status='ATIVO') execute function public.criar_financeiro_ao_matricular();
    create trigger test_actual_plan before insert or update or delete on public.matriculas
    for each row execute function internal_academic.guard_nontechnical_single_plan_enrollment();
    create function internal_contas.ead_expiration_write_allowed(uuid) returns boolean language sql as $$select false$$;`);
  await db.exec(source('20261105234500_ead_manager_no_charge_enrollment.sql'));
  await db.exec(source('20261105234600_ead_dashboard_financial_facts.sql'));
  await db.query('insert into auth.users values($1),($2)',[actor,otherActor]);
  const full={modules:['gestao','financeiro']};
  await db.query(`insert into public.usuarios_sistema(id,auth_user_id,perfil,status,personalizar_permissoes,permissoes)
    values($1,$1,'gestor','ativo',true,$3),($2,$2,'financeiro','ativo',true,$3)`,[actor,otherActor,JSON.stringify(full)]);
  await db.query("update test_caixa.access_state set role_name='authenticated',actor=$1",[actor]);
  await db.query('update public.cursos set publicar_site=false where id=$1',[course]);
  for(let n=1;n<=10;n++) await addStudent(n);
  const first=await free(1);
  assert.equal(first.mode,'SEM_COBRANCA');assert.equal(first.status,'ATIVO');
  assert.equal(await scalar('select count(*)::int value from public.contas_receber'),0);
  assert.equal(await scalar('select count(*)::int value from public.inscricoes_online'),0);
  assert.equal(await scalar('select count(*)::int value from public.ead_checkout_attempts'),0);
  assert.deepEqual(await scalar(`select jsonb_build_array(financeiro_herdado,gerar_cobranca_inicial,
    gerar_cobranca_futura,sincronizar_asaas) value from public.matriculas where id=$1`,[first.matriculaId]),[false,false,false,false]);
  assert.equal((await dashboard()).receitaConfirmada,0,'Free enrollment never becomes revenue');
  assert.equal((await dashboard()).receitaPrevista,0,'Free enrollment never becomes a receivable');
  assert.equal((await free(1)).replayed,true);
  await assert.rejects(()=>free(2,1001),error=>error.code==='22023');
  await db.query('update test_caixa.access_state set actor=$1',[otherActor]);
  await assert.rejects(()=>free(1),error=>error.code==='22023');
  await db.query('update test_caixa.access_state set actor=$1',[actor]);
  await db.query("update public.usuarios_sistema set permissoes='{\"modules\":[\"gestao\",\"caixa\"]}' where auth_user_id=$1",[actor]);
  await denied(()=>free(1));await denied(()=>free(2));
  await db.query('update public.usuarios_sistema set permissoes=$2 where auth_user_id=$1',[actor,JSON.stringify(full)]);
  await db.exec('update test_caixa.access_state set scoped_allowed=false,global_allowed=false');await denied(()=>free(2));
  await db.exec('update test_caixa.access_state set scoped_allowed=true,global_allowed=true,identity_allowed=false');await denied(()=>free(2));
  await db.exec('update test_caixa.access_state set identity_allowed=true');
  await db.query("update public.usuarios_sistema set perfil='secretaria' where auth_user_id=$1",[actor]);await denied(()=>free(2));
  await db.query("update public.usuarios_sistema set perfil='gestor' where auth_user_id=$1",[actor]);
  await role('service_role');await denied(()=>free(2));await role('anon');await denied(()=>free(2));await role('authenticated');
  await assert.rejects(()=>free(2,1002,turma,false),error=>error.code==='22023');
  const profile=id(950);
  await db.query('insert into public.perfis_acesso values($1,$2)',[profile,JSON.stringify({modules:['gestao']})]);
  await db.query('update public.usuarios_sistema set perfil_acesso_id=$2,personalizar_permissoes=false where auth_user_id=$1',[actor,profile]);
  await denied(()=>free(2));
  await db.query('update public.perfis_acesso set permissoes=$2 where id=$1',[profile,JSON.stringify(full)]);
  const inherited=await free(2);assert.equal(inherited.status,'ATIVO','Effective inherited Financeiro access is accepted');
  await db.query('update public.usuarios_sistema set personalizar_permissoes=true where auth_user_id=$1',[actor]);
  await db.query('insert into public.turmas_plano_financeiro_unico values($1)',[turma]);
  await assert.rejects(()=>free(3),error=>error.code==='PT409');
  await db.exec('truncate public.turmas_plano_financeiro_unico');
  const [one,two]=await Promise.all([free(3),free(3)]);
  assert.equal(one.matriculaId,two.matriculaId);assert.equal(two.replayed,true);
  await role('service_role');
  const freeFirst=await charge(3);assert.equal(freeFirst.action,'ALREADY_PAID');
  assert.equal(await scalar('select count(*)::int value from public.contas_receber'),0,'Checkout cannot create a title after free access');
  const pending=await charge(4);assert.equal(pending.action,'CREATE');
  await role('authenticated');await assert.rejects(()=>free(4),error=>error.code==='PT409');
  assert.equal(await scalar('select status value from public.matriculas where id=$1',[pending.matriculaId]),'PENDENTE');
  await db.exec(`create function public.test_checkout(n uuid,request uuid) returns jsonb language plpgsql as $$
    declare result jsonb;
    begin
      update test_caixa.access_state set role_name='service_role';
      result:=public.ead_prepare_checkout_attempt(n,'${turma}',request,'banese_card','sandbox','BOLETO',
        129.9,'2028-12-31','Curso sintético',null,null,true);
      update test_caixa.access_state set role_name='authenticated';
      return result;
    end; $$;`);
  // PostgreSQL/WASM has one connection. Queue both actual RPCs together to
  // exercise both serialized interleavings with independent claim contexts.
  const concurrentCharge=n=>scalar('select public.test_checkout($1,$2) value',[id(n),id(3000+n)]);
  const [freeRace,chargeRace]=await Promise.all([free(5),concurrentCharge(5)]);
  assert.equal(freeRace.status,'ATIVO');assert.equal(chargeRace.action,'ALREADY_PAID');
  const [paidRace,noChargeRace]=await Promise.allSettled([concurrentCharge(8),free(8)]);
  assert.equal(paidRace.status,'fulfilled');assert.equal(noChargeRace.status,'rejected');
  assert.equal(noChargeRace.reason.code,'PT409');
  const freeDefinition=await scalar("select pg_get_functiondef('public.ead_adicionar_aluno_sem_cobranca_secure(uuid,uuid,uuid,boolean)'::regprocedure) value");
  const checkoutDefinition=await scalar("select pg_get_functiondef('public.ead_prepare_checkout_attempt(uuid,uuid,uuid,text,text,text,numeric,date,text,numeric,numeric,boolean)'::regprocedure) value");
  assert.ok(freeDefinition.includes("'ead_checkout:'||p_aluno_id::text||':'||v_t.curso_id::text"));
  assert.ok(checkoutDefinition.includes("'ead_checkout:'||p_aluno_id::text||':'||v_t.curso_id::text"));
  await role('authenticated');
  await db.query(`insert into public.contas_receber(id,polo_id,cliente_id,turma_id,valor,status)
    values($1,$2,$3,$4,129.9,'PENDENTE')`,[id(600),polo,id(6),turma]);
  await assert.rejects(()=>free(6),error=>error.code==='PT409');
  assert.equal(await scalar('select count(*)::int value from public.matriculas where aluno_id=$1',[id(6)]),0);
  await db.query(`insert into public.inscricoes_online(id,curso_id,turma_id,aluno_id,status,valor,pago_em,asaas_payment_id)
    values($1,$2,$3,$4,'PAGO',30,now(),'legacy-synthetic')`,[id(700),course,turma,id(7)]);
  await assert.rejects(()=>free(7),error=>error.code==='PT409');
  await db.query(`insert into public.contas_receber(id,polo_id,turma_id,cliente_id,valor,valor_pago,status,data_pagamento,tipo_lancamento,asaas_payment_id)
    values($1,$2,$3,$4,100,80,'PAGO',current_date,'MATRICULA','legacy-synthetic')`,[id(800),polo,turma,id(8)]);
  const stats=await dashboard();
  assert.equal(stats.receitaConfirmada,80,'Use actual 80 received, not nominal 100 or duplicate legacy 30');
  assert.equal(stats.receitaPrevista>=100,true);
  await db.query(`insert into public.inscricoes_online(id,curso_id,turma_id,aluno_id,status,valor,pago_em,asaas_payment_id)
    values($1,$2,$3,$4,'PAGO',25,now(),'legacy-only')`,[id(701),course,turma,id(9)]);
  assert.equal((await dashboard()).receitaConfirmada,105,'Preserve bank-backed legacy receipt without a receivable');
  await db.query(`insert into public.inscricoes_online(id,curso_id,turma_id,aluno_id,status,valor,pago_em,forma_pagamento)
    values($1,$2,$3,$4,'PAGO',999,now(),'MANUAL')`,[id(702),course,turma,id(10)]);
  assert.equal((await dashboard()).receitaConfirmada,105,'Manual academic PAGO without bank proof never fabricates revenue');
  await db.query(`insert into public.contas_receber(id,polo_id,turma_id,cliente_id,valor,valor_pago,status,data_pagamento)
    values($1,$2,$3,$4,100,40,'PENDENTE',current_date)`,[id(850),polo,turma,id(9)]);
  await db.query(`insert into public.financial_payment_events(id,source_kind,source_id,payment_cents)
    values($1,'RECEIVABLE',$2,4000)`,[id(851),id(850)]);
  assert.equal((await dashboard()).receitaConfirmada,145,'Canonical partial ledger income counts while enrollment remains pending');
  await db.query('update public.financial_payment_events set reversed_at=now() where id=$1',[id(851)]);
  assert.equal((await dashboard()).receitaConfirmada,105,'Reversed ledger proof never falls back to stale valor_pago');
  await addStudent(11);
  await db.exec(`create function public.test_unexpected_charge() returns trigger language plpgsql as $$
    begin
      if new.aluno_id='${id(11)}' then
        insert into public.contas_receber(id,polo_id,cliente_id,turma_id,matricula_id,valor,status)
          values(gen_random_uuid(),'${polo}',new.aluno_id,new.turma_id,new.id,129.9,'PENDENTE');
      end if;
      return new;
    end; $$;
    create trigger z_test_unexpected_charge after insert on public.matriculas
      for each row execute function public.test_unexpected_charge();`);
  await assert.rejects(()=>free(11),error=>error.code==='PT409');
  assert.equal(await scalar('select count(*)::int value from public.matriculas where aluno_id=$1',[id(11)]),0);
  assert.equal(await scalar('select count(*)::int value from public.contas_receber where cliente_id=$1',[id(11)]),0);
  await assert.rejects(()=>db.exec('delete from internal_academic.ead_no_charge_enrollments'),error=>error.code==='42501');
  assert.equal(await scalar("select has_function_privilege('service_role','public.ead_adicionar_aluno_sem_cobranca_secure(uuid,uuid,uuid,boolean)','EXECUTE') value"),false);
  console.log('PASS: free EAD zero receipts, effective Financeiro-only auth, scope/identity/replay guards, shared checkout serialization, immutable audit and financial facts dashboard.');
} catch(error){console.error(error.message,error.where||'',error.detail||'');process.exitCode=1;}
finally{await db.close();}
