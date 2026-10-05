import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadEadExpirationTestSetup} from './ead_checkout_expiration_test_setup.mjs';

// Synthetic PostgreSQL/WASM only. No bank, Supabase or network calls.
const moduleUrl=process.env.PGLITE_MODULE_PATH
  ?pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href:'@electric-sql/pglite';
const {PGlite}=await import(moduleUrl);
const {pgcrypto}=await import(process.env.PGLITE_MODULE_PATH
  ?new URL('./contrib/pgcrypto.js',moduleUrl).href:'@electric-sql/pglite/contrib/pgcrypto');
const db=new PGlite({extensions:{pgcrypto}});
const source=name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const polo='00000000-0000-0000-0000-000000000001';
const turma='00000000-0000-0000-0000-000000000022';
const course='00000000-0000-0000-0000-000000000012';
const claim=lane=>scalar('select public.claim_banese_ead_checkout_expiration($1) value',[lane]);
const facts=()=>scalar(`select jsonb_build_object('c',(select to_jsonb(c) from public.contas_receber c where id=$1),
  'm',(select to_jsonb(m) from public.matriculas m where id=$1),'i',(select to_jsonb(i) from public.inscricoes_online i where id=$1),
  't',(select to_jsonb(t) from public.payment_gateway_transactions t where id=$1)) value`,[id(1)]);
const scenario=async action=>{await db.exec('begin');try{await action();}finally{await db.exec('rollback');}};
const blocked=async action=>{
  await db.exec('savepoint expected_block');
  await assert.rejects(action,error=>error.code==='PT409');
  await db.exec('rollback to savepoint expected_block');
};
const seed=async({state='REVIEW_REQUIRED',intent=false,waiting=false,canceled=false,attempts=6}={})=>{
  await db.query(`insert into public.banese_ead_checkout_expiration_jobs(id,receivable_id,matricula_id,
    inscription_id,transaction_id,attempt_id,environment,snapshot,expected_receivable_updated_at,
    expected_transaction_updated_at,expected_inscription_updated_at,first_expiration_day,state,processing_mode,
    attempt_count,lease_token,lease_until,remote_mutation_started_at,processing_payment_detected_at,canceled_at)
    select $2,c.id,c.matricula_id,i.id,t.id,c.ead_checkout_attempt_id,'production',internal_contas.ead_expiration_identity(c.id),
      c.updated_at,t.updated_at,i.updated_at,'2026-01-08',$3,'VERIFY',$4,
      case when $3='PROCESSING' then $5::uuid end,case when $3='PROCESSING' then now()-interval '1 second' end,
      case when $6 then now() end,case when $7 then now() end,case when $8 then now() end
    from public.contas_receber c join public.inscricoes_online i on i.receivable_id=c.id
    join public.payment_gateway_transactions t on t.receivable_id=c.id where c.id=$1`,
  [id(1),id(1001),state,attempts,id(2001),intent,waiting,canceled]);
};

