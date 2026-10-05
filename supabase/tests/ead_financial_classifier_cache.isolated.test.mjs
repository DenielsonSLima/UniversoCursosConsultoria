import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// PostgreSQL/WASM only. No Supabase, bank or production connections.
const packageUrl=process.env.PGLITE_MODULE_PATH
  ?pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href:'@electric-sql/pglite';
const {PGlite}=await import(packageUrl);
const {pgcrypto}=await import(process.env.PGLITE_MODULE_PATH
  ?new URL('./contrib/pgcrypto.js',packageUrl).href:'@electric-sql/pglite/contrib/pgcrypto');
const db=new PGlite({extensions:{pgcrypto}});
const source=name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const fixture=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const functionSource=(sql,name)=>{
  const start=sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
  assert.ok(start>=0,name);const tail=sql.slice(start),tag=tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0,tail.indexOf(`${tag};`)+tag.length+1);
};
const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const polo='00000000-0000-0000-0000-000000000001';
const turma='00000000-0000-0000-0000-000000000022';
const ead='00000000-0000-0000-0000-000000000012';
const snapshot=()=>scalar(`select jsonb_agg(jsonb_build_object('id',c.id,
  'optional',internal_contas.ead_checkout_is_optional(c.id),
  'october',internal_contas.ead_checkout_paid_after_cutoff(c.id,'2026-11-01'),
  'november',internal_contas.ead_checkout_paid_after_cutoff(c.id,'2026-12-01'),
  'nullCutoff',internal_contas.ead_checkout_paid_after_cutoff(c.id,null)) order by c.id) value
  from public.contas_receber c`);
const facts=()=>scalar(`select md5(jsonb_build_object('cr',(select jsonb_agg(to_jsonb(c) order by id)
  from public.contas_receber c),'m',(select jsonb_agg(to_jsonb(m) order by id) from public.matriculas m),
  'i',(select jsonb_agg(to_jsonb(i) order by id) from public.inscricoes_online i))::text) value`);

