import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExpenseWorkspaceTestDatabase, fixture as f, id } from './expense_workspace.setup.mjs';

const db=await createExpenseWorkspaceTestDatabase();
const scalar=async(sql,params=[])=>(await db.query(sql,params)).rows[0].value;
const call=(name,args)=>scalar(`select to_jsonb(public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')})) value`,
  args.map(x=>x&&typeof x==='object'?JSON.stringify(x):x));
const fail=(fn,message)=>assert.rejects(fn,new RegExp(message));
const ids=workspace=>workspace.items.map(x=>x.id);
let sequence=100;
const request=()=>id(sequence++);
const row=source=>scalar('select to_jsonb(d) value from public.despesas_lancamentos d where id=$1',[source]);
const bundle=(patch={})=>call('get_despesas_workspace_secure',[
  patch.tipo||'DESPESA_FIXA',patch.polo||f.polo,patch.category??null,patch.search??null,
  patch.start??null,patch.end??null,patch.turma??null,patch.scope??'mes_atual',patch.situation??'todas',
  patch.order??'vencimento_asc',patch.group??'nenhum']);
const snapshot=()=>scalar(`select jsonb_build_object(
  'sources',(select jsonb_agg(to_jsonb(d) order by d.id) from public.despesas_lancamentos d),
  'events',(select jsonb_agg(to_jsonb(e) order by e.id) from public.financial_payment_events e),
  'components',(select jsonb_agg(to_jsonb(c) order by c.id) from public.financial_payment_components c),
  'rateios',(select jsonb_agg(to_jsonb(r) order by r.id) from public.despesas_lancamentos_rateios r)) value`);

