import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = name => readFileSync(new URL(name,import.meta.url),'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar = async (sql,args=[]) => (await db.query(sql,args)).rows[0].value;
const event = async (n,kind,sourceId,amounts,components,date='2026-10-14') => {
  const [principal,interest,penalty,addition,discount]=amounts;
  await db.query(`INSERT INTO public.financial_payment_events(id,request_id,actor_id,source_kind,source_id,
    polo_id,payment_date,original_cents,principal_cents,interest_cents,penalty_cents,addition_cents,
    discount_cents,payment_cents,input,payload_hash,preview)
    VALUES($1,$1,$2,$3,$4,$5,$6,20000,$7,$8,$9,$10,$11,$7::bigint+$8::bigint+$9::bigint+$10::bigint,'{}','fixture','{}')`,
  [id(n),id(3),kind,sourceId,id(1),date,principal,interest,penalty,addition,discount]);
  for(const [i,[amount,account]] of components.entries()) await db.query(`INSERT INTO public.financial_payment_components
    (id,event_id,sequence,account_id,method,amount_cents) VALUES($1,$2,$3,$4,$5,$6)`,
  [id(n*100+i),id(n),i+1,id(account),account===4?'DINHEIRO':'PIX',amount]);
};

try {
  await db.exec(source('other_credit_cancellation.fixture.sql'));
  await db.exec(source('financial_payment.fixture.sql'));
  await db.exec(source('financial_payment_cash.fixture.sql'));
  await db.exec(source('../migrations/20261014183502_financial_payment_ledger.sql'));
  for(const migration of ['20261014183529_financial_payment_cash_components.sql',
    '20261014183532_financial_payment_cash_sources.sql','20261014183535_financial_payment_cash_rateios.sql']) {
    await db.exec(source(`../migrations/${migration}`));
  }
  await db.exec(source('../migrations/20261014183541_financial_payment_cash_expense_detail.sql'));
  // Execute the actual bank balance reader, rewired by the same source rule.
  const old = source('../migrations/20260727215413_caixa_monthly_statement_and_banese_gross_receipts.sql');
  let reader=old.slice(old.indexOf('CREATE OR REPLACE FUNCTION public.get_contas_bancarias_saldos()'),
    old.indexOf('-- Posição gerencial:'));
  for(const [table,projection] of [['contas_receber','cash_receivables'],['contas_pagar','cash_payables'],
    ['despesas_lancamentos','cash_expenses']]) reader=reader.replaceAll(`public.${table} `,`internal_financial_payments.${projection}() `);
  await db.exec(reader);
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[id(3)]);
  await db.query("INSERT INTO public.polos(id,nome) VALUES($1,'Polo sintético'),($2,'Outro polo')",[id(1),id(2)]);
  await db.query(`INSERT INTO public.contas_bancarias(id,polo_id,nome,banco,data_saldo)
    VALUES($1,$3,'Caixa','Caixa',NULL),($2,$3,'Pix','Banco',NULL)`,[id(4),id(5),id(1)]);
  await db.query(`INSERT INTO public.contas_receber(id,polo_id,valor,status,valor_pago,data_pagamento,conta_bancaria_id)
    VALUES($1,$3,200,'PENDENTE',0,NULL,NULL),($2,$3,80,'PAGO',80,'2026-10-01',$4)`,[id(10),id(11),id(1),id(4)]);
  await event(20,'RECEIVABLE',id(10),[9194,503,201,102,806],[[1,4],[3333,4],[6666,5]]);
  const components=(await db.query('SELECT * FROM internal_financial_payments.cash_components() ORDER BY id')).rows;
  assert.equal(components.length,3);
  for(const c of components) {
    assert.equal(Number(c.amount_cents),Number(c.principal_cents)+Number(c.interest_cents)+Number(c.penalty_cents)+Number(c.addition_cents));
    for(const k of ['principal_cents','interest_cents','penalty_cents','addition_cents','discount_cents']) assert.ok(Number(c[k])>=0);
  }
  for(const [key,expected] of Object.entries({principal_cents:9194,interest_cents:503,penalty_cents:201,addition_cents:102,discount_cents:806})) {
    assert.equal(components.reduce((sum,c)=>sum+Number(c[key]),0),expected);
  }
  assert.equal(Number(await scalar("SELECT sum(valor) value FROM internal_financial_payments.cash_receivables() WHERE status='PENDENTE'")),100);
  let balances=(await db.query('SELECT id,recebido,pago FROM public.get_contas_bancarias_saldos() ORDER BY id')).rows;
  assert.equal(Number(balances[0].recebido),113.34);
  assert.equal(Number(balances[1].recebido),66.66);
  await event(21,'RECEIVABLE',id(10),[10000,0,0,0,0],[[10000,5]],'2026-11-02');
  // A legacy aggregate marker must not cause double counting after final payment.
  await db.query("UPDATE public.contas_receber SET status='PAGO',valor_pago=200,data_pagamento='2026-11-02',conta_bancaria_id=$2 WHERE id=$1",[id(10),id(5)]);
  assert.equal(Number(await scalar('SELECT sum(recebido) value FROM public.get_contas_bancarias_saldos()')),280);
  assert.equal(Number(await scalar("SELECT sum(valor_pago) value FROM internal_financial_payments.cash_receivables() WHERE data_pagamento<'2026-11-01'")),180);
  assert.equal(Number(await scalar("SELECT coalesce(sum(valor),0) value FROM internal_financial_payments.cash_receivables() WHERE status='PENDENTE'")),0);
  await db.query(`INSERT INTO public.despesas_lancamentos(id,polo_id,valor,valor_base,status,rateio_modo)
    VALUES($1,$2,200,200,'PENDENTE','TODOS')`,[id(30),id(1)]);
  await db.query(`INSERT INTO public.despesas_lancamentos_rateios(id,despesa_lancamento_id,polo_id,valor_base,status)
    VALUES($1,$3,$4,70,'PENDENTE'),($2,$3,$5,130,'PENDENTE')`,[id(31),id(32),id(30),id(1),id(2)]);
  await event(40,'EXPENSE',id(30),[9194,503,201,102,806],[[1,4],[3333,4],[6666,5]]);
  assert.equal(Number(await scalar('SELECT sum(pago) value FROM public.get_contas_bancarias_saldos()')),100);
  assert.equal(Number(await scalar("SELECT sum(valor_total) value FROM internal_financial_payments.cash_expense_allocations() WHERE status='PAGO'")),100);
  assert.equal(Number(await scalar("SELECT sum(valor_total) value FROM internal_financial_payments.cash_expense_allocations() WHERE status='PENDENTE'")),100);
  assert.equal(Number(await scalar(`SELECT sum(r.valor_total) value FROM internal_financial_payments.cash_expense_allocations() r
    JOIN internal_financial_payments.cash_expenses() d ON d.id=r.despesa_lancamento_id WHERE r.status='PAGO'`)),100);
  const detail=(await db.query("SELECT * FROM public.get_caixa_relatorio_despesas_core(NULL,'2026-10-01','2026-11-01')")).rows;
  assert.equal(detail.length,3);
  for(const line of detail) assert.equal(Math.round(100*Number(line.valor_pago)),Math.round(100*(Number(line.valor_base)+Number(line.juros)+Number(line.multa)+Number(line.acrescimo)-Number(line.desconto))));
  assert.equal(Math.round(detail.reduce((sum,row)=>sum+Number(row.acrescimo),0)*100),102);
  await db.query(`UPDATE public.financial_payment_events SET reversed_at=now(),reversed_by=$2,reversal_request_id=$3,
    reversal_reason='Correção sintética' WHERE id=$1`,[id(20),id(3),id(50)]);
  assert.equal(Number(await scalar('SELECT sum(recebido) value FROM public.get_contas_bancarias_saldos()')),180);
  assert.equal(Number(await scalar("SELECT sum(valor) value FROM internal_financial_payments.cash_receivables() WHERE status='PENDENTE'")),100);
  await db.query("UPDATE public.contas_bancarias SET data_saldo='2026-11-01' WHERE id=$1",[id(5)]);
  assert.equal(Number(await scalar('SELECT recebido value FROM public.get_contas_bancarias_saldos() WHERE id=$1',[id(5)])),100);
  assert.equal(await scalar("SELECT has_function_privilege('authenticated','internal_financial_payments.cash_receivables()','execute') value"),false);
  // Regression: nested rounding formerly yielded a negative one-cent penalty.
  await db.query(`INSERT INTO public.despesas_lancamentos(id,polo_id,valor,valor_base,status,rateio_modo)
    VALUES($1,$2,200,200,'PENDENTE','TODOS')`,[id(60),id(1)]);
  await db.query(`INSERT INTO public.despesas_lancamentos_rateios(id,despesa_lancamento_id,polo_id,valor_base,status)
    VALUES($1,$4,$5,80,'PENDENTE'),($2,$4,$6,40,'PENDENTE'),($3,$4,$7,80,'PENDENTE')`,
    [id(61),id(62),id(63),id(60),id(1),id(2),id(6)]);
  await event(70,'EXPENSE',id(60),[5,2,1,2,0],[[4,4],[2,5],[4,5]]);
  const tiny=(await db.query('SELECT * FROM internal_financial_payments.cash_components() WHERE source_id=$1',[id(60)])).rows;
  for(const c of tiny) for(const key of ['principal_cents','interest_cents','penalty_cents','addition_cents']) assert.ok(Number(c[key])>=0, key);
  assert.equal(tiny.reduce((sum,c)=>sum+Number(c.penalty_cents),0),1);
  assert.equal(Number(await scalar("SELECT count(*) value FROM internal_financial_payments.cash_expense_allocations() WHERE juros_valor<0 OR multa_valor<0 OR valor_base<0")),0);
  // Property test the exact-cent allocator over tiny and uneven components.
  assert.equal(Number(await scalar(`SELECT count(*) value FROM generate_series(1,41) total
    CROSS JOIN generate_series(0,41) before_weight CROSS JOIN generate_series(1,41) weight
    WHERE internal_financial_payments.cash_part(total,before_weight,weight,82)<0`)),0);
  console.log('Cash SQL: split/partial, cent conservation, two payment dates, reversal, account cutoff, rateio and ACL passed.');
} catch (error) { console.error(error.message,error.code,error.where || ''); process.exitCode=1; } finally { await db.close(); }
