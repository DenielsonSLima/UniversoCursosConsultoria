import assert from 'node:assert/strict';
import {loadEadExpirationTestSetup} from './ead_checkout_expiration_test_setup.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Local PostgreSQL/WASM only; this harness never opens a Supabase connection.
const packageUrl=process.env.PGLITE_MODULE_PATH
  ?pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href:'@electric-sql/pglite';
const {PGlite}=await import(packageUrl);
const {pgcrypto}=await import(process.env.PGLITE_MODULE_PATH
  ?new URL('./contrib/pgcrypto.js',packageUrl).href:'@electric-sql/pglite/contrib/pgcrypto');
const db=new PGlite({extensions:{pgcrypto}});
const source=(name)=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const fixture=(name)=>readFileSync(new URL(name,import.meta.url),'utf8');
const functionSource=(sql,name)=>{
  const start=sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
  assert.ok(start>=0,name);
  const tail=sql.slice(start),tag=tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0,tail.indexOf(`${tag};`)+tag.length+1);
};
const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const polo='00000000-0000-0000-0000-000000000001';
const ead='00000000-0000-0000-0000-000000000012';
const turma='00000000-0000-0000-0000-000000000022';
const technical='00000000-0000-0000-0000-000000000021';
const line='0479'+'0'.repeat(43),barcode='0479'+'0'.repeat(40);
const claim=(lane='ACTION')=>scalar('select public.claim_banese_ead_checkout_expiration($1) value',[lane]);
const begin=()=>db.exec('begin');
const rollback=()=>db.exec('rollback');
const start=(c)=>scalar('select public.start_banese_ead_checkout_expiration_mutation($1,$2,$3,$4) value',[c.jobId,c.leaseToken,'2026-12-31','a'.repeat(64)]);
const finish=(c,result,{remote=null,situation=null,payments=null,error=null}={})=>scalar(`
  select public.finish_banese_ead_checkout_expiration($1,$2,$3,$4,$5,$6,$7,$8,$9) value`,
  [c.jobId,c.leaseToken,result,remote,situation,payments,'a'.repeat(64),error,'2026-12-31']);
const facts=()=>scalar(`select jsonb_build_object(
  'receipt',(select to_jsonb(c) from public.contas_receber c where id=$1),
  'enrollment',(select to_jsonb(m) from public.matriculas m where id=$1),
  'inscription',(select to_jsonb(i) from public.inscricoes_online i where id=$1),
  'transaction',(select to_jsonb(t) from public.payment_gateway_transactions t where id=$1)) value`,[id(1)]);
const readyAgain=(c)=>db.query(`update public.banese_ead_checkout_expiration_jobs
  set next_attempt_at=now()-interval '1 second' where id=$1`,[c.jobId]);