try {
  await loadEadExpirationTestSetup(db);
  await db.exec(source('20261005015530_ead_checkout_expiration_release_gate.sql'));
  await db.exec(`create schema cron;create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$ declare v_id bigint;begin
      insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update
      set schedule=excluded.schedule,command=excluded.command returning jobid into v_id;return v_id;end;$$;
    insert into cron.job(jobname,schedule,command) values('banese-reconciliation-every-minute','* * * * *',
      'select ''https://synthetic.supabase.co/functions/v1/banese-reconciliation-worker''');
    insert into public.parceiros(id,nome) values('${id(1)}','Aluno QA');
    insert into public.matriculas(id,turma_id,aluno_id,status) values('${id(1)}','${turma}','${id(1)}','PENDENTE');`);
  await db.query(`insert into public.contas_receber(id,polo_id,matricula_id,turma_id,cliente_id,status,valor,
    data_vencimento,tipo_lancamento,origem_pagamento,gateway_provider,gateway_environment,gateway_payment_method,
    gateway_payment_id,gateway_boleto_nosso_numero,gateway_boleto_convenio,gateway_boleto_agencia,
    gateway_boleto_linha_digitavel,gateway_boleto_codigo_barras,gateway_submission_channel,gateway_submission_status,
    gateway_financial_terms,gateway_financial_terms_confirmed_at,gateway_status,updated_at)
    values($1,$2,$1,$3,$1,'PENDENTE',99.9,'2026-01-02','MATRICULA','GATEWAY_EAD','banese_card','production',
      'BOLETO','000000001','000000001','1','001',$4,$5,'API','API_REGISTERED',
      '{"nominalAmount":99.9,"dueDate":"2026-01-02","discount":null,"penalty":null,"interest":null}',now(),'PENDING',now())`,
  [id(1),polo,turma,'0479'+'0'.repeat(43),'0479'+'0'.repeat(40)]);
  await db.query(`insert into public.inscricoes_online(id,curso_id,turma_id,aluno_id,matricula_id,receivable_id,status,
    gateway_provider,gateway_environment,gateway_payment_id,valor,forma_pagamento)
    values($1,$2,$3,$1,$1,$1,'AGUARDANDO_PAGAMENTO','banese_card','production','000000001',99.9,'BOLETO')`,[id(1),course,turma]);
  await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,inscricao_online_id,provider_code,
    environment,payment_method,remote_payment_id,bank_slip_our_number,bank_slip_digitable_line,bank_slip_barcode,amount,remote_status)
    values($1,$1,$1,'banese_card','production','BOLETO','000000001','000000001',$2,$3,99.9,'PENDING')`,
  [id(1),'0479'+'0'.repeat(43),'0479'+'0'.repeat(40)]);
  await scalar('select internal_contas.ead_adopt_optional_attempt($1) value',[id(1)]);
  await db.query("insert into public.banese_reconciliation_queue(receivable_id,state,next_check_at) values($1,'READY',now())",[id(1)]);
  await db.exec(source('20261005020048_schedule_ead_checkout_expiration.sql'));
  await scenario(async()=>{
    await seed({state:'PROCESSING',intent:true});
    assert.equal((await claim('ACTION')).claimed,false,'Control: sixth expired lease strands the prior bank intent');
    assert.equal(await scalar('select state value from public.banese_ead_checkout_expiration_jobs'),'REVIEW_REQUIRED');
  });
  await scenario(async()=>{await seed({waiting:true});assert.equal((await claim('ACTION')).claimed,false,'Control: processing review is unavailable with configuration off');});

  const metadata=await scalar("select to_jsonb(p)-'prosrc' value from pg_proc p where oid='public.claim_banese_ead_checkout_expiration(text)'::regprocedure");
  const recovery=source('20261005023342_preserve_ead_expiration_review_recovery.sql');
  await db.exec(recovery);
  assert.deepEqual(await scalar("select to_jsonb(p)-'prosrc' value from pg_proc p where oid='public.claim_banese_ead_checkout_expiration(text)'::regprocedure"),metadata);
  await db.exec(`create or replace function internal_contas.ead_expiration_today(p_instant timestamptz default now())
    returns date language sql stable set search_path='' as $$ select date '2027-01-05';$$`);
  for(const witness of ['intent','waiting']) await scenario(async()=>{
    await seed({state:'PROCESSING',[witness]:true});const before=await facts();
    for(let crash=0;crash<6;crash++) {
      const c=await claim('ACTION');assert.equal(c.claimed,true);assert.equal(c.mode,'VERIFY');
      if(witness==='waiting') assert.equal(c.lastErrorCode,'WAITING_COMPENSATION');
      await blocked(()=>scalar('select public.start_banese_ead_checkout_expiration_mutation($1,$2,$3,$4) value',
        [c.jobId,c.leaseToken,'2026-12-31','a'.repeat(64)]));
      await db.query("update public.banese_ead_checkout_expiration_jobs set lease_until=now()-interval '1 second' where id=$1",[c.jobId]);
    }
    assert.deepEqual(await facts(),before,'GET-only recovery never rewrites the purchase during lease crashes');
    await db.query("update public.payment_gateway_transactions set remote_status='PAID' where id=$1",[id(1)]);
    await db.query(`update public.contas_receber set status='PAGO',gateway_status='PAID',origem_pagamento='BANESE',
      valor_pago=99.9,data_pagamento='2027-01-04',gateway_settlement_source='API',
      gateway_settlement_evidence='{"paymentCount":1}' where id=$1`,[id(1)]);
    await db.query("update public.inscricoes_online set status='PAGO',pago_em='2027-01-04' where id=$1",[id(1)]);
    const paid=await claim('ACTION');assert.equal(paid.mode,'VERIFY');assert.equal(paid.localPaid,true);
    assert.equal(paid.settledPaymentCount,1);
    const completed=await scalar(`select public.finish_banese_ead_checkout_expiration($1,$2,'PAID','PAID',3,1) value`,
      [paid.jobId,paid.leaseToken]);
    assert.equal(completed.state,'PAID');
    assert.equal(await scalar('select state value from public.banese_reconciliation_queue'),'DONE');
    assert.equal(await scalar('select status value from public.matriculas where id=$1',[id(1)]),'ATIVO');
    assert.equal(await scalar('select status value from public.contas_receber where id=$1',[id(1)]),'PAGO');
  });
  await scenario(async()=>{
    await db.query("update public.contas_receber set status='CANCELADO',gateway_status='CANCELED' where id=$1",[id(1)]);
    await db.query("update public.payment_gateway_transactions set remote_status='CANCELED' where id=$1",[id(1)]);
    await db.query("update public.inscricoes_online set status='CANCELADO' where id=$1",[id(1)]);
    await seed({canceled:true});const before=await facts();
    assert.equal((await claim('ACTION')).claimed,false);
    const c=await claim('OBSERVE');assert.equal(c.claimed,true);assert.equal(c.mode,'OBSERVE');
    await blocked(()=>scalar('select public.start_banese_ead_checkout_expiration_mutation($1,$2,$3,$4) value',
      [c.jobId,c.leaseToken,'2026-12-31','a'.repeat(64)]));
    assert.deepEqual(await facts(),before);
  });
  await scenario(async()=>{await seed();assert.equal((await claim('ACTION')).claimed,false);assert.equal((await claim('OBSERVE')).claimed,false);});
  assert.equal(await scalar('select count(*) value from public.banese_ead_checkout_expiration_jobs'),0,'No new job is created with readiness/configuration off');
  assert.equal(await scalar('select internal_contas.ead_expiration_release_ready() value'),false);
  await db.exec(recovery);
  assert.deepEqual(await scalar("select to_jsonb(p)-'prosrc' value from pg_proc p where oid='public.claim_banese_ead_checkout_expiration(text)'::regprocedure"),metadata);
  console.log('PASS: durable reviews recover GET-only with flag off/2027 and six further lease crashes; ordinary reviews/new mutations remain blocked.');
} finally {await db.close();}
