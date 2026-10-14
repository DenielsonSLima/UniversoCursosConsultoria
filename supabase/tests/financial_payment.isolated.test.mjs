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
const input=(source,amount='100.00',patch={})=>({requestId:id(request++),sourceId:source,paymentDate:'2026-01-10',
 components:[{accountId:account,method:'DINHEIRO',amount}],interest:'0.00',penalty:'0.00',addition:'0.00',discount:'0.00',notes:'Teste sintético',...patch});
const preview=(source,payload,kind='EXPENSE')=>call('preview_financial_payment_secure',[kind,source,payload]);
const prepare=async(source,payload,kind='EXPENSE')=>({...payload,fingerprint:(await preview(source,payload,kind)).fingerprint});
const confirm=(source,payload,kind='EXPENSE')=>call('confirm_expense_payment_secure',[kind,source,payload]);
const history=(source,kind='EXPENSE')=>call('get_financial_payment_history_secure',[kind,source]);
const add=async(n,amount=200,kind='EXPENSE',patch={})=>{
 const table={EXPENSE:'despesas_lancamentos',PAYABLE:'contas_pagar',RECEIVABLE:'contas_receber'}[kind];
 const row={id:id(n),polo_id:polo,valor:amount,status:'PENDENTE',data_vencimento:'2026-02-10',
   ...(kind==='EXPENSE'?{valor_base:amount,tipo:'VARIAVEL'}:{}),
   ...(kind==='RECEIVABLE'?{categoria:'OUTROS_CREDITOS',tipo_lancamento:'OUTRO_CREDITO',origem_pagamento:'LOCAL'}:{}),...patch};
 const keys=Object.keys(row);
 await db.query(`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
 return id(n);
};
try {
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
 // Real legacy triggers remain installed, exercising their compatibility adaptations.
 await db.exec(`create trigger despesas_calcular_ajustes_trigger before insert or update of valor_base,juros_valor,multa_valor,desconto_valor,status
 on public.despesas_lancamentos for each row execute function public.calcular_ajustes_despesa();
 create trigger protect_paid_contas_pagar_trigger before update or delete on public.contas_pagar
 for each row execute function public.protect_paid_financial_history();
 create trigger protect_paid_contas_receber_trigger before update or delete on public.contas_receber
 for each row execute function public.protect_paid_financial_history();`);
 const source=await add(100),p1=await prepare(source,input(source));
 assert.deepEqual(Object.fromEntries(Object.entries(await preview(source,p1)).filter(([k])=>['originalAmount','paymentAmount','principalPaid','remainingAfter'].includes(k))),
 {originalAmount:'200.00',paymentAmount:'100.00',principalPaid:'100.00',remainingAfter:'100.00'});
 const first=await confirm(source,p1);
 assert.equal(first.preview.status,'PENDENTE');
 assert.equal((await history(source)).summary.remainingBefore,'100.00');
 assert.deepEqual(await scalar('select payment_summary value from public.despesas_lancamentos where id=$1',[source]),(await history(source)).summary);
 assert.equal((await confirm(source,p1)).replayed,true);
 assert.equal(await scalar('select count(*)::int value from public.financial_payment_events'),1);
 await fail(()=>confirm(source,{...p1,notes:'Outro texto'}),'PAYMENT_REQUEST_REUSED');
 await set('uid',otherActor); await fail(()=>confirm(source,p1),'PAYMENT_REQUEST_REUSED'); await set('uid',actor);
 await db.query("update public.usuarios_sistema set status='inativo' where auth_user_id=$1",[actor]);
 await fail(()=>confirm(source,p1),'PAYMENT_UNAUTHORIZED');
 await db.query("update public.usuarios_sistema set status='ativo' where auth_user_id=$1",[actor]);
 const stale=await prepare(source,input(source,'50.00'));
 const second=await confirm(source,await prepare(source,input(source,'25.00')));
 await fail(()=>confirm(source,stale),'PAYMENT_PREVIEW_STALE');
 assert.equal(second.preview.remainingAfter,'75.00');
 await fail(()=>preview(source,input(source,'75.01')),'PAYMENT_EXCEEDS_REMAINING');
 const finalPayload=await prepare(source,input(source,'75.00',{components:[
   {accountId:account,method:'DINHEIRO',amount:'25.00'},{accountId:account2,method:'PIX',amount:'50.00'}]}));
 const last=await confirm(source,finalPayload);
 assert.equal(last.preview.status,'PAGO');
 assert.equal((await history(source)).summary.remainingBefore,'0.00');
 assert.equal(Number(await scalar('select valor_pago value from public.despesas_lancamentos where id=$1',[source])),200);
 const reverse=id(9000);
 await call('reverse_expense_payment_secure',['EXPENSE',source,last.paymentId,reverse,'Pagamento informado incorretamente']);
 assert.equal((await history(source)).summary.remainingBefore,'75.00');
 assert.equal((await call('reverse_expense_payment_secure',['EXPENSE',source,last.paymentId,reverse,'Pagamento informado incorretamente'])).replayed,true);
 await fail(()=>call('reverse_expense_payment_secure',['EXPENSE',source,last.paymentId,id(9001),'Motivo diferente']),'ALREADY_REVERSED');
 await fail(()=>db.query('delete from public.despesas_lancamentos where id=$1',[source]),'HISTORY_IMMUTABLE');
 await fail(()=>db.query('update public.despesas_lancamentos set valor_base=300 where id=$1',[source]),'HISTORY_IMMUTABLE');
 await fail(()=>db.query("update public.despesas_lancamentos set status='CANCELADO' where id=$1",[source]),'PROJECTION_MISMATCH');
 await fail(()=>call('baixar_despesa_secure',[source,id(5000),account,'2026-01-10','PIX',0,0,0]),'USE_PARTIAL_PAYMENT_FLOW');
 await fail(()=>db.query('delete from public.financial_payment_components where event_id=$1',[first.paymentId]),'HISTORY_IMMUTABLE');
 const charges=await add(101);
 const charged=await prepare(charges,input(charges,'110.00',{interest:'5',penalty:'3',addition:'2',discount:'10'}));
 const chargeResult=await confirm(charges,charged);
 assert.equal(chargeResult.preview.principalPaid,'100.00'); assert.equal(chargeResult.preview.remainingAfter,'90.00');
 assert.equal(await scalar('select valor value from public.despesas_lancamentos where id=$1',[charges]),'200.00','Nominal not mutated by event charges');
 assert.equal((await confirm(charges,await prepare(charges,input(charges,'90.00')))).preview.remainingAfter,'0.00');
 assert.equal((await history(charges)).summary.previouslyPaid,'200.00');
 const awaitSource=await add(102);
 for(const amount of ['NaN','1e2','-1','0.001',100,null]) await fail(()=>preview(awaitSource,input(awaitSource,amount)),'PAYMENT_INVALID_AMOUNT');

 const split=await add(103);
 const splitResult=await confirm(split,await prepare(split,input(split,'200.00',{components:[
   {accountId:account,method:'DINHEIRO',amount:'100.00'},{accountId:account2,method:'PIX',amount:'100.00'}]})));
 assert.equal(splitResult.preview.remainingAfter,'0.00');
 assert.equal(await scalar('select count(*)::int value from public.financial_payment_components where event_id=$1',[splitResult.paymentId]),2);
 const authSource=await add(104),authInput=input(authSource);
 await db.query('update public.usuarios_sistema set polo_ids=ARRAY[$2::uuid] where auth_user_id=$1',[actor,otherPolo]);
 await fail(()=>preview(authSource,authInput),'PAYMENT_UNAUTHORIZED');
 await db.query('update public.usuarios_sistema set polo_ids=ARRAY[$2::uuid] where auth_user_id=$1',[actor,polo]);
 await db.query('update public.contas_bancarias set ativo=false where id=$1',[account]);
 await fail(()=>preview(authSource,authInput),'PAYMENT_ACCOUNT_UNAVAILABLE');
 await db.query('update public.contas_bancarias set ativo=true where id=$1',[account]);
 await db.query('delete from public.contas_bancarias_polos where conta_bancaria_id=$1',[account]);
 await fail(()=>preview(authSource,authInput),'PAYMENT_ACCOUNT_UNAVAILABLE');
 await db.query('insert into public.contas_bancarias_polos values($1,$2)',[account,polo]);
 for(const permissions of [{modules:'financeiro',financeiroTabs:['despesas']},{modules:['financeiro'],tabs:{financeiro:'despesas'}}]) {
   await db.query('update public.usuarios_sistema set permissoes=$2 where auth_user_id=$1',[actor,JSON.stringify(permissions)]);
   await fail(()=>preview(authSource,authInput),'PAYMENT_UNAUTHORIZED');
 }
 await db.query('update public.usuarios_sistema set permissoes=$2 where auth_user_id=$1',
 [actor,JSON.stringify({modules:['financeiro'],tabs:{financeiro:['despesas','outros-creditos','receber']}})]);
 const payable=await add(105,200,'PAYABLE');
 const payableResult=await confirm(payable,await prepare(payable,input(payable),'PAYABLE'),'PAYABLE');
 assert.equal(payableResult.preview.remainingAfter,'100.00');
 await fail(()=>call('baixar_conta_pagar_secure',[payable,id(5001),account,'2026-01-10','PIX']),'USE_PARTIAL_PAYMENT_FLOW');
 const loan=await add(106,200,'PAYABLE',{emprestimo_parcela_id:id(9001)});
 await fail(async()=>confirm(loan,await prepare(loan,input(loan),'PAYABLE'),'PAYABLE'),'SPECIALIZED_FLOW_REQUIRED');
 const receipt=await add(107,200,'RECEIVABLE');
 const receiptInput=await prepare(receipt,input(receipt),'RECEIVABLE');
 await fail(()=>confirm(receipt,receiptInput,'RECEIVABLE'),'INVALID_SOURCE');
 const r=await scalar("select internal_financial_payments.append_payment($1,'RECEIVABLE',$2,$3,false) value",[actor,receipt,JSON.stringify(receiptInput)]);
 assert.equal(r.preview.remainingAfter,'100.00');
 const remote=await add(108,200,'RECEIVABLE',{gateway_provider:'banese_card',gateway_status:'PENDING'});
 const remoteInput=await prepare(remote,input(remote),'RECEIVABLE');
 await fail(()=>scalar("select internal_financial_payments.append_payment($1,'RECEIVABLE',$2,$3,false) value",[actor,remote,JSON.stringify(remoteInput)]),'BANK_CONFIRMATION_REQUIRED');
 const concurrent=await add(109),ca=await prepare(concurrent,input(concurrent)),cb=await prepare(concurrent,input(concurrent));
 const concurrentResults=await Promise.allSettled([confirm(concurrent,ca),confirm(concurrent,cb)]);
 assert.equal(concurrentResults.filter(x=>x.status==='fulfilled').length,1,'Serialized requests reject the stale second preview');
 const rateioCore=read('../migrations/20260807035000_create_expense_rateio_core.sql');
 await db.exec(rateioCore.slice(rateioCore.indexOf('CREATE OR REPLACE FUNCTION public.sincronizar_despesa_lancamento_rateios()'),
   rateioCore.indexOf('ALTER TABLE public.despesas_lancamentos_rateios REPLICA IDENTITY')));
 const division=read('../migrations/20260806224000_create_patrimonio_and_financial_loans.sql');
 const divisionStart=division.indexOf('CREATE OR REPLACE FUNCTION public.financeiro_dividir_centavos(');
 await db.exec(division.slice(divisionStart,division.indexOf('$function$;',divisionStart)+11));
 const allocated=await add(110,200.01,'EXPENSE',{rateio_modo:'TODOS'});
 await db.query(`insert into public.despesas_lancamentos_rateios(id,despesa_lancamento_id,polo_id,valor_base,status)
   values($1,$3,$4,100.01,'PENDENTE'),($2,$3,$5,100.00,'PENDENTE')`,[id(9100),id(9101),allocated,polo,otherPolo]);
 await confirm(allocated,await prepare(allocated,input(allocated,'100.01',{discount:'0.01'})));
 const allocations=await db.query(`select r.polo_id,internal_financial_payments.expense_summary($1,r.polo_id) value
   from public.despesas_lancamentos_rateios r where despesa_lancamento_id=$1 order by polo_id`,[allocated]);
 // Matrix physical row owns full cash; child summary is economic only.
 const child=allocations.rows.find(x=>x.polo_id===otherPolo).value;
 assert.equal(child.originalAmount,'100.00'); assert.equal(child.previouslyPaid,'50.01'); assert.equal(child.remainingBefore,'50.00');
 const detail=(await db.query("select * from public.listar_despesas_economicas_detalhadas_secure('VARIAVEL',$1)",[otherPolo])).rows[0];
 assert.equal(detail.payment_summary.remainingBefore,'50.00');
 await fail(()=>db.query('update public.despesas_lancamentos_rateios set valor_base=120 where despesa_lancamento_id=$1',[allocated]),'ALLOCATION_HISTORY_IMMUTABLE');
 const childSummary=(await db.query("select * from public.get_despesas_economicas_summary_secure('VARIAVEL',$1)",[otherPolo])).rows[0];
 assert.equal(Number(childSummary.paid_value),50.01); assert.equal(Number(childSummary.pending_value),50);
 await db.exec(read('../migrations/20261014183529_financial_payment_cash_components.sql'));
 await db.exec(read('../migrations/20261014183535_financial_payment_cash_rateios.sql'));
 await confirm(allocated,await prepare(allocated,input(allocated,'0.02',{components:[
   {accountId:account,method:'DINHEIRO',amount:'0.01'},{accountId:account2,method:'PIX',amount:'0.01'}]})));
 const economic=await scalar('select internal_financial_payments.expense_summary($1,$2) value',[allocated,otherPolo]);
 const cashEconomic=(await db.query(`select sum(valor_total) filter(where status='PAGO') paid,
   sum(valor_total) filter(where status='PENDENTE') remaining
   from internal_financial_payments.cash_expense_allocations()
   where polo_id=$2 and internal_financial_payments.cash_source_id(despesa_lancamento_id)=$1`,[allocated,otherPolo])).rows[0];
 assert.equal(Number(economic.previouslyPaid),Number(cashEconomic.paid));
 assert.equal(Number(economic.remainingBefore),Number(cashEconomic.remaining));
 assert.equal(economic.previouslyPaid,'50.03','Economic cents follow each physical payment component, including tiny splits');
 assert.equal(await scalar("select has_function_privilege('authenticated','internal_financial_payments.append_payment(uuid,text,uuid,jsonb,boolean)','EXECUTE') value"),false);
 assert.equal(await scalar("select has_table_privilege('authenticated','public.financial_payment_events','INSERT') value"),false);
 assert.equal(await scalar("select has_table_privilege('service_role','public.financial_payment_components','UPDATE') value"),false);
 await db.exec(read('financial_payment_receivable_reads.fixture.sql'));
 await db.exec(read('financial_payment_receivable_reads.baseline.sql'));
 await db.exec(read('../migrations/20261014183517_financial_payment_receivable_reads.sql'));
 await db.query("insert into public.cursos(id,modalidade,nome) values($1,'TECNICO','Curso sintético')",[id(9200)]);
 await db.query("insert into public.turmas(id,curso_id,nome) values($1,$2,'Turma sintética')",[id(9201),id(9200)]);
 const academic=await add(111,200,'RECEIVABLE',{categoria:'MENSALIDADE',turma_id:id(9201),descricao:'Resumo acadêmico'});
 const academicInput=await prepare(academic,input(academic),'RECEIVABLE');
 await scalar("select internal_financial_payments.append_payment($1,'RECEIVABLE',$2,$3,false) value",[actor,academic,JSON.stringify(academicInput)]);
 const feb=await call('get_receivables_modality_summary_v3_secure',['TECNICO',polo,null,null,'2026-02-01','2026-02-28']);
 assert.equal(feb.pending_value,100); assert.equal(feb.received_value,0);
 const jan=await call('get_receivables_modality_summary_v3_secure',['TECNICO',polo,null,null,'2026-01-01','2026-01-31']);
 assert.equal(jan.pending_value,0); assert.equal(jan.received_value,100,'Actual partial cash follows its event date');
 const academicLast=await prepare(academic,input(academic,'100.00',{paymentDate:'2026-03-10'}),'RECEIVABLE');
 await scalar("select internal_financial_payments.append_payment($1,'RECEIVABLE',$2,$3,false) value",[actor,academic,JSON.stringify(academicLast)]);
 assert.equal((await call('get_receivables_modality_summary_v3_secure',['TECNICO',polo,null,null,'2026-01-01','2026-01-31'])).received_value,100,
   'A later installment does not move January receipts into March');
 assert.equal((await call('get_receivables_modality_summary_v3_secure',['TECNICO',polo,null,null,'2026-03-01','2026-03-31'])).received_value,100);
 const page=await call('get_receivables_modality_page_v4_secure',['TECNICO',polo,null,null,null,null,'all','none',null,1,25]);
 assert.equal(page.rows[0].payment_summary.remainingBefore,'0.00');
 await set('scope',false);
 await fail(()=>call('get_receivables_modality_summary_v3_secure',['TECNICO',polo,null,null,null,null]),'TEST_SCOPE_DENIED');
 await set('scope',true);
 const other=await add(112,200,'RECEIVABLE',{descricao:'Resumo avulso'});
 const otherInput=await prepare(other,input(other),'RECEIVABLE');
 await scalar("select internal_financial_payments.append_payment($1,'RECEIVABLE',$2,$3,false) value",[actor,other,JSON.stringify(otherInput)]);
 const otherSummary=(await db.query("select * from public.get_outros_creditos_summary($1,'Resumo avulso')",[polo])).rows[0];
 assert.equal(Number(otherSummary.pending_value),100); assert.equal(Number(otherSummary.received_value),100);
 assert.equal(Number(otherSummary.all_count),1); assert.equal(Number(otherSummary.all_value),200);
 const otherRows=await call('listar_outros_creditos_secure',[polo]);
 assert.equal(otherRows.find(r=>r.id===other).payment_summary.remainingBefore,'100.00');
 await db.exec(`create table public.matriculas(id uuid primary key,turma_id uuid);
 create table internal_academic.technical_manual_cycle_policies(turma_id uuid,active boolean,generation_mode text);
 create table public.test_cycle_generation(enrollment_id uuid,kind text);
 create function public.gerar_parcelas_matricula(uuid) returns void language sql as $$
   insert into public.test_cycle_generation values($1,'MATRICULA'); $$;
 create function public.gerar_rematricula_apos_parcelas(uuid) returns void language sql as $$
   insert into public.test_cycle_generation values($1,'PARCELA'); $$;`);
 await db.exec(read('financial_payment_lifecycle.baseline.sql'));
 await db.exec(read('../migrations/20261014183520_financial_payment_no_cycle_side_effect.sql'));
 await db.exec(`create trigger gerar_ciclo_financeiro_apos_pagamento_trigger after update of status on public.contas_receber
   for each row execute function public.gerar_ciclo_financeiro_apos_pagamento();`);
 await db.query('insert into public.matriculas values($1,$2)',[id(9300),id(9201)]);
 const ledgerCycle=await add(113,200,'RECEIVABLE',{categoria:'MENSALIDADE',turma_id:id(9201),matricula_id:id(9300),tipo_lancamento:'MATRICULA'});
 const cycleInput=await prepare(ledgerCycle,input(ledgerCycle,'200.00'),'RECEIVABLE');
 await scalar("select internal_financial_payments.append_payment($1,'RECEIVABLE',$2,$3,false) value",[actor,ledgerCycle,JSON.stringify(cycleInput)]);
 assert.equal(await scalar('select count(*)::int value from public.test_cycle_generation'),0,'Ledger full payment never generates a new cycle');
 const legacyCycle=await add(114,200,'RECEIVABLE',{categoria:'MENSALIDADE',turma_id:id(9201),matricula_id:id(9300),tipo_lancamento:'MATRICULA'});
 await db.query("update public.contas_receber set status='PAGO' where id=$1",[legacyCycle]);
 assert.equal(await scalar('select count(*)::int value from public.test_cycle_generation'),1,'Existing non-ledger automatic flow unchanged');
 console.log('PASS financial payment SQL: partial, split, charges, replay, authorization, stale preview, history, reversal, source fences, rateio, receipt period summaries, page projections, lifecycle fences and grants');
} catch(error) { console.error({message:error.message,detail:error.detail,where:error.where,position:error.position,stack:error instanceof assert.AssertionError?error.stack:undefined}); process.exitCode=1; } finally { await db.close(); }