try{
  await loadEadExpirationTestSetup(db);
  const add=async(n,modality='EAD')=>{
    const t=modality==='EAD'?turma:technical,course=modality==='EAD'?ead:'00000000-0000-0000-0000-000000000011';
    await db.query(`insert into public.parceiros(id,nome) values($1,'Aluno QA')`,[id(n)]);
    await db.query(`insert into public.matriculas(id,turma_id,aluno_id,status) values($1,$2,$1,'PENDENTE')`,[id(n),t]);
    await db.query(`insert into public.contas_receber(id,polo_id,matricula_id,turma_id,cliente_id,status,
      valor,data_vencimento,tipo_lancamento,origem_pagamento,gateway_provider,gateway_environment,
      gateway_payment_method,gateway_payment_id,gateway_boleto_nosso_numero,gateway_boleto_convenio,
      gateway_boleto_agencia,gateway_boleto_linha_digitavel,gateway_boleto_codigo_barras,
      gateway_submission_channel,gateway_submission_status,gateway_financial_terms,
      gateway_financial_terms_confirmed_at,gateway_status,updated_at)
      values($1,$2,$1,$3,$1,'PENDENTE',99.9,'2026-01-02','MATRICULA','GATEWAY_EAD','banese_card',
      'production','BOLETO',$4,$4,'1','001',$5,$6,'API','API_REGISTERED',
      '{"nominalAmount":99.9,"dueDate":"2026-01-02","discount":null,"penalty":null,"interest":null}',
      now(),'PENDING',now())`,[id(n),polo,t,String(n).padStart(9,'0'),line,barcode]);
    await db.query(`insert into public.inscricoes_online(id,curso_id,turma_id,aluno_id,matricula_id,
      receivable_id,status,gateway_provider,gateway_environment,gateway_payment_id,valor,forma_pagamento)
      values($1,$2,$3,$1,$1,$1,'AGUARDANDO_PAGAMENTO','banese_card','production',$4,99.9,'BOLETO')`,
    [id(n),course,t,String(n).padStart(9,'0')]);
    await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,remote_status,
      provider_code,environment,payment_method,remote_payment_id,bank_slip_our_number,
      bank_slip_digitable_line,bank_slip_barcode,inscricao_online_id,amount,installments,origin_polo_id)
      values($1,$1,'PENDING','banese_card','production','BOLETO',$2,$2,$3,$4,$1,99.9,1,$5)`,
    [id(n),String(n).padStart(9,'0'),line,barcode,polo]);
    await db.query(`insert into public.banese_reconciliation_queue(receivable_id,state,next_check_at)
      values($1,'READY',now())`,[id(n)]);
  };
  await add(1);await add(2,'TECNICO');
  await scalar('select internal_contas.ead_adopt_optional_attempt($1) value',[id(1)]);
  const original=await facts();
  assert.equal((await claim()).claimed,false,'Disabled lane never creates a job');
  await db.exec("update public.banese_ead_checkout_expiration_config set enabled=true where environment='production'");
  assert.equal((await claim()).claimed,false,'Unverified local banking calendar fails closed');
  await db.exec("update public.banese_ead_checkout_expiration_config set verified_local_holidays='{}',verified_polo_ids=array['00000000-0000-0000-0000-000000000001'::uuid] where environment='production'");
  assert.equal(await scalar("select internal_contas.ead_expiration_first_day('2026-10-03','{}')::text value"),'2026-10-09');
  assert.equal(await scalar("select internal_contas.ead_expiration_first_day('2026-10-03',array['2026-10-06'::date])::text value"),'2026-10-10');
  assert.equal(await scalar("select internal_contas.ead_expiration_first_day('2026-12-28','{}') value"),null,'2027 eligibility is unverified');

  await begin();
  const c=await claim();
  assert.equal(c.claimed,true);assert.equal(c.receivableId,id(1));assert.equal(c.mode,'CANCEL');
  assert.equal((await claim()).claimed,false,'A leased title cannot be claimed twice and Technical is excluded');
  assert.deepEqual(await facts(),original,'Claim never mutates receipt or academic state');
  const blocked=[
    ["update public.contas_receber set valor=1 where id=$1",[id(1)]],
    ["update public.inscricoes_online set aluno_id=$2 where id=$1",[id(1),id(2)]],
    ["update public.inscricoes_online set curso_id=$2 where id=$1",[id(1),id(2)]],
    ["update public.payment_gateway_transactions set receivable_id=$2 where id=$1",[id(2),id(1)]],
    ["insert into public.payment_gateway_transactions(id,receivable_id) values($1,$2)",[id(900),id(1)]],
    ["update public.matriculas set status='ATIVO' where id=$1",[id(1)]],
    ["update public.matriculas set turma_id=$2 where id=$1",[id(1),technical]],
    ["update public.turmas set curso_id=$2 where id=$1",[turma,id(2)]],
    ["update public.cursos set modalidade='TECNICO' where id=$1",[ead]],
    ["insert into public.ead_aluno_progresso(id,aluno_id,curso_id,started_at) values($1,$1,$2,now())",[id(1),ead]],
  ];
  for(const [sql,args]of blocked){
    await db.exec('savepoint guard_test');
    await assert.rejects(()=>db.query(sql,args),e=>e.code==='PT409',sql);
    await db.exec('rollback to guard_test');
  }
  assert.equal(await start(c),true);
  await finish(c,'CANCELED',{remote:'CANCELED',situation:5,payments:0});
  const canceled=await facts();
  assert.equal(canceled.receipt.status,'CANCELADO');assert.equal(canceled.receipt.gateway_status,'CANCELED');
  assert.equal(canceled.transaction.remote_status,'CANCELED');assert.equal(canceled.inscription.status,'CANCELADO');
  assert.equal(canceled.enrollment.status,'PENDENTE','Closing an attempt preserves the shared academic enrollment');
  assert.equal(canceled.receipt.gateway_boleto_nosso_numero,original.receipt.gateway_boleto_nosso_numero);
  await db.exec("update public.banese_ead_checkout_expiration_config set verified_local_holidays=null where environment='production'");
  await readyAgain(c);const obs=await claim('OBSERVE');assert.equal(obs.mode,'OBSERVE');assert.deepEqual(obs.verifiedLocalHolidays,[]);
  await finish(obs,'RETRY',{error:'NETWORK'});
  const observedRetry=await scalar('select to_jsonb(j) value from public.banese_ead_checkout_expiration_jobs j where id=$1',[c.jobId]);
  assert.ok(new Date(observedRetry.next_attempt_at)-new Date(observedRetry.updated_at)>=86_400_000);
  await db.query("update public.banese_ead_checkout_expiration_jobs set observe_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where id=$1",[c.jobId]);
  const pastAlert=await claim('OBSERVE');assert.equal(pastAlert.mode,'OBSERVE','Fourteen days is an alert, not a stop for payment recovery');
  await finish(pastAlert,'OBSERVED_UNPAID',{remote:'CANCELED',situation:5,payments:0});
  await readyAgain(c);
  await db.query("update public.banese_ead_checkout_expiration_jobs set observe_until=now()+interval '14 days' where id=$1",[c.jobId]);
  const late=await claim('OBSERVE');
  await finish(late,'REVIEW_REQUIRED',{remote:'PAID',situation:3,payments:1,error:'LATE_PAYMENT_DETECTED'});
  assert.equal(await scalar('select state value from public.banese_reconciliation_queue where receivable_id=$1',[id(1)]),'QUARANTINED');
  assert.equal(await scalar("select count(*)::int value from public.banese_ead_checkout_expiration_events where event='REVIEW_REQUIRED' and evidence->>'code'='LATE_PAYMENT_DETECTED'"),1);
  assert.deepEqual(await facts(),canceled,'Late payment is recorded for review without rewriting canceled bank history');
  await rollback();

  // A concurrent timestamp change rejects the pre-PUT CAS.
  await begin();const changed=await claim();
  await db.query("update public.contas_receber set updated_at=now()+interval '1 second' where id=$1",[id(1)]);
  await assert.rejects(()=>start(changed),e=>e.code==='PT409');await rollback();

  // Explicit processing refusal survives lease expiration and never uses 5min cap.
  await begin();const waiting=await claim();await start(waiting);
  await finish(waiting,'RETRY',{error:'WAITING_COMPENSATION'});
  let w=await scalar('select to_jsonb(j) value from public.banese_ead_checkout_expiration_jobs j where id=$1',[waiting.jobId]);
  assert.ok(w.processing_payment_detected_at);assert.equal(w.state,'RETRY');
  assert.ok(new Date(w.next_attempt_at)-new Date(w.updated_at)>=86_400_000);
  await db.query("update public.banese_ead_checkout_expiration_jobs set next_attempt_at=now()-interval '1 second',attempt_count=20 where id=$1",[waiting.jobId]);
  const verify=await claim();assert.equal(verify.mode,'VERIFY');assert.equal(verify.lastErrorCode,'WAITING_COMPENSATION');
  await db.query("update public.banese_ead_checkout_expiration_jobs set lease_until=now()-interval '1 second' where id=$1",[waiting.jobId]);
  const expired=await claim();assert.equal(expired.claimed,true);assert.equal(expired.lastErrorCode,'WAITING_COMPENSATION');
  await finish(expired,'RETRY',{error:'WAITING_COMPENSATION'});
  assert.equal(await scalar('select state value from public.banese_ead_checkout_expiration_jobs where id=$1',[waiting.jobId]),'RETRY');
  await db.exec("update public.banese_ead_checkout_expiration_config set verified_local_holidays=null where environment='production'");
  await readyAgain(waiting);const noCalendar=await claim();
  assert.equal(noCalendar.claimed,true);assert.equal(noCalendar.mode,'VERIFY');assert.deepEqual(noCalendar.verifiedLocalHolidays,[]);
  await finish(noCalendar,'RETRY',{error:'WAITING_COMPENSATION'});
  await db.exec("update public.banese_ead_checkout_expiration_config set verified_local_holidays=array['2027-01-01'::date] where environment='production'");
  await readyAgain(waiting);const changedCalendar=await claim();
  assert.equal(changedCalendar.claimed,true);assert.equal(changedCalendar.mode,'VERIFY');
  await rollback();

  // Banese natural expiry is GET-only and keeps the bank's terminal status.
  await begin();await db.query("update public.contas_receber set gateway_status='EXPIRED' where id=$1",[id(1)]);
  await db.query("update public.payment_gateway_transactions set remote_status='EXPIRED' where id=$1",[id(1)]);
  const natural=await claim();assert.equal(natural.mode,'VERIFY');
  await finish(natural,'CANCELED',{remote:'EXPIRED',situation:4,payments:0});
  assert.equal((await facts()).receipt.gateway_status,'EXPIRED');await rollback();
  for(const [remote,situation]of [['EXPIRED',5],['CANCELED',4]]){
    await begin();const mixed=await claim();
    await assert.rejects(()=>finish(mixed,'CANCELED',{remote,situation,payments:0}),e=>e.code==='PT409');
    await rollback();
  }

  // Existing payment reconciliation changes origin and projects academic access.
  await begin();const paid=await claim();
  await db.query("update public.payment_gateway_transactions set remote_status='PAID',updated_at=clock_timestamp() where id=$1",[id(1)]);
  await db.query(`update public.contas_receber set status='PAGO',gateway_status='PAID',origem_pagamento='BANESE',
    data_pagamento='2026-10-04',valor_pago=99.9,gateway_settlement_source='API',
    gateway_settlement_evidence='{"paymentCount":1}',updated_at=clock_timestamp() where id=$1`,[id(1)]);
  await db.query("update public.matriculas set status='ATIVO' where id=$1",[id(1)]);
  await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1",[id(1)]);
  await finish(paid,'RETRY',{error:'POST_SETTLEMENT_PENDING'});await readyAgain(paid);
  await db.exec("update public.banese_ead_checkout_expiration_config set verified_local_holidays=null where environment='production'");
  const resumed=await claim();assert.equal(resumed.localPaid,true);assert.equal(resumed.mode,'VERIFY');
  assert.deepEqual(resumed.verifiedLocalHolidays,[]);
  await finish(resumed,'PAID',{remote:'PAID',situation:3,payments:1});
  assert.equal((await facts()).enrollment.status,'ATIVO');
  assert.equal((await facts()).receipt.status,'PAGO');
  await db.query("update public.inscricoes_online set erro='Legitimate later metadata update' where id=$1",[id(1)]);
  await rollback();
  for(const role of ['anon','authenticated']){
    for(const signature of ['public.claim_banese_ead_checkout_expiration(text)',
      'public.start_banese_ead_checkout_expiration_mutation(uuid,uuid,date,text)',
      'public.finish_banese_ead_checkout_expiration(uuid,uuid,text,text,integer,integer,text,text,date)']){
      assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\') value',[role,signature]),false);
    }
  }
  console.log('PASS EAD expiration: verified calendar/config, canonical claim/lease, full financial/academic fences, confirmed cancel/expiry, immutable history, real academic trigger, late-payment quarantine, processing-refusal recovery, paid retry, ACL');
}finally{await db.close();}
