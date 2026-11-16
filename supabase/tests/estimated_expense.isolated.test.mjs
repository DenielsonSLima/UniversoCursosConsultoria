import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),other=id(2),polo=id(10),child=id(11),account=id(20),category=id(30);
const scalar = async (sql,params=[]) => (await db.query(sql,params)).rows[0].value;
const call = (name,args) => scalar(`select to_jsonb(public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')})) value`,
  args.map(x=>x&&typeof x==='object'?JSON.stringify(x):x));
const row = source => scalar('select to_jsonb(d) value from public.despesas_lancamentos d where id=$1',[source]);
const fail = (fn,message) => assert.rejects(fn,new RegExp(message));
let sequence=100;
const input=(source,amount,patch={})=>({requestId:id(sequence++),sourceId:source,paymentDate:'2026-01-10',
  components:[{accountId:account,method:'DINHEIRO',amount}],interest:'0.00',penalty:'0.00',
  addition:'0.00',discount:'0.00',notes:'Synthetic estimate',...patch});
const createArgs=(patch={})=>({p_request_id:id(sequence++),p_polo_id:polo,p_tipo:'DESPESA_FIXA',
  p_descricao:'CONTA SINTÉTICA',p_valor_base:100,p_data_lancamento:'2026-01-01',
  p_data_vencimento:'2026-01-10',p_categoria_financeira_id:category,p_total_parcelas:1,...patch});
const create=async(args=createArgs(),rateada=false)=>(await db.query(
  'select * from public.criar_despesa_estimada_secure($1::jsonb,$2)',[JSON.stringify(args),rateada])).rows;
const prepare=async(source,real,payload)=>({...payload,fingerprint:(await call(
  'preview_estimated_expense_payment_secure',[source,real,(await row(source)).valor_estimado_versao,payload])).fingerprint});
