import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const db=new PGlite();
const source = name => readFileSync(new URL(name,import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
try {
 await db.exec(source('other_credit_cancellation.fixture.sql'));
 await db.exec(source('financial_payment.fixture.sql'));
 await db.exec(source('financial_payment_cash.fixture.sql'));
 await db.exec(`CREATE SCHEMA internal_contas;
 CREATE TABLE public.matriculas(id uuid,aluno_id uuid,turma_id uuid);
 ALTER TABLE public.cursos ADD COLUMN modalidade text;
 ALTER TABLE internal_proesc.obligation_links ADD COLUMN id uuid,ADD COLUMN source_key text;
 CREATE TABLE public.payment_gateway_cnab_records(receivable_id uuid,provider_code text,status text);
 CREATE TYPE public.test_snapshot AS(id uuid,observed_at timestamptz,verification text,source_status text,
 evidence_kind text,collector_review_reasons jsonb,principal_cents bigint,received_cents bigint,payment_date date);
 CREATE FUNCTION internal_contas.caixa_proesc_effective_snapshot(public.contas_receber,uuid) RETURNS public.test_snapshot
 LANGUAGE sql AS $$SELECT NULL::public.test_snapshot$$;
 CREATE FUNCTION internal_contas.caixa_proesc_open_receivable_verified(public.contas_receber,public.test_snapshot)
 RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION internal_proesc.reconciliation_source_system(public.contas_receber) RETURNS text LANGUAGE sql AS $$SELECT 'BANESE'$$;
 CREATE FUNCTION internal_contas.ead_checkout_is_optional(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION internal_contas.ead_checkout_paid_after_cutoff(uuid,date) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION internal_contas.caixa_assert_receivables_scope(uuid) RETURNS void LANGUAGE sql AS $$SELECT$$;
 CREATE FUNCTION internal_contas.caixa_monthly_receivable_state(text,date,date,boolean,numeric) RETURNS text LANGUAGE sql
 AS $$SELECT CASE WHEN $4 THEN 'REVIEW' WHEN $1='PAGO' AND $2<$3 THEN 'SETTLED' ELSE 'OUTSTANDING' END$$;
 CREATE FUNCTION public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)
 RETURNS TABLE(valor_recebido numeric,valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,diferenca_nao_discriminada numeric)
 LANGUAGE sql AS $$SELECT coalesce($14::numeric/100,$3,0),coalesce($9::numeric/100,$2,0),coalesce($10::numeric/100,0),
 coalesce($11::numeric/100,0),coalesce($12::numeric/100,0),coalesce($13::numeric/100,0),0::numeric$$;`);
 await db.exec(source('../migrations/20261014183502_financial_payment_ledger.sql'));
 for(const file of ['20261014183529_financial_payment_cash_components.sql','20261014183532_financial_payment_cash_sources.sql']) await db.exec(source(`../migrations/${file}`));
 for(const file of ['financial_payment_title_readers.fixture.sql','financial_payment_position_readers.fixture.sql']) {
 // Same exact source rewrite as201300, confined to the five readers under test.
 await db.exec(source(file).replace(/\b(FROM|JOIN)\s+public\.contas_receber\b/gi,(_,verb)=>`${verb} internal_financial_payments.cash_receivables()`));
 }
 await db.exec(source('../migrations/20261014183544_financial_payment_cash_title_counts.sql'));
 await db.exec(source('../migrations/20261014183547_financial_payment_cash_position_counts.sql'));
 await db.query('INSERT INTO auth.users VALUES($1)',[id(3)]); await db.query('INSERT INTO public.polos(id) VALUES($1)',[id(1)]);
 await db.query('INSERT INTO public.contas_bancarias(id,polo_id,nome) VALUES($1,$2,$3)',[id(4),id(1),'Synthetic']);
 await db.query("INSERT INTO public.cursos VALUES($1,'Curso','TECNICO')",[id(5)]);
 await db.query("INSERT INTO public.turmas VALUES($1,'SYNTHETIC','Turma',$2)",[id(6),id(5)]);
 await db.query(`INSERT INTO public.contas_receber(id,polo_id,turma_id,valor,valor_pago,status,data_vencimento)
 VALUES($1,$2,$3,200,100,'PENDENTE','2026-01-10')`,[id(10),id(1),id(6)]);
 const addEvent=async(n,amount,date,components)=>{
 await db.query(`INSERT INTO public.financial_payment_events(id,request_id,actor_id,source_kind,source_id,polo_id,payment_date,
 original_cents,principal_cents,interest_cents,penalty_cents,addition_cents,discount_cents,payment_cents,input,payload_hash,preview)
 VALUES($1,$1,$2,'RECEIVABLE',$3,$4,$5,20000,$6,0,0,0,0,$6,'{}','test','{}')`,[id(n),id(3),id(10),id(1),date,amount]);
 for(const [i,cents] of components.entries())await db.query(`INSERT INTO public.financial_payment_components(id,event_id,sequence,account_id,method,amount_cents)
 VALUES($1,$2,$3,$4,'PIX',$5)`,[id(n*100+i),id(n),i+1,id(4),cents]);
 };
 await addEvent(20,10000,'2026-01-15',[5000,5000]);
 assert.equal(Number(await scalar('SELECT count(*) value FROM internal_financial_payments.cash_receivables()')),3);
 const turma=()=>scalar("SELECT public.get_caixa_relatorio_resumo_turmas_core($1,'2026-01-01','2026-02-01') value",[id(1)]);
 let data=await turma(); assert.equal(data.itens[0].quantidade_parcelas,1); assert.equal(data.itens[0].quantidade_recebidas,0);
 assert.equal(data.itens[0].recebido_no_mes,100);
 const recurring=await scalar("SELECT public.get_caixa_relatorio_carteira_recorrente_core($1,'2026-01-01','2026-02-01') value",[id(1)]);
 assert.equal(recurring.analise_recorrente.totais.quantidade_parcelas,1); assert.equal(recurring.analise_recorrente.totais.quantidade_recebidas,0);
 const delinquency=await scalar("SELECT internal_contas.caixa_monthly_delinquency($1,'2026-01-01','2026-01-31') value",[id(1)]);
 assert.equal(delinquency.inadimplencia_mensal.quantidade_elegiveis,1); assert.equal(delinquency.receber_vencido,100);
 let position=await scalar("SELECT public.get_caixa_receivables_position_secure($1,'2026-01-01') value",[id(1)]);
 assert.equal(position.data.monthly.count,1); assert.equal(position.data.monthly.openConfirmed,'100.00');
 await addEvent(21,10000,'2026-02-10',[5000,5000]);
 await db.query("UPDATE public.contas_receber SET status='PAGO',valor_pago=200,data_pagamento='2026-02-10' WHERE id=$1",[id(10)]);
 data=await turma(); assert.equal(data.itens[0].quantidade_recebidas,0,'Full settlement after cutoff is not a paid January title');
 const february=await scalar("SELECT public.get_caixa_relatorio_resumo_turmas_core($1,'2026-02-01','2026-03-01') value",[id(1)]);
 assert.equal(february.itens[0].quantidade_recebidas,1); assert.equal(february.itens[0].recebido_no_mes,100);
 position=await scalar("SELECT public.get_caixa_receivables_position_secure($1,'2026-01-01') value",[id(1)]);
 assert.equal(position.data.monthly.count,1,'Two future components represent one open title at historical cutoff');
 assert.equal(position.data.monthly.openConfirmed,'100.00');
 console.log('Cash title counts PASS: partial split counted once, fully settled only after cutoff, actual movements and amounts preserved.');
} catch(error){console.error(error.message,error.code,error.where??'');process.exitCode=1;} finally{await db.close();}