try {
  for(const f of ['caixa_monthly_optimization.fixture.sql','optional_ead_checkout.fixture.sql']) await db.exec(fixture(f));
  await db.exec(`alter table public.contas_receber add column ead_checkout_attempt_id uuid;
    create table public.ead_checkout_attempts(id uuid primary key,receivable_id uuid,nature text,
      matricula_id uuid,curso_id uuid,inscription_id uuid,transaction_id uuid,state text)`);
  await db.exec(source('20261004155607_classify_optional_ead_checkout.sql'));
  await db.exec(functionSource(source('20261004173625_preserve_optional_ead_historical_cutoff.sql'),
    'internal_contas.ead_checkout_paid_after_cutoff'));
  const projection=source('20261005015539_ead_checkout_attempt_projection.sql');
  await db.exec(projection.slice(projection.indexOf('-- The durable nature'),projection.indexOf('-- Legacy projection')));
  await db.exec(functionSource(source('20260827040000_add_margem_inadimplencia_to_caixa_compromissos.sql'),
    'public.get_caixa_prestacao_mensal_v2_core'));
  const oldOptional=await scalar("select pg_get_functiondef('internal_contas.ead_checkout_is_optional_legacy_20261004(uuid)'::regprocedure) value");
  const oldHistorical=await scalar("select pg_get_functiondef('internal_contas.ead_checkout_paid_after_cutoff_legacy_20261004(uuid,date)'::regprocedure) value");
  const add=async(n,{status='PENDENTE',origin='GATEWAY_EAD',matStatus='PENDENTE',type='MATRICULA',paid=null,partial=null,managed=false}={})=>{
    await db.query('insert into public.matriculas(id,turma_id,aluno_id,status) values($1,$2,$1,$3)',[id(n),turma,matStatus]);
    await db.query(`insert into public.contas_receber(id,polo_id,matricula_id,turma_id,cliente_id,status,
      valor,valor_pago,data_vencimento,data_pagamento,tipo_lancamento,origem_pagamento,
      gateway_provider,gateway_environment,gateway_payment_id,ead_checkout_attempt_id)
      values($1,$2,$1,$3,$1,$4,99.9,$5,'2026-10-03',$6,$7,$8,'banese_card','production',$9,$10)`,
    [id(n),polo,turma,status,paid?99.9:partial,paid,type,origin,String(n),managed?id(n):null]);
    await db.query(`insert into public.inscricoes_online(id,curso_id,turma_id,aluno_id,matricula_id,
      receivable_id,status,pago_em,gateway_provider,gateway_environment,gateway_payment_id)
      values($1,$2,$3,$1,$1,$1,$4,$5,'banese_card','production',$6)`,
    [id(n),ead,turma,paid?'PAGO':'AGUARDANDO_PAGAMENTO',paid,String(n)]);
    if(managed) await db.query(`insert into public.ead_checkout_attempts(id,receivable_id,nature,
      matricula_id,curso_id,inscription_id,state) values($1,$1,'COMPRA_OPCIONAL',$1,$2,$1,'OPEN')`,[id(n),ead]);
  };
  await add(1); // Screenshot: optional unpaid initial purchase.
  await add(2,{matStatus:'ATIVO'}); // A genuine active obligation stays debt.
  await add(3,{matStatus:'ATIVO',partial:10}); // Payment awaiting canonical repair remains optional.
  await add(4,{origin:'BANESE',matStatus:'ATIVO'});
  await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,inscricao_online_id,
    provider_code,environment,remote_payment_id,remote_status)
    values($1,$1,$1,'banese_card','production','4','PAID')`,[id(4)]);
  await add(5,{status:'PAGO',paid:'2026-11-04',matStatus:'ATIVO'});
  for(const [n,entity,action,time,details] of [
    [51,'matriculas','Criou','2026-09-26T10:00:00Z',{operacao:'INSERT'}],
    [52,'contas_receber','Recebeu pagamento','2026-11-04T12:00:00Z',{operacao:'UPDATE',camposAlterados:['status']}],
    [53,'matriculas','Liberou matrícula','2026-11-04T12:01:00Z',{operacao:'UPDATE',camposAlterados:['status']}],
  ]) await db.query('insert into public.sistema_eventos values($1,$2,$3,$4,$5,$6)',[id(n),entity,id(5),action,time,details]);
  await add(6,{status:'PAGO',paid:'2026-10-04',matStatus:'ATIVO',managed:true});
  await add(7,{status:'PAGO',paid:'2026-11-04',matStatus:'ATIVO',managed:true});
  await add(8,{status:'CANCELADO',matStatus:'ATIVO',managed:true});
  await add(9,{origin:'ADMINISTRATIVO',matStatus:'ATIVO',managed:true});
  let n=100;
  for(const status of ['PENDENTE','VENCIDO','SUSPENSO','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO','PAGO','CANCELADO',null])
    for(const origin of ['GATEWAY_EAD','GATEWAY_ONLINE','BANESE','ADMINISTRATIVO',null])
      for(const type of ['MATRICULA','MENSALIDADE',null])
        await add(n++,{status,origin,type,paid:status==='PAGO'?'2026-11-04':null});
  const old=await snapshot(),oldFacts=await facts();
  const oldOids=await scalar(`select array['internal_contas.ead_checkout_is_optional(uuid)'::regprocedure::oid,
    'internal_contas.ead_checkout_paid_after_cutoff(uuid,date)'::regprocedure::oid] value`);
  const oldCore=await scalar('select public.get_caixa_prestacao_mensal_v2_core($1,$2,3) value',[polo,'2026-10-01']);
  delete oldCore.meta.gerado_em;
  await db.exec(source('20261005021410_cache_optional_ead_financial_classifiers.sql'));
  assert.deepEqual(await snapshot(),old,'Cached guards retain every original boolean, including NULLs and future paid receipts');
  assert.equal(await facts(),oldFacts,'Read-side correction never rewrites financial or academic facts');
  assert.deepEqual(await scalar(`select array['internal_contas.ead_checkout_is_optional(uuid)'::regprocedure::oid,
    'internal_contas.ead_checkout_paid_after_cutoff(uuid,date)'::regprocedure::oid] value`),oldOids);
  const newCore=await scalar('select public.get_caixa_prestacao_mensal_v2_core($1,$2,3) value',[polo,'2026-10-01']);
  delete newCore.meta.gerado_em;
  assert.deepEqual(newCore,oldCore);
  assert.deepEqual((await snapshot()).slice(0,9).map(r=>[r.optional,r.october]),[
    [true,false],[false,false],[true,false],[true,false],[false,true],
    [false,false],[false,true],[true,false],[true,false],
  ]);

  // Poison fallback calls to prove ordinary rows and proven attempts never plan
  // the complex legacy statements. This protects the cause of the 8s incident;
  // elapsed-time thresholds would depend on the CI runner and hide that cause.
  await db.exec(`create or replace function internal_contas.ead_checkout_is_optional_legacy_20261004(p_receivable_id uuid)
    returns boolean language plpgsql stable set search_path='' as $$ begin
      raise exception 'Unexpected optional legacy fallback'; end $$;
    create or replace function internal_contas.ead_checkout_paid_after_cutoff_legacy_20261004(p_receivable_id uuid,p_payment_cutoff_exclusive date)
    returns boolean language plpgsql stable set search_path='' as $$ begin
      raise exception 'Unexpected historical legacy fallback'; end $$;`);
  assert.equal(await scalar('select internal_contas.ead_checkout_is_optional($1) value',[id(9)]),true);
  assert.equal(await scalar('select internal_contas.ead_checkout_paid_after_cutoff($1,$2) value',[id(7),'2026-11-01']),true);
  await db.exec(`insert into public.contas_receber(id,polo_id,status,valor,data_vencimento,tipo_lancamento,origem_pagamento)
    select ('00000000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,
      '${polo}','PENDENTE',100,'2026-10-03','MENSALIDADE','ADMINISTRATIVO' from generate_series(1,2000) n`);
  assert.equal(await scalar(`select count(*) value from public.contas_receber c
    where c.id::text like '00000000-0000-4000-8001-%' and not internal_contas.ead_checkout_is_optional(c.id)
      and not internal_contas.ead_checkout_paid_after_cutoff(c.id,'2026-11-01')`),2000);
  assert.equal(await scalar('select internal_contas.ead_checkout_is_optional(null) value'),false);
  assert.equal(await scalar('select internal_contas.ead_checkout_paid_after_cutoff(null,null) value'),false);
  await assert.rejects(()=>scalar('select internal_contas.ead_checkout_is_optional($1) value',[id(1)]),/Unexpected optional/);
  await assert.rejects(()=>scalar('select internal_contas.ead_checkout_is_optional($1) value',[id(4)]),/Unexpected optional/);
  await assert.rejects(()=>scalar('select internal_contas.ead_checkout_paid_after_cutoff($1,$2) value',[id(5),'2026-11-01']),/Unexpected historical/);
  await db.exec(oldOptional);await db.exec(oldHistorical);
  await db.exec(functionSource(projection,'internal_contas.ead_expiration_eligible'));
  await add(11,{managed:true,matStatus:'ATIVO'});
  await add(12,{managed:true,matStatus:'ATIVO',status:'PAGO',origin:'BANESE',paid:'2026-10-04'});
  await db.query(`update public.contas_receber set matricula_id=$1,gateway_status='PAID',
    gateway_settlement_source='API' where id=$2`,[id(11),id(12)]);
  await db.query('update public.inscricoes_online set matricula_id=$1 where id=$2',[id(11),id(12)]);
  await db.query("update public.ead_checkout_attempts set state='PAID',matricula_id=$1 where id=$2",[id(11),id(12)]);
  await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,inscricao_online_id,
    provider_code,environment,remote_payment_id,remote_status)
    values($1,$1,$1,'banese_card','production','11','PENDING')`,[id(11)]);
  await db.query(`update public.ead_checkout_attempts set state='PAYMENT_RECOVERY_FENCED',
    transaction_id=$1 where id=$1`,[id(11)]);
  const eligible=n=>scalar('select internal_contas.ead_expiration_eligible($1) value',[id(n)]);
  const eligibilitySnapshot=()=>scalar(`select jsonb_agg(jsonb_build_object('id',c.id,
    'eligible',internal_contas.ead_expiration_eligible(c.id)) order by c.id) value from public.contas_receber c
    where c.id::text like '00000000-0000-4000-8000-%'`);
  const eligibleBefore=await eligibilitySnapshot();
  const eligibilityOid=await scalar("select 'internal_contas.ead_expiration_eligible(uuid)'::regprocedure::oid value");
  await db.exec(source('20261005022413_cache_optional_ead_expiration_eligibility.sql'));
  assert.deepEqual(await eligibilitySnapshot(),eligibleBefore,'Strict legacy and duplicate cancellation decisions remain identical');
  assert.equal(await scalar("select 'internal_contas.ead_expiration_eligible(uuid)'::regprocedure::oid value"),eligibilityOid);
  assert.equal(await eligible(1),true);
  for(const n of [2,3,4,5,6,7,8,9,12]) assert.equal(await eligible(n),false);
  assert.equal(await eligible(11),true,'A canonical paid purchase permits cleanup of its own unpaid fenced sibling');
  for(const sql of [
    "update public.contas_receber set gateway_settlement_source=null where id=$1",
    "update public.contas_receber set gateway_status='PENDING' where id=$1",
    "update public.contas_receber set valor_pago=0 where id=$1",
    "update public.contas_receber set data_pagamento=null where id=$1",
    "update public.ead_checkout_attempts set state='OPEN' where id=$1",
    "update public.ead_checkout_attempts set curso_id='00000000-0000-0000-0000-000000000011' where id=$1",
  ]) {
    await db.exec('begin');await db.query(sql,[id(12)]);
    assert.equal(await eligible(11),false,'Unproven paid sibling never authorizes bank cleanup');await db.exec('rollback');
  }
  for(const sql of [
    'update public.contas_receber set valor_pago=1 where id=$1',
    "update public.contas_receber set data_pagamento='2026-10-04' where id=$1",
    'update public.contas_receber set manual_settlement_id=$1 where id=$1',
    "update public.inscricoes_online set status='PAGO' where id=$1",
    "update public.payment_gateway_transactions set remote_status='PAID' where id=$1",
  ]) {
    await db.exec('begin');await db.query(sql,[id(11)]);
    assert.equal(await eligible(11),false,'Own pending settlement blocks cancellation even with another paid purchase');await db.exec('rollback');
  }
  const oldExpiration=await scalar("select pg_get_functiondef('internal_contas.ead_checkout_can_expire(uuid)'::regprocedure) value");
  await db.exec(`create or replace function internal_contas.ead_checkout_can_expire(p_receivable_id uuid)
    returns boolean language plpgsql stable set search_path='' as $$ begin
      raise exception 'Unexpected expiration legacy fallback'; end $$;`);
  assert.equal(await scalar(`select count(*) value from public.contas_receber c
    where c.id::text like '00000000-0000-4000-8001-%' and not internal_contas.ead_expiration_eligible(c.id)`),2000);
  assert.equal(await eligible(11),true,'Durable duplicate cleanup keeps its independent canonical proof');
  await assert.rejects(()=>eligible(1),/Unexpected expiration legacy fallback/);
  await db.exec(oldExpiration);
  for(const role of ['anon','authenticated','service_role']) for(const signature of [
    'internal_contas.ead_checkout_is_optional(uuid)','internal_contas.ead_checkout_paid_after_cutoff(uuid,date)',
  ]) assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\') value',[role,signature]),false);
  for(const role of ['anon','authenticated','service_role']) assert.equal(await scalar(
    "select has_function_privilege($1,'internal_contas.ead_expiration_eligible(uuid)','execute') value",[role]),false);
  console.log('PASS: cached financial/expiration helpers preserve OIDs/facts/revenue/cutoffs/strict cancellation and skip 2,000 irrelevant legacy calls');
} finally { await db.close(); }
