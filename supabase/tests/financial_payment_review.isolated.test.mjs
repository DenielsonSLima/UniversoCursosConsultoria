import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),otherActor=id(2),polo=id(10),otherPolo=id(11),account=id(20),account2=id(21);
const scalar = async (sql,params=[]) => (await db.query(sql,params)).rows[0].value;
const set = (key,value) => db.query('select set_config($1,$2,false)',[`test.${key}`,String(value)]);
const fail=(fn,text)=>assert.rejects(fn,new RegExp(text));
const call=(name,args)=>scalar(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,
  args.map(a=>a&&typeof a==='object'?JSON.stringify(a):a));
let request=1000;
const input=(source,amount='100.00',patch={})=>({requestId:id(request++),sourceId:source,paymentDate:today,
 components:[{accountId:account,method:'DINHEIRO',amount}],interest:'0.00',penalty:'0.00',addition:'0.00',discount:'0.00',notes:'Teste sintético',...patch});
const preview=(source,payload,kind='EXPENSE')=>call('preview_financial_payment_secure',[kind,source,payload]);
const prepare=async(source,payload,kind='EXPENSE')=>({...payload,fingerprint:(await preview(source,payload,kind)).fingerprint});
const confirm=(source,payload,kind='EXPENSE')=>call('confirm_expense_payment_secure',[kind,source,payload]);
const history=(source,kind='EXPENSE')=>call('get_financial_payment_history_secure',[kind,source]);
let today,future,past;
const add=async(n,amount=200,kind='EXPENSE',patch={})=>{
 const table={EXPENSE:'despesas_lancamentos',PAYABLE:'contas_pagar',RECEIVABLE:'contas_receber'}[kind];
 const row={id:id(n),polo_id:polo,valor:amount,status:'PENDENTE',data_vencimento:future,
   ...(kind==='EXPENSE'?{valor_base:amount,tipo:'VARIAVEL'}:{}),
   ...(kind==='RECEIVABLE'?{categoria:'OUTROS_CREDITOS',tipo_lancamento:'OUTRO_CREDITO',origem_pagamento:'LOCAL'}:{}),...patch};
 const keys=Object.keys(row);
 await db.query(`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
 return id(n);
};
try {
 ({today,future,past}=(await db.query("select current_date::text today,(current_date+10)::text future,(current_date-10)::text past")).rows[0]);
 await db.exec(read('other_credit_cancellation.fixture.sql'));
 await db.exec(read('financial_payment.fixture.sql'));
 await db.exec(read('financial_payment_reads.fixture.sql'));
 await db.query('insert into auth.users values($1),($2)',[actor,otherActor]);
 await db.query('insert into public.polos(id) values($1),($2)',[polo,otherPolo]);
 await db.query(`insert into public.usuarios_sistema(auth_user_id,perfil,status,permissoes,polo_ids)
 values($1,'financeiro','ativo',$3,ARRAY[$4::uuid]),($2,'financeiro','ativo',$3,ARRAY[$4::uuid])`,
 [actor,otherActor,JSON.stringify({modules:['financeiro'],tabs:{financeiro:['despesas','outros-debitos','receber','outros-creditos']}}),polo]);
 await db.query('insert into public.contas_bancarias(id,nome) values($1,\'Caixa\'),($2,\'Banco\')',[account,account2]);
 await db.query('insert into public.contas_bancarias_polos values($1,$3),($2,$3)',[account,account2,polo]);
 for(const [k,v] of Object.entries({uid:actor,role:'authenticated',identity:true,polo,tab:true})) await set(k,v);
 const files=["20261014183502_financial_payment_ledger.sql", "20261014183505_financial_payment_preview.sql", "20261014183509_financial_payment_append.sql", "20261014183512_financial_payment_source_guards.sql", "20261014183515_financial_payment_expense_reads.sql"];
 assert.equal(files.length,5);
 for(const f of files) await db.exec(read(`../migrations/${f}`));
 await db.exec(read('financial_payment_receivable_reads.fixture.sql'));
 await db.exec(read('financial_payment_receivable_reads.baseline.sql'));
 await db.exec(read('../migrations/20261014183517_financial_payment_receivable_reads.sql'));
 for(const name of ['20261014183529_financial_payment_cash_components.sql','20261014183532_financial_payment_cash_sources.sql',
   '20261014183535_financial_payment_cash_rateios.sql']) await db.exec(read(`../migrations/${name}`));
 await db.exec(`create table public.categorias_financeiras(id uuid primary key,nome text);
 alter table public.despesas_lancamentos add column fornecedor_id uuid,add column turma_id uuid,add column emprestimo_parcela_id uuid;
 create function public.gestor_has_financeiro_tab(text) returns boolean language sql stable as $$
   select coalesce(current_setting('test.tab',true),'true')::boolean; $$;`);
 await db.exec(read('financial_payment_unscoped_reads.baseline.sql'));
 const expenseSummary=async(type='DESPESA_VARIAVEL',scope=null)=>
  (await db.query("select * from public.get_despesas_summary($1::text,$2::uuid,NULL::uuid,NULL::text,NULL::date,NULL::date,'todos'::text,NULL::uuid)",[type,scope])).rows[0];
 const groupSummary=async(scope=polo)=>(await db.query("select * from public.get_despesas_group_summary_secure('DESPESA_VARIAVEL',$1::uuid,NULL::uuid,NULL::text,NULL::date,NULL::date,'todos',NULL::uuid)",[scope])).rows;
 const partial=await add(200,200,'EXPENSE',{tipo:'DESPESA_VARIAVEL',data_vencimento:past});
 const first=await confirm(partial,await prepare(partial,input(partial)));
 let totals=await expenseSummary();
 assert.equal(Number(totals.paid_value),0,'Reproduces pre-patch omission of partial cash');
 assert.equal(Number(totals.pending_value),200,'Reproduces pre-patch nominal open value');
 assert.equal(Number((await groupSummary())[0].paid_value),0);
 await db.exec(read('../migrations/20261014191337_financial_payment_overdue_and_identity.sql'));
 await db.exec(read('../migrations/20261014191340_financial_payment_unscoped_expense_reads.sql'));
 totals=await expenseSummary();
 assert.equal(Number(totals.total_value),200); assert.equal(Number(totals.paid_value),100); assert.equal(Number(totals.pending_value),100);
 assert.equal(Number((await groupSummary())[0].paid_value),100);
 assert.equal((await history(partial)).summary.status,'VENCIDO','Read classifies existing overdue ledger balance');
 // The same statement used by an overdue scheduler must pass the real ledger trigger.
 await db.exec("update public.despesas_lancamentos set status='VENCIDO' where status='PENDENTE' and data_vencimento<current_date");
 assert.equal(await scalar('select status value from public.despesas_lancamentos where id=$1',[partial]),'VENCIDO');
 assert.equal((await preview(partial,input(partial,'50.00'))).status,'VENCIDO');
 assert.equal((await preview(partial,input(partial,'100.00'))).status,'PAGO');
 await fail(()=>db.query('update public.despesas_lancamentos set id=$2 where id=$1',[partial,id(201)]),'HISTORY_IMMUTABLE');
 assert.equal((await history(partial)).summary.remainingBefore,'100.00');
 assert.equal((await history(partial)).events.length,1);
 assert.equal(await scalar('select count(*)::int value from public.despesas_lancamentos where id=$1',[id(201)]),0);
 await db.query("update public.despesas_lancamentos set status='PENDENTE' where id=$1",[partial]);
 assert.equal(await scalar('select status value from public.despesas_lancamentos where id=$1',[partial]),'VENCIDO',
   'An open-status update cannot hide an overdue balance');
 const final=await confirm(partial,await prepare(partial,input(partial)));
 assert.equal(final.preview.status,'PAGO');
 await call('reverse_expense_payment_secure',['EXPENSE',partial,final.paymentId,id(8000),'Parcela informada incorretamente']);
 assert.equal((await history(partial)).summary.status,'VENCIDO');
 await call('reverse_expense_payment_secure',['EXPENSE',partial,first.paymentId,id(8001),'Pagamento informado incorretamente']);
 assert.equal((await history(partial)).summary.remainingBefore,'200.00');
 await fail(()=>db.query('update public.despesas_lancamentos set id=$2 where id=$1',[partial,id(201)]),'HISTORY_IMMUTABLE');
 // Source identity protection applies to all three source kinds, including closed events.
 for(const [n,kind,table] of [[210,'PAYABLE','contas_pagar'],[220,'RECEIVABLE','contas_receber']]) {
   const source=await add(n,200,kind,{data_vencimento:past});
   const payload=await prepare(source,input(source),kind);
   const result=kind==='RECEIVABLE'
    ? await scalar("select internal_financial_payments.append_payment($1,'RECEIVABLE',$2,$3,false) value",[actor,source,JSON.stringify(payload)])
    : await confirm(source,payload,kind);
   assert.equal(result.preview.status,'VENCIDO');
   assert.equal((await history(source,kind)).summary.remainingBefore,'100.00');
   await fail(()=>db.query(`update public.${table} set id=$2 where id=$1`,[source,id(n+1)]),'HISTORY_IMMUTABLE');
   assert.equal((await history(source,kind)).events.length,1);
 }
 const futureSource=await add(230);
 assert.equal((await confirm(futureSource,await prepare(futureSource,input(futureSource)))).preview.status,'PENDENTE');
 await db.query('update public.despesas_lancamentos set data_vencimento=$2 where id=$1',[futureSource,past]);
 assert.equal((await history(futureSource)).summary.status,'VENCIDO','Open metadata update is classified without a cron dependency');
 // Real receipt summary preserves the overdue count and uses only the open balance.
 await db.query("insert into public.cursos(id,modalidade) values($1,'TECNICO')",[id(9200)]);
 await db.query('insert into public.turmas(id,curso_id) values($1,$2)',[id(9201),id(9200)]);
 const late=await add(240,200,'RECEIVABLE',{categoria:'MENSALIDADE',turma_id:id(9201),data_vencimento:past,status:'VENCIDO'});
 const latePayload=await prepare(late,input(late),'RECEIVABLE');
 await scalar("select internal_financial_payments.append_payment($1,'RECEIVABLE',$2,$3,false) value",[actor,late,JSON.stringify(latePayload)]);
 const academic=await call('get_receivables_modality_summary_v3_secure',['TECNICO',polo,null,null,null,null]);
 assert.equal(academic.overdue_count,1); assert.equal(academic.overdue_value,100);
 assert.equal(academic.pending_value,100); assert.equal(academic.received_value,100);
 assert.equal(await scalar('select status value from internal_financial_payments.cash_receivables() where id=$1',[late]),'VENCIDO');
 // Split/allocated amounts stay conserved when only the overdue label changes.
 const allocated=await add(250,200.01,'EXPENSE',{data_vencimento:past,rateio_modo:'TODOS'});
 await db.query(`insert into public.despesas_lancamentos_rateios(id,despesa_lancamento_id,polo_id,valor_base,status)
  values($1,$3,$4,100.01,'PENDENTE'),($2,$3,$5,100.00,'PENDENTE')`,[id(9100),id(9101),allocated,polo,otherPolo]);
 await confirm(allocated,await prepare(allocated,input(allocated,'100.01',{discount:'0.01',components:[
  {accountId:account,method:'DINHEIRO',amount:'100.00'},{accountId:account2,method:'PIX',amount:'0.01'}]})));
 const allocatedCash=(await db.query(`select sum(valor_total) filter(where status='PAGO') paid,
  sum(valor_total) filter(where status='VENCIDO') remaining from internal_financial_payments.cash_expense_allocations()
  where internal_financial_payments.cash_source_id(despesa_lancamento_id)=$1`,[allocated])).rows[0];
 assert.equal(Number(allocatedCash.paid),100.01); assert.equal(Number(allocatedCash.remaining),99.99);
 assert.equal(await scalar('select status value from internal_financial_payments.cash_expenses() where id=$1',[allocated]),'VENCIDO');
 // Unsupported specialized sources fail in preview, before any durable attempt is created.
 const special=await add(260);
 await db.query("insert into public.convenios_financeiros_despesas values($1,'ATIVO')",[special]);
 await fail(()=>preview(special,input(special)),'SPECIALIZED_FLOW_REQUIRED');
 const loan=await add(261,200,'EXPENSE',{emprestimo_parcela_id:id(9991)});
 await fail(()=>preview(loan,input(loan)),'SPECIALIZED_FLOW_REQUIRED');
 const payableLoan=await add(262,200,'PAYABLE',{emprestimo_id:id(9992)});
 await fail(()=>preview(payableLoan,input(payableLoan),'PAYABLE'),'SPECIALIZED_FLOW_REQUIRED');
 assert.equal(await scalar('select count(*)::int value from public.financial_payment_events where source_id=ANY($1::uuid[])',[[special,loan,payableLoan]]),0);
 await db.exec(`alter table public.convenios_financeiros_despesas add column competencia_id uuid,add column convenio_id uuid;`);
 await db.query('update public.convenios_financeiros_despesas set competencia_id=$2,convenio_id=$3 where despesa_lancamento_id=$1',
  [special,id(9800),id(9801)]);
 const foreign=await add(270,200,'EXPENSE',{polo_id:otherPolo});
 await db.query("insert into public.convenios_financeiros_despesas values($1,'ATIVO',$2,$3)",[foreign,id(9802),id(9803)]);
 await db.exec(read('../migrations/20261014191343_financial_payment_expense_settlement_links.sql'));
 const links=ids=>db.query('select * from public.get_expense_settlement_links_secure($1::uuid[])',[ids]);
 assert.deepEqual((await links([special,foreign,futureSource])).rows,[
  {despesa_lancamento_id:special,convenio_mes_id:id(9800),convenio_id:id(9801)}],
  'Expense-only actor sees the active route, without a convenios tab or foreign-pole data');
 await fail(()=>links(Array(501).fill(special)),'INVALID_SOURCE_BATCH');
 assert.equal((await links([])).rows.length,0);
 await db.query("update public.convenios_financeiros_despesas set status='ESTORNADO' where despesa_lancamento_id=$1",[special]);
 assert.equal((await links([special])).rows.length,0,'Reversed link cannot select the specialized payment route');
 await set('uid',''); await fail(()=>links([special]),'PAYMENT_UNAUTHORIZED'); await set('uid',actor);
 assert.equal(await scalar("select has_function_privilege('anon','public.get_expense_settlement_links_secure(uuid[])','EXECUTE') value"),false);
 // Existing group authorization is unchanged; nullable scope does not expose all poles.
 await fail(()=>groupSummary(null),'fora do escopo autorizado');
 await set('tab',false); await fail(()=>groupSummary(),'fora do escopo autorizado'); await set('tab',true);
 assert.equal(await scalar("select has_function_privilege('authenticated','internal_financial_payments.balance_status(bigint,date)','EXECUTE') value"),false);
 console.log('PASS payment review SQL: overdue preview/source/receipt summary, scheduler update, reversals, immutable IDs, exact cash/rateio cents, unscoped summary, specialized preview and scoped settlement links');
} catch(error) { console.error({message:error.message,detail:error.detail,where:error.where,position:error.position,stack:error instanceof assert.AssertionError?error.stack:undefined}); process.exitCode=1; } finally { await db.close(); }
