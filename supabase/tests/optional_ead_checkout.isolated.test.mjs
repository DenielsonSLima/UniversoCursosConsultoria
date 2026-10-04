import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// PostgreSQL/WASM memory only. Never opens a Supabase connection.
const packageUrl = process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
const { PGlite } = await import(packageUrl);
const { pgcrypto } = await import(process.env.PGLITE_MODULE_PATH
  ? new URL('./contrib/pgcrypto.js',packageUrl).href : '@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
const source = (name) => readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const fixture = (name) => readFileSync(new URL(name,import.meta.url),'utf8');
const functionSource = (sql,name) => {
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
const optional=(n)=>scalar('select internal_contas.ead_checkout_is_optional($1) value',[id(n)]);
const canExpire=(n)=>scalar('select internal_contas.ead_checkout_can_expire($1) value',[id(n)]);
const summary=()=>scalar("select public.get_receivables_modality_summary_v3_secure('EAD',$1,null,null,'2026-10-01','2026-10-31') value",[polo]);
const positioned=()=>scalar("select jsonb_agg(jsonb_build_object('id',id,'state',monthly_position) order by id) value from internal_contas.caixa_receivables_position_rows($1,'2026-10-01','2026-10-04')",[polo]);
const delinquency=()=>scalar("select internal_contas.caixa_monthly_delinquency($1,'2026-10-01','2026-10-04') value",[polo]);
const finances=()=>scalar(`select md5(jsonb_build_object(
  'receipts',(select jsonb_agg(to_jsonb(c) order by id) from public.contas_receber c),
  'enrollments',(select jsonb_agg(to_jsonb(m) order by id) from public.matriculas m),
  'inscriptions',(select jsonb_agg(to_jsonb(i) order by id) from public.inscricoes_online i))::text) value`);

try {
  await db.exec(fixture('caixa_monthly_optimization.fixture.sql'));
  await db.exec(fixture('optional_ead_checkout.fixture.sql'));
  const baselines=[
    ['20260827035500_deterministic_banese_settlement_composition.sql','public.resolve_receivable_financial_composition'],
    ['20260913010000_caixa_monthly_delinquency.sql','internal_contas.caixa_monthly_receivable_state'],
    ['20260913010000_caixa_monthly_delinquency.sql','internal_contas.caixa_monthly_delinquency'],
    ['20261002011400_caixa_review_drilldown.sql','internal_contas.caixa_receivables_position_rows'],
    ['20260913132033_caixa_open_receivables_evidence.sql','internal_contas.caixa_open_receivables'],
    ['20260827040000_add_margem_inadimplencia_to_caixa_compromissos.sql','public.get_caixa_prestacao_mensal_v2_core'],
    ['20260716150931_optimize_caixa_secretaria_loading.sql','public.get_caixa_dashboard_secure'],
    ['20260827130000_create_caixa_linha_corte_rpc.sql','public.get_caixa_linha_corte_secure'],
    ['20260812141118_add_financial_report_summaries_and_ar_aging.sql','public.get_relatorio_inadimplencia_secure'],
    ['20260912133433_align_receivables_page_payment_period.sql','public.get_receivables_modality_page_v3_secure'],
    ['20260912133700_align_receivables_groups_payment_period.sql','public.get_receivables_modality_groups_page_v3_secure'],
    ['20260912133702_align_receivables_summary_payment_period.sql','public.get_receivables_modality_summary_v3_secure'],
  ];
  for(const [file,name] of baselines) await db.exec(functionSource(source(file),name));
  await db.exec(source('20261004155607_classify_optional_ead_checkout.sql'));
  const add=async(n,{status='PENDENTE',origin='GATEWAY_EAD',modality='EAD',matStatus='PENDENTE',paid=null,amount=99.9}={})=>{
    const t=modality==='EAD'?turma:technical;
    await db.query('insert into public.matriculas(id,turma_id,aluno_id,status) values($1,$2,$1,$3)',[id(n),t,matStatus]);
    await db.query(`insert into public.contas_receber(id,polo_id,matricula_id,turma_id,cliente_id,status,
      valor,valor_pago,data_vencimento,data_pagamento,tipo_lancamento,origem_pagamento,categoria,
      gateway_provider,gateway_environment,gateway_payment_id)
      values($1,$2,$1,$3,$1,$4,$5,$6,'2026-10-03',$7,'MATRICULA',$8,'MENSALIDADE',
        'banese_card','production',$9)`,
    [id(n),polo,t,status,amount,paid?amount:null,paid,origin,String(n).padStart(9,'0')]);
    await db.query(`insert into public.inscricoes_online(id,curso_id,turma_id,aluno_id,matricula_id,
      receivable_id,status,gateway_provider,gateway_environment,gateway_payment_id)
      values($1,$2,$3,$1,$1,$1,'AGUARDANDO_PAGAMENTO','banese_card','production',$4)`,
    [id(n),modality==='EAD'?ead:'00000000-0000-0000-0000-000000000011',t,String(n).padStart(9,'0')]);
  };
  await add(1); // Screenshot: date overdue but no contracted debt.
  await add(2,{status:'VENCIDO'}); // An old status worker cannot turn a attempt into debt.
  await add(3,{modality:'TECNICO',amount:250});
  await add(4,{status:'PAGO',matStatus:'ATIVO',paid:'2026-10-04',amount:100});
  await add(5,{origin:'ADMINISTRATIVO',amount:75});
  await add(6,{matStatus:'ATIVO',amount:80});
  for(const n of [1,2]) {
    assert.equal(await optional(n),true);
    assert.equal(await canExpire(n),true);
  }
  for(const n of [3,4,5,6,999]) {
    assert.equal(await optional(n),false);
    assert.equal(await canExpire(n),false);
  }
  await db.exec('begin');
  await db.query("update public.contas_receber set origem_pagamento='GATEWAY_ONLINE' where id=$1",[id(1)]);
  assert.equal(await optional(1),true,'Generic online EAD checkout is an optional initial purchase');
  await db.query("update public.contas_receber set origem_pagamento='BANESE',status='PAGO',valor_pago=valor,data_pagamento='2026-10-04' where id=$1",[id(1)]);
  assert.equal(await optional(1),false,'Online-origin payment reconciled by Banese becomes confirmed revenue');
  await db.exec('rollback');

  const beforeFacts=await finances(),before=await delinquency();
  assert.equal(before.receber_vencido,604.8);
  const candidates=[source('20261004155625_exclude_optional_ead_from_debt.sql'),
    source('20261004155644_exclude_optional_ead_from_overdue_receivables.sql')];
  // A missing eligibility anchor aborts instead of silently leaving old debt.
  await db.exec('begin');
  await db.exec(`create or replace function public.get_caixa_dashboard_secure(p_polo_id uuid default null)
    returns jsonb language sql as $$ select '{}'::jsonb $$`);
  await assert.rejects(()=>db.exec(candidates[0]),/drifted/);
  await db.exec('rollback');
  for(const sql of candidates) await db.exec(sql);
  assert.equal(await finances(),beforeFacts,'Read-side DDL never changes bank/enrollment facts');
  const after=await delinquency();
  assert.equal(after.receber_vencido,405);
  assert.equal(after.inadimplencia_mensal.base_elegivel,505);
  assert.equal(after.inadimplencia_mensal.quantidade_elegiveis,4);
  assert.deepEqual((await positioned()).map(x=>x.id),[3,4,5,6].map(id));
  assert.equal((await positioned()).find(x=>x.id===id(4)).state,'SETTLED');
  const s=await summary();
  assert.equal(s.pending_count,4,'Pending keeps all online attempts and established obligations');
  assert.equal(s.pending_value,354.8);
  assert.equal(s.overdue_count,0);
  assert.equal(s.overdue_value,0);
  assert.equal(s.optional_checkout_count,2);
  assert.equal(s.optional_checkout_value,199.8);
  assert.equal(s.received_value,100,'Confirmed payment always remains revenue');
  for(const fn of ['page','groups_page']){
    const args=fn==='page'?"'none',null,1,25":"'student',1,25";
    const payload=await scalar(`select public.get_receivables_modality_${fn}_v3_secure(
      'EAD',$1,null,null,'2026-10-01','2026-10-31','overdue',${args}) value`,[polo]);
    assert.equal(payload.total_items,0,'Optional checkout is absent from overdue filters');
    const pending=await scalar(`select public.get_receivables_modality_${fn}_v3_secure(
      'EAD',$1,null,null,'2026-10-01','2026-10-31','pending',${args}) value`,[polo]);
    assert.equal(fn==='page'?pending.total_items:pending.total_receivables,4);
  }
  const core=await scalar("select public.get_caixa_prestacao_mensal_v2_core($1,'2026-10-01',3) value",[polo]);
  assert.equal(core.compromissos.a_receber,405);
  const line=await scalar("select public.get_caixa_linha_corte_secure($1,'2026-10-01') value",[polo]);
  assert.equal(line.receitas.previstas,405);
  assert.equal(line.receitas.realizadas,100);
  const aging=await scalar("select public.get_relatorio_inadimplencia_secure($1,'2026-10-04',1,null) value",[polo]);
  assert.equal(aging.resumo.valor_em_atraso,405);
  assert.equal(aging.resumo.quantidade_titulos,3);

  // Payment evidence prevents expiration without turning the initial purchase
  // into debt or premature revenue. Identity/use guards still stay conservative.
  const guards=[
    ["update public.contas_receber set valor_pago=1 where id=$1",true],
    ["update public.contas_receber set data_pagamento='2026-10-04' where id=$1",true],
    ["update public.contas_receber set manual_settlement_id=id where id=$1",true],
    ["update public.inscricoes_online set status='PAGO' where id=$1",true],
    ["update public.inscricoes_online set pago_em=now() where id=$1",true],
    ["update public.inscricoes_online set confirmado_em=now() where id=$1",true],
    ["update public.inscricoes_online set aluno_id=null where id=$1",false],
    [`insert into public.payment_gateway_transactions(id,receivable_id,remote_status,
      inscricao_online_id,provider_code,environment,remote_payment_id)
      values($1,$1,'PAID',$1,'banese_card','production','000000001')`,true],
    ["insert into public.matricula_movimentacoes(id,matricula_id,status_anterior,status_novo) values($1,$1,'ATIVO','PENDENTE')",false],
    ["insert into public.matricula_movimentacoes(id,matricula_id,status_anterior,status_novo) values($1,$1,'PENDENTE','CONCLUIDO')",false],
    [`insert into public.ead_aluno_progresso values($1,$1,'${ead}',now(),'{}')`,false],
    [`insert into public.ead_aluno_progresso values($1,$1,'${ead}',null,'{"video":true}')`,false],
  ];
  for(const [sql,expectedOptional] of guards){
    await db.exec('begin');
    await db.query(sql,[id(1)]);
    assert.equal(await canExpire(1),false,sql);
    assert.equal(await optional(1),expectedOptional,sql);
    if(expectedOptional){
      assert.equal((await delinquency()).receber_vencido,405,sql);
      assert.equal((await delinquency()).inadimplencia_mensal.base_elegivel,505,sql);
      assert.equal((await summary()).received_value,100,'No receipt without canonical local settlement');
      assert.ok(!(await positioned()).some(row=>row.id===id(1)),sql);
    }
    await db.exec('rollback');
  }

  // Reconciliation may already have moved the enrollment or online inscription
  // before the receivable. Banese origin must retain the matching gateway IDs.
  for(const [sql] of guards.filter(([,expected])=>expected)){
    await db.exec('begin');
    await db.query("update public.matriculas set status='ATIVO' where id=$1",[id(1)]);
    await db.query("update public.contas_receber set origem_pagamento='BANESE' where id=$1",[id(1)]);
    await db.query(sql,[id(1)]);
    assert.equal(await optional(1),true,'Payment awaiting local settlement stays outside debt: '+sql);
    assert.equal(await canExpire(1),false,'Banese reconciliation must never authorize expiration');
    assert.equal((await delinquency()).receber_vencido,405);
    assert.equal((await delinquency()).inadimplencia_mensal.base_elegivel,505);
    assert.equal((await summary()).received_value,100,'Payment witness is not a receipt');
    for(const identityColumn of ['gateway_provider','gateway_environment','gateway_payment_id']){
      const previous=await scalar(`select ${identityColumn} value from public.inscricoes_online where id=$1`,[id(1)]);
      await db.query(`update public.inscricoes_online set ${identityColumn}='DIFFERENT' where id=$1`,[id(1)]);
      assert.equal(await optional(1),false,'Banese purchase provenance must match: '+identityColumn);
      await db.query(`update public.inscricoes_online set ${identityColumn}=$2 where id=$1`,[id(1),previous]);
    }
    await db.exec('rollback');
  }

  for(const remoteStatus of ['PAID','RECEIVED','CONFIRMED','RECEIVED_IN_CASH']){
    await db.exec('begin');
    await db.query("update public.matriculas set status='ATIVO' where id=$1",[id(1)]);
    await db.query(`insert into public.payment_gateway_transactions(id,receivable_id,remote_status,
      inscricao_online_id,provider_code,environment,remote_payment_id)
      values($1,$1,$2,$1,'banese_card','production','000000001')`,[id(1),remoteStatus]);
    assert.equal(await optional(1),true,'Matched remote '+remoteStatus+' is reconciliation, not debt');
    assert.equal(await canExpire(1),false);
    for(const [identityColumn,badValue] of [
      ['inscricao_online_id',id(999)],['provider_code','OTHER'],
      ['environment','OTHER'],['remote_payment_id','OTHER'],
    ]){
      const previous=await scalar(`select ${identityColumn} value from public.payment_gateway_transactions where id=$1`,[id(1)]);
      await db.query(`update public.payment_gateway_transactions set ${identityColumn}=$2 where id=$1`,[id(1),badValue]);
      assert.equal(await optional(1),false,'Remote payment witness must match: '+identityColumn);
      await db.query(`update public.payment_gateway_transactions set ${identityColumn}=$2 where id=$1`,[id(1),previous]);
    }
    await db.exec('rollback');
  }

  await db.exec('begin');
  await db.query("update public.matriculas set status='ATIVO' where id=$1",[id(1)]);
  await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where id=$1",[id(1)]);
  await db.query(`update public.contas_receber set origem_pagamento='BANESE',status='PAGO',
    data_pagamento='2026-10-04',valor_pago=valor where id=$1`,[id(1)]);
  assert.equal(await optional(1),false,'Canonical paid purchase must remain confirmed revenue');
  assert.equal(await canExpire(1),false);
  assert.equal((await summary()).received_value,199.9);
  assert.equal((await delinquency()).receber_vencido,405);
  assert.equal((await delinquency()).inadimplencia_mensal.base_elegivel,604.9);
  assert.equal((await positioned()).find(row=>row.id===id(1)).state,'SETTLED');
  await db.exec('rollback');

  await db.exec('begin');
  await db.query(`insert into public.contas_receber(id,matricula_id,status,valor_pago)
    values($1,$2,'PAGO',20)`,[id(800),id(1)]);
  assert.equal(await canExpire(1),false,'Prior payment on enrollment prevents cancellation');
  assert.equal(await optional(1),true,'A payment witness cannot create debt for an unused initial purchase');
  await db.exec('rollback');

  const historical=(cutoff='2026-11-02')=>scalar(
    "select internal_contas.caixa_monthly_delinquency($1,'2026-10-01',$2) value",[polo,cutoff]);
  const historicalRows=()=>scalar(`select jsonb_agg(jsonb_build_object('id',id,
    'monthly',monthly_position,'portfolio',portfolio_position) order by id) value
    from internal_contas.caixa_receivables_position_rows($1,'2026-10-01','2026-11-02')`,[polo]);
  const historicalAging=()=>scalar(
    "select public.get_relatorio_inadimplencia_secure($1,'2026-10-31',1,null) value",[polo]);
  const paidAfterCutoff=(n,cutoff='2026-11-01')=>scalar(
    'select internal_contas.ead_checkout_paid_after_cutoff($1,$2) value',[id(n),cutoff]);
  const audit=async(n,entity,action,at)=>db.query(`insert into public.sistema_eventos
    (id,entidade,entidade_id,acao,created_at,detalhes)
    values($1,$2,$3,$4,$5,$6)`,
    [id(n+(action==='Criou'?4000:entity==='matriculas'?2000:1000)),entity,id(n),action,at,
      JSON.stringify({operacao:action==='Criou'?'INSERT':'UPDATE',camposAlterados:['status']})]);
  const settleLate=async(n)=>{
    await db.query(`update public.contas_receber set status='PAGO',valor_pago=valor,
      data_pagamento='2026-11-01',origem_pagamento=case when origem_pagamento in
      ('GATEWAY_EAD','GATEWAY_ONLINE') then 'BANESE' else origem_pagamento end where id=$1`,[id(n)]);
    await db.query("update public.matriculas set status='ATIVO' where id=$1",[id(n)]);
    await db.query("update public.inscricoes_online set status='PAGO',pago_em='2026-11-01T10:00:00Z' where id=$1",[id(n)]);
    await audit(n,'matriculas','Criou','2026-10-01T09:00:00Z');
    await audit(n,'contas_receber','Recebeu pagamento','2026-11-01T10:00:00Z');
    await audit(n,'matriculas','Liberou matrícula','2026-11-01T10:01:00Z');
  };
  await db.exec('begin');
  await settleLate(1);
  assert.equal((await historical()).receber_vencido,504.9,
    'Regression: a paid November purchase used to become October debt');
  assert.equal((await historicalRows()).find(row=>row.id===id(1)).monthly,'OUTSTANDING');
  assert.equal((await historicalAging()).resumo.valor_em_atraso,504.9);
  await db.exec('rollback');

  const historicalMigration=source('20261004173625_preserve_optional_ead_historical_cutoff.sql');
  // Source drift rolls back the helper/index and all reader patches together.
  await db.exec('begin');
  await db.exec(`create or replace function internal_contas.caixa_receivables_position_rows(
    p_polo_id uuid,p_competencia date,p_today date) returns table(
    id uuid,polo_id uuid,due_date date,principal numeric,in_month boolean,
    monthly_position text,portfolio_position text,source_system text,source_key text,
    snapshot_id uuid,observed_at timestamptz,reason_code text)
    language sql stable security invoker set search_path='' as $$
    select null::uuid,null::uuid,null::date,null::numeric,false,null::text,null::text,
      null::text,null::text,null::uuid,null::timestamptz,null::text where false $$`);
  await assert.rejects(()=>db.exec(historicalMigration),/cutoff drifted/);
  await db.exec('rollback');
  const functionsBefore=await scalar(`select jsonb_object_agg(p.oid::regprocedure::text,to_jsonb(p)-'prosrc') value
    from pg_catalog.pg_proc p where p.oid in (
      'internal_contas.caixa_monthly_delinquency(uuid,date,date)'::regprocedure,
      'internal_contas.caixa_receivables_position_rows(uuid,date,date)'::regprocedure,
      'public.get_relatorio_inadimplencia_secure(uuid,date,integer,text)'::regprocedure)`);
  await db.exec(historicalMigration);
  assert.equal(await finances(),beforeFacts,'Historical correction never changes financial facts');
  assert.deepEqual(await scalar(`select jsonb_object_agg(p.oid::regprocedure::text,to_jsonb(p)-'prosrc') value
    from pg_catalog.pg_proc p where p.oid in (
      'internal_contas.caixa_monthly_delinquency(uuid,date,date)'::regprocedure,
      'internal_contas.caixa_receivables_position_rows(uuid,date,date)'::regprocedure,
      'public.get_relatorio_inadimplencia_secure(uuid,date,integer,text)'::regprocedure)`),functionsBefore);

  await db.exec('begin');
  await settleLate(1);
  assert.equal(await paidAfterCutoff(1),true);
  assert.equal(await paidAfterCutoff(1,'2026-10-31'),true);
  assert.equal(await paidAfterCutoff(1,'2026-11-02'),false,'Payment on the inclusive cutoff is settled');
  assert.equal((await historical()).receber_vencido,405);
  assert.equal((await historical()).inadimplencia_mensal.base_elegivel,505);
  assert.ok(!(await historicalRows()).some(row=>row.id===id(1)),
    'Neither monthly nor portfolio reconstruction invents pre-purchase debt');
  assert.equal((await historicalAging()).resumo.valor_em_atraso,405);
  assert.equal((await historicalAging()).resumo.quantidade_titulos,3);
  assert.equal((await historicalAging()).resumo.valor_faturado_vencido,505);
  const november=await scalar("select public.get_caixa_prestacao_mensal_v2_core($1,'2026-11-01',3) value",[polo]);
  assert.equal(november.resumo_competencia.entradas_recebidas_brutas,99.9,'Actual November revenue stays canonical');
  assert.equal((await scalar("select public.get_caixa_linha_corte_secure($1,'2026-11-01') value",[polo])).receitas.realizadas,99.9);
  assert.equal((await scalar("select public.get_receivables_modality_summary_v3_secure('EAD',$1,null,null,'2026-11-01','2026-11-30') value",[polo])).received_value,99.9);
  const paidNow=await scalar(`select jsonb_agg(jsonb_build_object('id',id,'state',portfolio_position)) value
    from internal_contas.caixa_receivables_position_rows($1,'2026-11-01','2026-11-02')`,[polo]);
  assert.equal(paidNow.find(row=>row.id===id(1)).state,'SETTLED');

  const historicalVetoes=[
    ["delete from public.sistema_eventos where entidade='contas_receber' and entidade_id=$1",[id(1)]],
    ["delete from public.sistema_eventos where entidade='matriculas' and entidade_id=$1",[id(1)]],
    ["delete from public.sistema_eventos where entidade='matriculas' and acao='Criou' and entidade_id=$1",[id(1)]],
    ["update public.sistema_eventos set acao='Liberou sem receber' where entidade='matriculas' and entidade_id=$1",[id(1)]],
    ["update public.sistema_eventos set created_at='2026-11-01T09:59:00Z' where entidade='matriculas' and entidade_id=$1",[id(1)]],
    ["update public.sistema_eventos set detalhes='{}' where entidade_id=$1",[id(1)]],
    ["update public.inscricoes_online set gateway_payment_id='DIFFERENT' where id=$1",[id(1)]],
    [`insert into public.sistema_eventos(id,entidade,entidade_id,acao,created_at,detalhes)
      values($1,'matriculas',$2,'Liberou sem receber','2026-10-01T10:00:00Z',
        '{"operacao":"UPDATE","camposAlterados":["status"]}')`,[id(3001),id(1)]],
    [`insert into public.matricula_movimentacoes(id,matricula_id,status_anterior,status_novo,created_at,data_movimentacao)
      values($1,$2,'PENDENTE','ATIVO','2026-10-01T10:00:00Z','2026-10-01')`,[id(3000),id(1)]],
    [`insert into public.matricula_movimentacoes(id,matricula_id,status_anterior,status_novo,created_at,data_movimentacao)
      values($1,$2,'PENDENTE','ATIVO','2026-11-02T10:00:00Z','2026-10-01')`,[id(3000),id(1)]],
    [`insert into public.matricula_movimentacoes(id,matricula_id,status_anterior,status_novo,created_at,data_movimentacao)
      values($1,$2,'TRANCADO','ATIVO','2026-11-01T10:01:00Z','2026-11-01')`,[id(3000),id(1)]],
    [`insert into public.matricula_movimentacoes(id,matricula_id,status_anterior,status_novo,created_at,data_movimentacao)
      values($1,$2,'CONCLUIDO','ATIVO','2026-11-01T10:01:00Z','2026-11-01')`,[id(3000),id(1)]],
    `insert into public.ead_aluno_progresso values('${id(1)}','${id(1)}','${ead}','2026-10-01T10:00:00Z','{}')`,
    `insert into public.ead_aluno_progresso values('${id(1)}','${id(1)}','${ead}',null,'{"video":true}')`,
    [`insert into public.contas_receber(id,matricula_id,status,valor_pago,data_pagamento)
      values($1,$2,'PAGO',20,'2026-10-01')`,[id(800),id(1)]],
    `insert into public.contas_receber(id,matricula_id,status) values('${id(800)}','${id(1)}','CANCELADO');
      insert into public.sistema_eventos(id,entidade,entidade_id,acao,created_at,detalhes)
      values('${id(1800)}','contas_receber','${id(800)}','Recebeu pagamento','2026-10-01T10:00:00Z',
        '{"operacao":"UPDATE","camposAlterados":["status"]}')`,
  ];
  for(const veto of historicalVetoes){
    await db.exec('savepoint historical_veto');
    if(typeof veto==='string') await db.exec(veto); else await db.query(...veto);
    assert.equal(await paidAfterCutoff(1),false,'Missing/conflicting proof preserves the historical criterion');
    assert.equal((await historical()).receber_vencido,504.9);
    await db.exec('rollback to savepoint historical_veto');
  }
  await db.exec('savepoint legitimate_learning');
  await db.query(`insert into public.ead_aluno_progresso values($1,$1,$2,'2026-11-01T10:02:00Z','{"video":true}')`,[id(1),ead]);
  assert.equal(await paidAfterCutoff(1),true,'Use after receipt does not create prior debt');
  await db.exec('rollback to savepoint legitimate_learning');
  await db.exec('rollback');

  // Full online identity and MATRICULA alone cannot erase real obligations.
  for(const n of [3,5,6]){
    await db.exec('begin');
    await settleLate(n);
    if(n===6) await db.query("update public.sistema_eventos set created_at='2026-10-01T10:00:00Z' where entidade='matriculas' and entidade_id=$1",[id(n)]);
    assert.equal(await paidAfterCutoff(n),false,'Technical/manual/already-active obligation remains real: '+n);
    assert.equal((await historical()).receber_vencido,405);
    assert.equal((await historicalRows()).find(row=>row.id===id(n)).monthly,'OUTSTANDING');
    await db.exec('rollback');
  }

  for(const role of ['anon','authenticated','service_role']){
    for(const helper of ['ead_checkout_is_optional','ead_checkout_can_expire']){
      assert.equal(await scalar(`select has_function_privilege($1,$2,'execute') value`,
        [role,`internal_contas.${helper}(uuid)`]),false);
    }
    assert.equal(await scalar("select has_function_privilege($1,'internal_contas.ead_checkout_paid_after_cutoff(uuid,date)','execute') value",[role]),false);
  }
  await db.exec('update test_caixa.access_state set global_allowed=false,scoped_allowed=false');
  await assert.rejects(()=>summary(),e=>e.code==='42501');
  await assert.rejects(()=>scalar("select public.get_caixa_linha_corte_secure($1,'2026-10-01') value",[polo]),e=>e.code==='42501');
  assert.equal(await finances(),beforeFacts);
  console.log('PASS optional EAD: screenshot, reconciliation, future-payment historical cutoff, own receipt/first paid activation proof, prior-active/manual/technical obligations, actual paid revenue, ACL, drift, immutable facts');
} finally { await db.close(); }