const confirm=(source,real,version,payload)=>call('confirm_estimated_expense_payment_secure',[source,real,version,payload]);
try {
  for(const file of ['other_credit_cancellation.fixture.sql','financial_payment.fixture.sql',
    'financial_payment_reads.fixture.sql','estimated_expense.fixture.sql']) await db.exec(read(file));
  await db.query('insert into auth.users values($1),($2)',[actor,other]);
  await db.query(`insert into public.polos(id,nome,company_id,is_matriz) values
    ($1,'Matriz sintética',$3,true),($2,'Polo sintético',$3,false)`,[polo,child,id(40)]);
  await db.query(`insert into public.usuarios_sistema(auth_user_id,perfil,status,permissoes,polo_ids)
    values($1,'financeiro','ativo',$3,ARRAY[$4::uuid,$5::uuid]),
      ($2,'financeiro','ativo',$3,ARRAY[$5::uuid])`,[actor,other,
    JSON.stringify({modules:['financeiro'],tabs:{financeiro:['despesas','outros-debitos']}}),polo,child]);
  await db.query("insert into public.categorias_financeiras values($1,'ÁGUA','DESPESA_FIXA','ativo')",[category]);
  await db.query("insert into public.contas_bancarias(id,nome) values($1,'Caixa sintético')",[account]);
  await db.query('insert into public.contas_bancarias_polos values($1,$2)',[account,polo]);
  for(const [key,value] of Object.entries({uid:actor,role:'authenticated',identity:true,polo,tab:true}))
    await db.query('select set_config($1,$2,false)',[`test.${key}`,String(value)]);
  for(const file of ['20261014183502_financial_payment_ledger.sql','20261014183505_financial_payment_preview.sql',
    '20261014183509_financial_payment_append.sql','20261014183512_financial_payment_source_guards.sql',
    '20261014183515_financial_payment_expense_reads.sql','20261014194245_financial_payment_automatic_single_amount.sql',
    '20261109021100_expense_explicit_payment_date.sql','20261109021200_expense_rateio_explicit_payment_date.sql',
    '20261109021300_expense_rateio_replay_payment_date.sql']) await db.exec(read(`../migrations/${file}`));
  const divide=read('../migrations/20260806224000_create_patrimonio_and_financial_loans.sql');
  const start=divide.indexOf('CREATE OR REPLACE FUNCTION public.financeiro_dividir_centavos(');
  await db.exec(divide.slice(start,divide.indexOf('$function$;',start)+11));
  const rateio=read('../migrations/20260807035000_create_expense_rateio_core.sql');
  await db.exec(rateio.slice(rateio.indexOf('CREATE OR REPLACE FUNCTION public.sincronizar_despesa_lancamento_rateios()'),
    rateio.indexOf('ALTER TABLE public.despesas_lancamentos_rateios REPLICA IDENTITY')));
  await db.exec(`create trigger despesas_calcular_ajustes_trigger before insert or update of
    valor_base,juros_valor,multa_valor,desconto_valor,status on public.despesas_lancamentos
    for each row execute function public.calcular_ajustes_despesa();`);
  const correction=read('../migrations/20260811123901_harden_expense_corrections_and_detail_reads.sql');
  const cancelStart=correction.indexOf('CREATE OR REPLACE FUNCTION public.cancelar_ou_estornar_despesa_secure(');
  await db.exec(correction.slice(cancelStart,correction.indexOf('$function$;',cancelStart)+11));
  for(const file of ['20261116031717_expense_estimate_metadata_and_guards.sql',
    '20261116031731_create_estimated_expenses.sql','20261116031733_confirm_estimated_expense_payment.sql',
    '20261116031736_read_estimated_expenses.sql','20261116031738_resolve_estimated_expense_without_charge.sql',
    '20261116031740_overdue_expenses_workspace.sql'])
    await db.exec(read(`../migrations/${file}`));

  const monthlyArgs=createArgs({p_total_parcelas:12});
  const monthly=await create(monthlyArgs);
  assert.equal(monthly.length,12);
  assert(monthly.every(x=>x.valor_estimado&&Number(x.valor_estimado_original)===100&&x.valor_estimado_versao===1));
  assert.equal(monthly.at(-1).data_vencimento.toISOString().slice(0,10),'2026-12-10');
  assert.deepEqual((await create(monthlyArgs)).map(x=>x.id),monthly.map(x=>x.id));
  await fail(()=>create({...monthlyArgs,p_valor_base:101}),'PAYMENT_REQUEST_REUSED');
  for(const patch of [{p_baixa_imediata:true},{p_split_total:true},{p_tipo:'OUTRO_DEBITO'},
    {p_juros_valor:1},{p_convenio_mes_id:id(55)}]) await fail(()=>create(createArgs(patch)),'ESTIMATE_INVALID_INPUT');

  const source=monthly[0].id;
  const before=await row(source);
  await fail(()=>call('preview_financial_payment_secure',['EXPENSE',source,input(source,'100.00')]),'ESTIMATE_CONFIRMATION_REQUIRED');
  await fail(()=>db.query('update public.despesas_lancamentos set valor_estimado=false,valor_estimado_original=null where id=$1',[source]),'ESTIMATE_ORIGINAL_IMMUTABLE');
  await fail(()=>db.query('update public.despesas_lancamentos set valor_confirmado_em=now(),valor_confirmado_por=$2 where id=$1',[source,actor]),'ESTIMATE_DEDICATED_FLOW_REQUIRED');
  await fail(()=>db.query("update public.despesas_lancamentos set status='PAGO' where id=$1",[source]),'ESTIMATE_CONFIRMATION_REQUIRED');
  const lowInput=input(source,'85.00');
  const preview=await call('preview_estimated_expense_payment_secure',[source,85,1,lowInput]);
  assert.equal(preview.originalAmount,'85.00');assert.equal(preview.remainingAfter,'0.00');
  assert.equal(preview.estimatedExpense.originalEstimate,'100.00');
  assert.deepEqual(await row(source),before,'Preview never persists the real value');
  const prepared={...lowInput,fingerprint:preview.fingerprint};
  const paid=await confirm(source,85,1,prepared);
  assert.equal(paid.preview.principalPaid,'85.00');assert.equal(paid.preview.status,'PAGO');
  assert.equal((await row(source)).valor_estimado_original,100);
  assert.equal((await row(source)).valor_base,85);
  assert.equal((await confirm(source,85,1,prepared)).replayed,true);
  await fail(()=>confirm(source,86,1,prepared),'PAYMENT_REQUEST_REUSED');
  assert.equal(await scalar('select count(*)::integer value from public.financial_payment_events where source_id=$1',[source]),1);
  await fail(()=>db.query('update public.despesas_lancamentos set valor_base=90 where id=$1',[source]),'ESTIMATE_HISTORY_LOCKED');

  const high=monthly[1].id,partial=await prepare(high,120,input(high,'50.00'));
  const partialResult=await confirm(high,120,1,partial);
  assert.equal(partialResult.preview.remainingAfter,'70.00');assert.equal((await row(high)).valor_base,120);
  await fail(()=>db.query('update public.despesas_lancamentos set valor_base=125 where id=$1',[high]),'ESTIMATE_HISTORY_LOCKED');
  const balanceInput=input(high,'70.00');
  const balancePreview=await call('preview_financial_payment_secure',['EXPENSE',high,balanceInput]);
  await call('confirm_expense_payment_secure',['EXPENSE',high,{...balanceInput,fingerprint:balancePreview.fingerprint}]);
  assert.equal((await row(high)).valor_pago,120);

  const stale=monthly[2].id,stalePayload=await prepare(stale,95,input(stale,'95.00'));
  await db.query('update public.despesas_lancamentos set descricao=descricao||\' alterada\' where id=$1',[stale]);
  await fail(()=>confirm(stale,95,1,stalePayload),'ESTIMATE_VERSION_CHANGED');
  const fresh=await prepare(stale,95,input(stale,'95.00'));
  await db.query('update public.contas_bancarias set ativo=false where id=$1',[account]);
  await fail(()=>confirm(stale,95,2,fresh),'PAYMENT_ACCOUNT_UNAVAILABLE');
  assert.equal((await row(stale)).valor_base,100);assert.equal((await row(stale)).valor_confirmado_em,null);
  await db.query('update public.contas_bancarias set ativo=true where id=$1',[account]);
  await db.exec(`create function public.fail_synthetic_component() returns trigger language plpgsql as $$
    begin if current_setting('test.fail_component',true)='true' then
      raise exception 'TEST_COMPONENT_WRITE_FAILURE'; end if; return new; end $$;
    create trigger fail_synthetic_component before insert on public.financial_payment_components
      for each row execute function public.fail_synthetic_component();`);
  await db.query("select set_config('test.fail_component','true',false)");
  await fail(()=>confirm(stale,95,2,fresh),'TEST_COMPONENT_WRITE_FAILURE');
  assert.equal((await row(stale)).valor_base,100);assert.equal((await row(stale)).valor_confirmado_em,null);
  assert.equal(await scalar('select count(*)::integer value from public.financial_payment_events where source_id=$1',[stale]),0,
    'Failure after confirmation and ledger insertion rolls the entire operation back');
  await db.query("select set_config('test.fail_component','false',false)");

  const isolated=monthly[3].id,confirmId=id(sequence++);
  await call('confirm_estimated_expense_value_secure',[isolated,90,1,confirmId]);
  assert.equal((await row(isolated)).status,'PENDENTE');
  assert.equal(await scalar('select count(*)::integer value from public.financial_payment_events where source_id=$1',[isolated]),0);
  await call('confirm_estimated_expense_value_secure',[isolated,90,1,confirmId]);
  await fail(()=>call('confirm_estimated_expense_value_secure',[isolated,91,1,confirmId]),'PAYMENT_REQUEST_REUSED');
  await fail(()=>confirm(isolated,90,1,awaitableInput(isolated)),'ESTIMATE_NOT_PENDING');

  const allocated=(await create(createArgs({p_valor_base:100.01,p_rateio_modo:'TODOS',p_rateio_polo_ids:null}),true))[0];
  assert.equal(Number(await scalar('select sum(valor_base) value from public.despesas_lancamentos_rateios where despesa_lancamento_id=$1',[allocated.id])),100.01);
  await confirm(allocated.id,87.03,1,await prepare(allocated.id,87.03,input(allocated.id,'87.03')));
  assert.equal(Number(await scalar('select sum(valor_base) value from public.despesas_lancamentos_rateios where despesa_lancamento_id=$1',[allocated.id])),87.03);
  assert.equal(await scalar('select count(*)::integer value from public.financial_payment_events where source_id=$1',[allocated.id]),1);
  const derived=await scalar('select id value from public.despesas_lancamentos_rateios where despesa_lancamento_id=$1 and polo_id=$2',[allocated.id,child]);
  const metadata=(await db.query('select * from public.get_despesas_estimativas_secure($1::uuid[])',[[derived,source]])).rows;
  assert.equal(metadata.length,2);assert.equal(metadata.find(x=>x.id===derived).despesa_lancamento_id,allocated.id);
  assert.equal(metadata.find(x=>x.id===derived).pagamento_unico,false);
  assert.equal(metadata.find(x=>x.id===source).pagamento_unico,true);
  assert.equal((await db.query('select * from public.get_despesas_estimativas_secure($1::uuid[])',[[high]])).rows[0].pagamento_unico,false,
    'Two payment events never collapse into a single payment presentation');
  const summary=await call('get_despesas_estimativas_resumo_secure',['DESPESA_FIXA',null,null,null,null,null,'todos',null,'mes']);
  assert.equal(summary.estimated_count,9);assert.equal(summary.estimated_value,900);
  assert.equal(summary.confirmed_pending_value,90);
  assert.equal(summary.vencidos_count,1,'Estimated overdue amounts are not confirmed debts');
  const noCharge=(await create())[0],noChargeRequest=id(sequence++);
  const closed=await call('resolve_estimated_expense_without_charge_secure',[noCharge.id,1,noChargeRequest,'Sem consumo']);
  assert.equal(closed.status,'CANCELADO');assert.equal(closed.valor_base,100);
  assert.equal(closed.valor_estimado_original,100);assert.equal(closed.valor_confirmado_em,null);
  assert(closed.valor_sem_cobranca_em);assert.equal(closed.valor_sem_cobranca_por,actor);
  assert.equal(closed.data_pagamento,null);assert.equal(closed.valor_pago,null);
  assert.equal(await scalar('select count(*)::integer value from public.financial_payment_events where source_id=$1',[noCharge.id]),0);
  await call('resolve_estimated_expense_without_charge_secure',[noCharge.id,1,noChargeRequest,'Sem consumo']);
  await fail(()=>call('resolve_estimated_expense_without_charge_secure',[noCharge.id,1,noChargeRequest,'Outro motivo']),'PAYMENT_REQUEST_REUSED');
  await fail(()=>call('confirm_estimated_expense_value_secure',[noCharge.id,80,1,id(sequence++)]),'ESTIMATE_NOT_PENDING');
  await fail(()=>call('resolve_estimated_expense_without_charge_secure',[high,1,id(sequence++),null]),'ESTIMATE_NOT_PENDING');
  await fail(()=>call('resolve_estimated_expense_without_charge_secure',[stale,1,id(sequence++),null]),'ESTIMATE_VERSION_CHANGED');
  await fail(()=>db.query("update public.despesas_lancamentos set status='PENDENTE' where id=$1",[noCharge.id]),'ESTIMATE_HISTORY_LOCKED');
  const noChargeMetadata=(await db.query('select * from public.get_despesas_estimativas_secure($1::uuid[])',[[noCharge.id]])).rows[0];
  assert.equal(noChargeMetadata.is_estimativa_pendente,false);assert(noChargeMetadata.valor_sem_cobranca_em);
  const afterClosure=await call('get_despesas_estimativas_resumo_secure',['DESPESA_FIXA',null,null,null,null,null,'todos',null,'categoria']);
  assert.equal(afterClosure.estimated_value,900);assert.equal(afterClosure.confirmed_pending_value,90);
  const concurrent=(await create())[0];
  const concurrentPayload=await prepare(concurrent.id,75,input(concurrent.id,'75.00'));
  const race=await Promise.allSettled([
    call('resolve_estimated_expense_without_charge_secure',[concurrent.id,1,id(sequence++),null]),
    confirm(concurrent.id,75,1,concurrentPayload)
  ]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1,'No-charge and payment serialize on one source');
  assert.equal((await row(concurrent.id)).status,'CANCELADO');
  const overdue=await call('get_despesas_vencidas_secure',['DESPESA_FIXA',polo,null,null,null,null,null,'categoria']);
  assert.equal(overdue.items.length,1);assert.equal(overdue.items[0].id,isolated);
  assert.equal(overdue.summary.pending_value,90);assert.equal(overdue.summary.vencidos_count,1);
  assert.equal(overdue.groups.reduce((sum,g)=>sum+g.item_count,0),1);
  const today=await scalar("select ((now() at time zone 'America/Maceio')::date)::text value");
  const dueToday=(await create(createArgs({p_data_vencimento:today})))[0];
  await call('confirm_estimated_expense_value_secure',[dueToday.id,75,1,id(sequence++)]);
  assert.equal((await call('get_despesas_vencidas_secure',['DESPESA_FIXA',polo,null,null,null,null,null,'mes'])).items.length,1,
    'Today in Maceio is excluded even when UTC is already tomorrow');
  assert.equal((await call('get_despesas_estimativas_resumo_secure',
    ['DESPESA_FIXA',null,null,null,null,null,'todos',null,'mes'])).vencidos_count,1,
  'The overdue count follows the same Maceio date fence as the overdue tab');
  const plain=(await db.query(`select * from public.criar_despesa_secure(p_request_id=>$1,p_polo_id=>$2,
    p_tipo=>'DESPESA_FIXA',p_descricao=>'PLAIN SYNTHETIC',p_valor_base=>10,
    p_data_lancamento=>CURRENT_DATE,p_data_vencimento=>CURRENT_DATE,p_data_pagamento=>NULL::date)`,[id(sequence++),polo])).rows[0];
  const plainMetadata=(await db.query('select * from public.get_despesas_estimativas_secure($1::uuid[])',[[plain.id]])).rows[0];
  assert.equal(plainMetadata.valor_estimado,false);assert.equal(plainMetadata.valor_estimado_original,null);
  assert.equal(plainMetadata.pagamento_unico,false);
  await db.query("select set_config('test.uid',$1,false)",[other]);
  assert.equal((await db.query('select * from public.get_despesas_estimativas_secure($1::uuid[])',[[source]])).rows.length,0);
  assert.equal((await db.query('select * from public.get_despesas_estimativas_secure($1::uuid[])',[[allocated.id]])).rows.length,0,
    'A child viewer cannot request physical Matrix metadata');
  assert.equal((await db.query('select * from public.get_despesas_estimativas_secure($1::uuid[])',[[derived]])).rows.length,1);
  await fail(()=>confirm(source,85,1,prepared),'PAYMENT_UNAUTHORIZED');
  const otherSummary=await call('get_despesas_estimativas_resumo_secure',['DESPESA_FIXA',null,null,null,null,null,'todos',null,'categoria']);
  assert.equal(otherSummary.estimated_count,0);assert.equal(otherSummary.confirmed_pending_value,0);
  await fail(()=>call('get_despesas_vencidas_secure',['DESPESA_FIXA',polo,null,null,null,null,null,'categoria']),'PAYMENT_UNAUTHORIZED');
  assert.equal(await scalar("select has_function_privilege('anon','public.confirm_estimated_expense_payment_secure(uuid,numeric,integer,jsonb)','EXECUTE') value"),false);
  assert.equal(await scalar("select has_table_privilege('authenticated','private.despesas_estimativas_operacoes','INSERT') value"),false);
  console.log('PASS estimated expense SQL: monthly creation/replay, source guards, real lower/higher, atomic partial/full payment, rollback, version, isolated confirmation, no-charge/race/replay, rateio, metadata, summaries and scope');
} catch(error) {
  console.error({message:error.message,detail:error.detail,where:error.where,position:error.position,stack:error.stack});
  process.exitCode=1;
} finally { await db.close(); }
function awaitableInput(source) { return {...input(source,'90.00'),fingerprint:'obsolete'}; }