try {
  const dates=(await db.query(`select ((now() at time zone 'America/Maceio')::date)::text today,
    date_trunc('month',now() at time zone 'America/Maceio')::date::text first,
    (date_trunc('month',now() at time zone 'America/Maceio')+interval '1 month - 1 day')::date::text last,
    (date_trunc('month',now() at time zone 'America/Maceio')-interval '1 day')::date::text previous,
    (date_trunc('month',now() at time zone 'America/Maceio')+interval '1 month')::date::text next`)).rows[0];
  const create=async(description,due,amount=100,patch={})=>{
    const input={p_request_id:request(),p_polo_id:f.polo,p_tipo:'DESPESA_FIXA',p_descricao:description,
      p_valor_base:amount,p_data_lancamento:dates.previous,p_data_vencimento:due,
      p_categoria_financeira_id:f.category,p_fornecedor_id:f.supplier,...patch};
    if(patch.estimated) {
      const {estimated,...args}=input;
      return (await db.query('select * from public.criar_despesa_estimada_secure($1::jsonb,$2)',
        [JSON.stringify(args),Boolean(args.p_rateio_modo)])).rows[0];
    }
    return (await db.query(`select * from public.criar_despesa_secure(
      p_request_id=>$1,p_polo_id=>$2,p_tipo=>$3,p_descricao=>$4,p_valor_base=>$5,
      p_data_lancamento=>$6::date,p_data_vencimento=>$7::date,p_data_pagamento=>NULL::date,
      p_categoria_financeira_id=>$8,p_fornecedor_id=>$9,p_turma_id=>$10)`,
    [input.p_request_id,input.p_polo_id,input.p_tipo,input.p_descricao,input.p_valor_base,
      input.p_data_lancamento,input.p_data_vencimento,input.p_categoria_financeira_id,input.p_fornecedor_id,
      input.p_turma_id??null])).rows[0];
  };
  const pay=async(source,amount,date=dates.today,interest='0.00')=>{
    const input={requestId:request(),sourceId:source,paymentDate:date,
      components:[{accountId:f.account,method:'DINHEIRO',amount}],interest,
      penalty:'0.00',addition:'0.00',discount:'0.00',notes:'Synthetic workspace fixture'};
    const preview=await call('preview_financial_payment_secure',['EXPENSE',source,input]);
    return call('confirm_expense_payment_secure',['EXPENSE',source,{...input,fingerprint:preview.fingerprint}]);
  };

  const early=await create('ABERTA INÍCIO',dates.first,100,{p_turma_id:f.turma});
  const late=await create('ABERTA FIM',dates.last,110);
  const partial=await create('PARCIAL INÍCIO',dates.first,100);
  await pay(partial.id,'35.00',dates.today,'5.00');
  const paid=await create('PAGA VENCIMENTO MÊS',dates.last,50);
  await pay(paid.id,'50.00',dates.previous);
  const paidPrevious=await create('PAGA VENCIMENTO ANTERIOR',dates.previous,40,{p_data_lancamento:dates.today});
  await pay(paidPrevious.id,'40.00');
  const future=await create('LANÇADA HOJE VENCIMENTO FUTURO',dates.next,120,{p_data_lancamento:dates.today});
  const old=await create('LANÇADA HOJE VENCIMENTO PASSADO',dates.previous,25,{p_data_lancamento:dates.today});
  const estimate=await create('FATURA A CONFIRMAR',dates.first,70,{estimated:true});
  const noCharge=await create('MÊS SEM COBRANÇA',dates.first,80,{estimated:true});
  await call('resolve_estimated_expense_without_charge_secure',[noCharge.id,1,request(),null]);
  const canceled=await create('CANCELADA GENÉRICA',dates.first,30);
  await call('cancelar_ou_estornar_despesa_secure',[canceled.id,request(),'Cancelamento sintético',false]);
  const legacy=await create('PAGA LEGADA SEM EVENTO',dates.last,45);
  await db.query(`update public.despesas_lancamentos set status='PAGO',valor_pago=45,
    data_pagamento=$2::date,conta_bancaria_id=$3,forma_pagamento='DINHEIRO' where id=$1`,
  [legacy.id,dates.previous,f.account]);
  const variable=await create('DESPESA VARIÁVEL',dates.first,55,
    {p_tipo:'DESPESA_VARIAVEL',p_categoria_financeira_id:f.variableCategory});
  const allocated=await create('RATEADA PARCIAL',dates.first,100.01,
    {estimated:true,p_rateio_modo:'TODOS',p_rateio_polo_ids:null});
  await call('confirm_estimated_expense_value_secure',[allocated.id,120.03,1,request()]);
  await pay(allocated.id,'30.01');
  const allocatedNoCharge=await create('RATEADA SEM COBRANÇA',dates.first,90.01,
    {estimated:true,p_rateio_modo:'TODOS',p_rateio_polo_ids:null});
  await call('resolve_estimated_expense_without_charge_secure',[allocatedNoCharge.id,1,request(),'Sem fatura']);
  const before=await snapshot();

  const current=await bundle();
  assert.deepEqual(new Set(ids(current)),new Set([
    early.id,late.id,partial.id,paid.id,estimate.id,noCharge.id,canceled.id,legacy.id,allocated.id,allocatedNoCharge.id]));
  assert(!ids(current).includes(paidPrevious.id));assert(!ids(current).includes(future.id));assert(!ids(current).includes(old.id));
  assert.deepEqual(current.groups,[]);
  assert.equal(current.summary.total_value,595.03);assert.equal(current.summary.paid_value,160.01);
  assert.equal(current.summary.pending_value,440.02);assert.equal(current.summary.confirmed_pending_value,370.02);
  assert.equal(current.summary.estimated_value,70);assert.equal(current.summary.estimated_count,1);
  assert.equal(current.items.find(x=>x.id===noCharge.id).valor,0);
  assert.equal(current.items.find(x=>x.id===noCharge.id).valor_estimado_original,80);
  assert.equal(current.items.find(x=>x.id===early.id).fornecedor_nome_fantasia,'Fantasia sintética');
  const legacyItem=current.items.find(x=>x.id===legacy.id);
  assert.equal(legacyItem.payment_summary.hasEvents,false);assert.equal(legacyItem.payment_summary.remainingBefore,'0.00');
  assert.equal((await row(legacy.id)).payment_summary,null,'Legacy stored summary remains null; reader computes the proof');
  const onlyPaid=await bundle({situation:'pagas'});
  assert.deepEqual(new Set(ids(onlyPaid)),new Set([paid.id,legacy.id]));
  assert.equal(onlyPaid.summary.total_value,95);assert.equal(onlyPaid.summary.paid_value,95);
  assert.equal(onlyPaid.summary.pending_value,0);assert.equal(onlyPaid.summary.estimated_count,0);
  const onlyOpen=await bundle({situation:'em_aberto'});
  assert.deepEqual(new Set(ids(onlyOpen)),new Set([early.id,late.id,partial.id,estimate.id,allocated.id]));
  const overdueMonth=await bundle({situation:'vencidas'});
  const expectedOverdue=dates.first<dates.today?[early.id,partial.id,allocated.id]:[];
  assert.deepEqual(new Set(ids(overdueMonth)),new Set(expectedOverdue));
  assert.equal(overdueMonth.summary.estimated_count,0);
  assert.equal(overdueMonth.summary.pending_value,expectedOverdue.length?260.02:0,
    'Partial remaining balance comes from principal, not valor minus cash paid');
  const overdueShortcut=await bundle({scope:'vencidos',situation:'pagas'});
  assert(ids(overdueShortcut).includes(old.id),'The historical shortcut fixes situation without imposing current month');
  const openShortcut=await bundle({scope:'em_aberto',situation:'pagas'});
  assert(ids(openShortcut).includes(future.id));assert(ids(openShortcut).includes(estimate.id));
  assert(!ids(openShortcut).includes(paid.id));assert(!ids(openShortcut).includes(noCharge.id));
  const bounded=await bundle({start:dates.last,end:dates.next});
  assert.deepEqual(new Set(ids(bounded)),new Set([late.id,paid.id,legacy.id]),'Manual dates intersect current month');
  assert.equal((await bundle({start:dates.next})).items.length,0);
  assert.deepEqual(ids(await bundle({turma:f.turma})),[early.id]);
  assert.deepEqual(ids(await bundle({search:'ABERTA FIM'})),[late.id]);
  assert.equal((await bundle({category:f.variableCategory})).items.length,0);
  assert.deepEqual(ids(await bundle({tipo:'DESPESA_VARIAVEL',category:f.variableCategory})),[variable.id]);

  const desc=await bundle({order:'vencimento_desc'});
  assert.equal(desc.items[0].data_vencimento,dates.last);assert.equal(desc.items.at(-1).data_vencimento,dates.first);
  assert.deepEqual(desc.items.filter(x=>x.data_vencimento===dates.first).map(x=>x.id),
    current.items.filter(x=>x.data_vencimento===dates.first).map(x=>x.id),'Ties keep the same stable order in both directions');
  const grouped=await bundle({group:'categoria'});
  assert.equal(grouped.groups.reduce((sum,g)=>sum+g.item_count,0),current.items.length);
  assert.equal(grouped.groups.reduce((sum,g)=>sum+g.total_value,0),current.summary.total_value);
  assert.equal(grouped.groups[0].estimated_value,70);assert.equal(grouped.groups[0].estimated_count,1);
  const months=await bundle({scope:'todos',group:'mes',order:'vencimento_desc'});
  assert.equal(months.groups[0].grupo_chave,dates.next.slice(0,7));
  assert.equal(months.groups.at(-1).grupo_chave,dates.previous.slice(0,7));

  const bounds=async(scope,start,end,at)=>(await db.query(
    'select today_local::text,due_start::text,due_end::text from private.expense_workspace_bounds($1,$2,$3,$4)',
    [scope,start,end,at])).rows[0];
  assert.deepEqual(await bounds('mes_atual',null,null,'2026-12-01T01:30:00Z'),
    {today_local:'2026-11-30',due_start:'2026-11-01',due_end:'2026-11-30'});
  assert.deepEqual(await bounds('mes_atual',null,null,'2027-01-01T03:00:00Z'),
    {today_local:'2027-01-01',due_start:'2027-01-01',due_end:'2027-01-31'});
  assert.equal((await bounds('mes_atual',null,null,'2028-02-20T12:00:00Z')).due_end,'2028-02-29');
  assert.equal((await bounds('vencidos',null,'2027-03-10','2027-03-01T02:00:00Z')).due_end,'2027-02-27');

  await db.query("select set_config('test.uid',$1,false),set_config('test.polo',$2,false)",[f.otherActor,f.child]);
  const child=await bundle({polo:f.child});
  assert.equal(child.items.length,2);
  const childPaid=child.items.find(x=>x.descricao==='RATEADA PARCIAL');
  assert.equal(childPaid.is_rateio_derivado,true);assert.equal(Number(childPaid.valor_estimado_original),50);
  assert.equal(childPaid.conta_bancaria_id,null);assert.equal(childPaid.conta_bancaria_nome,null);
  assert.equal(childPaid.forma_pagamento,null);assert.equal(childPaid.pagamento_unico,false);
  assert.deepEqual(childPaid.payment_summary,await scalar('select internal_financial_payments.expense_summary($1,$2) value',[allocated.id,f.child]));
  const childClosed=child.items.find(x=>x.descricao==='RATEADA SEM COBRANÇA');
  assert.equal(childClosed.status,'CANCELADO');assert.equal(childClosed.valor,0);
  assert.equal(Number(childClosed.valor_estimado_original),45);assert(childClosed.valor_sem_cobranca_em);
  assert.deepEqual(ids(await bundle({polo:f.child,situation:'em_aberto'})),[childPaid.id]);
  await fail(()=>bundle({polo:f.polo}),'PAYMENT_UNAUTHORIZED');
  await db.query("select set_config('test.uid',$1,false),set_config('test.polo',$2,false)",[f.actor,f.polo]);
  for(const patch of [{scope:'other'},{situation:'other'},{order:'other'},{group:'other'},
    {tipo:'OUTRO_DEBITO'}]) await fail(()=>bundle(patch),'PAYMENT_WORKSPACE_INVALID_FILTER');
  await db.query("select set_config('test.uid','',false)");
  await fail(()=>bundle(),'PAYMENT_UNAUTHORIZED');
  await db.query("select set_config('test.uid',$1,false)",[f.actor]);
  assert.deepEqual(await snapshot(),before,'All workspaces and projections are read only');
  assert.equal(await scalar("select has_function_privilege('anon','public.get_despesas_workspace_secure(text,uuid,uuid,text,date,date,uuid,text,text,text,text)','EXECUTE') value"),false);
  assert.equal(await scalar("select has_function_privilege('authenticated','private.expense_workspace_bounds(text,date,date,timestamp with time zone)','EXECUTE') value"),false);

  await db.exec(`insert into public.despesas_lancamentos(polo_id,tipo,descricao,valor_base,valor,status,data_vencimento,data_lancamento)
    select '${f.polo}','DESPESA_FIXA','BATCH TEST',1,1,'PENDENTE',current_date,current_date from generate_series(1,5001)`);
  const large=await bundle({scope:'todos',search:'BATCH TEST'});
  assert.equal(large.items.length,5001);assert.equal(large.summary.total_value,5001,'Metadata batches preserve the complete set above the getter limit');
  await db.exec(readFileSync(new URL('./expense_workspace.rollback.sql',import.meta.url),'utf8'));
  console.log('PASS expense workspace SQL: due month, independent situation, legacy/canonical paid, partial principal, estimates/no-charge, filters, stable sort/groups, Maceio clock, authorized rateio, complete metadata batches and no mutations');
} catch(error) {
  console.error({message:error.message,detail:error.detail,where:error.where,position:error.position,stack:error.stack});
  process.exitCode=1;
} finally { await db.close(); }
