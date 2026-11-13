import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const scalar = async (sql, args=[]) => (await db.query(sql,args)).rows[0].value;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const signature = 'internal_contas.caixa_monthly_delinquency(uuid,date,date)';
const patch = source('../migrations/20261113182000_bound_caixa_monthly_eligibility.sql');
const metadata = () => scalar("select to_jsonb(p)-'prosrc' value from pg_proc p where oid=$1::regprocedure",[signature]);
const monthly = (polo,month,today) => scalar('select internal_contas.caixa_monthly_delinquency($1,$2,$3) value',[polo,month,today]);
const calls = () => scalar("select case when is_called then last_value+1 else 0 end value from test_optional_calls");

try {
  for (const file of ['other_credit_cancellation.fixture.sql','financial_payment.fixture.sql','financial_payment_cash.fixture.sql']) {
    await db.exec(source(file));
  }
  await db.exec(source('../migrations/20261014183502_financial_payment_ledger.sql'));
  for (const file of ['20261014183529_financial_payment_cash_components.sql','20261014183532_financial_payment_cash_sources.sql']) {
    await db.exec(source('../migrations/'+file));
  }
  await db.exec(`CREATE SCHEMA internal_contas;
    ALTER TABLE internal_proesc.obligation_links ADD COLUMN id uuid;
    CREATE UNIQUE INDEX ON internal_proesc.obligation_links(receivable_id);
    CREATE TABLE public.payment_gateway_cnab_records(receivable_id uuid,provider_code text,status text);
    CREATE TABLE public.test_snapshot(id uuid,verification text,source_status text,principal_cents bigint,
      received_cents bigint,payment_date date);
    CREATE FUNCTION internal_contas.caixa_proesc_effective_snapshot(public.contas_receber,uuid)
      RETURNS SETOF public.test_snapshot LANGUAGE sql STABLE AS $$SELECT * FROM public.test_snapshot WHERE id=$2$$;
    CREATE FUNCTION internal_proesc.reconciliation_source_system(public.contas_receber) RETURNS text
      LANGUAGE sql STABLE AS $$SELECT CASE WHEN $1.origem_pagamento='PROESC' THEN 'PROESC' ELSE 'BANESE' END$$;
    CREATE TABLE test_ead(id uuid PRIMARY KEY,optional boolean,paid_after boolean);
    CREATE SEQUENCE test_optional_calls MINVALUE 0 START 0;
    CREATE FUNCTION internal_contas.ead_checkout_is_optional(uuid) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
    BEGIN
      PERFORM nextval('public.test_optional_calls');
      RETURN coalesce((SELECT optional FROM public.test_ead WHERE id=$1),false);
    END $$;
    CREATE FUNCTION internal_contas.ead_checkout_paid_after_cutoff(uuid,date) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT coalesce((SELECT e.paid_after AND c.status='PAGO' AND c.data_pagamento >= $2
        FROM public.test_ead e JOIN public.contas_receber c ON c.id=e.id WHERE e.id=$1),false) $$;`);
  const stateSource = source('../migrations/20260913010000_caixa_monthly_delinquency.sql');
  await db.exec(stateSource.slice(stateSource.indexOf('create function internal_contas.caixa_monthly_receivable_state('),
    stateSource.indexOf('create function internal_contas.caixa_monthly_delinquency(')));
  // Rebuild the deployed pre-patch reader from the immutable payment-era fixture.
  // Its pg_get_functiondef hash must match the production drift guard exactly.
  let baseline = source('financial_payment_position_readers.fixture.sql')
    .split('CREATE OR REPLACE FUNCTION internal_contas.caixa_receivables_position_rows')[0];
  baseline = baseline.replace('from public.contas_receber c','from internal_financial_payments.cash_receivables() c')
    .replaceAll('ead_checkout_is_optional(c.id)','ead_checkout_is_optional(internal_financial_payments.cash_source_id(c.id))')
    .replaceAll('ead_checkout_paid_after_cutoff(c.id,','ead_checkout_paid_after_cutoff(internal_financial_payments.cash_source_id(c.id),')
    .replace("count(*) filter(where position in ('SETTLED','OUTSTANDING'))",
      "count(DISTINCT internal_financial_payments.cash_source_id(id)) filter(where position in ('SETTLED','OUTSTANDING'))")
    .replace("count(*) filter(where position='REVIEW')",
      "count(DISTINCT internal_financial_payments.cash_source_id(id)) filter(where position='REVIEW')");
  await db.exec(baseline);
  await db.exec(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,anon,authenticated,service_role`);
  assert.equal(await scalar('select md5(pg_get_functiondef($1::regprocedure)) value',[signature]),
    '52f6b7586248cb2213a95c033db8d592');
  const beforeMetadata = await metadata();

  await db.query('INSERT INTO auth.users VALUES($1)',[id(900)]);
  await db.query('INSERT INTO public.polos(id) VALUES($1),($2),($3)',[id(1),id(2),id(3)]);
  await db.query("INSERT INTO public.contas_bancarias(id,polo_id,nome) VALUES($1,$2,'Synthetic')",[id(10),id(1)]);
  const add = async (n,status='PENDENTE',due='2026-11-10',paid=null,amount=100,polo=id(1)) => {
    await db.query(`INSERT INTO public.contas_receber(id,polo_id,status,valor,valor_pago,data_vencimento,data_pagamento)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[id(n),polo,status,amount,status==='PAGO'?amount:0,due,paid]);
  };
  await add(101); await add(102,'PAGO','2026-11-01','2026-11-03');
  await add(103,'PAGO','2026-11-30','2026-12-02');
  await add(104,'PAGO','2026-11-02',null);
  await add(105,'CANCELADO'); await add(106,'VENCIDO','2026-10-31');
  await add(107,'AGUARDANDO_CONFIRMACAO'); await add(108,'AGUARDANDO_PAGAMENTO');
  await add(109,'PENDENTE','2026-11-10',null,75,id(2));
  await add(110,'PENDENTE','2026-11-10',null,50,null);
  await add(111,'PENDENTE',null);
  await add(112); await add(113); await add(114); await add(115);
  await add(116,'PAGO','2026-11-01','2026-12-02');
  await db.query('INSERT INTO test_ead VALUES($1,true,false),($2,false,true)',[id(115),id(116)]);
  await db.query('INSERT INTO public.emprestimos_financeiros VALUES($1)',[id(114)]);
  await db.query("UPDATE public.contas_receber SET regra_financeira_tecnica_snapshot='{\"cicloManual\":{}}' WHERE id IN ($1,$2)",[id(112),id(113)]);
  await db.query("INSERT INTO public.payment_gateway_cnab_records VALUES($1,'banese','RECORDED')",[id(113)]);
  for (const [n,state,verification] of [[117,'OPEN','VERIFIED'],[118,'OPEN','REVIEW'],[119,'CANCELED','VERIFIED']]) {
    await add(n);
    await db.query("UPDATE public.contas_receber SET origem_pagamento='PROESC' WHERE id=$1",[id(n)]);
    await db.query('INSERT INTO internal_proesc.obligation_links VALUES($1,$1)',[id(n)]);
    await db.query('INSERT INTO public.test_snapshot VALUES($1,$2,$3,10000,null,null)',[id(n),verification,state]);
  }
  // Off-month rows recreate the expensive eligibility-before-month plan.
  await db.exec(`INSERT INTO public.contas_receber(id,polo_id,status,valor,valor_pago,data_vencimento)
    SELECT ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,
      '${id(1)}','PENDENTE',100,0,'2025-01-01' FROM generate_series(1,300) n`);
  await add(120,'PENDENTE','2026-11-08',null,200);
  const event = async (n,date) => {
    await db.query(`INSERT INTO public.financial_payment_events(id,request_id,actor_id,source_kind,source_id,polo_id,
      payment_date,original_cents,principal_cents,interest_cents,penalty_cents,addition_cents,discount_cents,
      payment_cents,input,payload_hash,preview)
      VALUES($1,$1,$2,'RECEIVABLE',$3,$4,$5,20000,10000,0,0,0,0,10000,'{}','fixture','{}')`,
      [id(n),id(900),id(120),id(1),date]);
    for (let seq=1;seq<=2;seq++) await db.query(`INSERT INTO public.financial_payment_components
      (id,event_id,sequence,account_id,method,amount_cents) VALUES($1,$2,$3,$4,'PIX',5000)`,
      [id(n*10+seq),id(n),seq,id(10)]);
  };
  await event(200,'2026-11-09');

  await db.exec('BEGIN');
  const scenarios = [];
  for (const polo of [null,id(1),id(2),id(3)]) {
    for (const month of ['2026-10-01','2026-11-01','2026-11-19','2026-12-01',null]) {
      for (const today of ['2026-11-01','2026-11-13','2026-12-03',null]) {
        scenarios.push({polo,month,today,before:await monthly(polo,month,today)});
      }
    }
  }
  await db.exec("SELECT setval('test_optional_calls',0,false)");
  await monthly(null,'2026-11-01','2026-11-13');
  const callsBefore = Number(await calls());
  await db.exec(patch);
  assert.deepEqual(await metadata(),beforeMetadata,'Owner, ACL, stability, definer and search_path are unchanged');
  for (const scenario of scenarios) {
    assert.deepEqual(await monthly(scenario.polo,scenario.month,scenario.today),scenario.before,
      'Full evidence JSON and distinct-title counts remain identical');
  }
  await db.exec("SELECT setval('test_optional_calls',0,false)");
  await monthly(null,'2026-11-01','2026-11-13');
  const callsAfter = Number(await calls());
  assert.ok(callsAfter < callsBefore/4, `Bounded eligibility calls: ${callsBefore} -> ${callsAfter}`);
  const compare = async () => {
    const after = await monthly(id(1),'2026-11-01','2026-11-30');
    await db.exec(baseline);
    const before = await monthly(id(1),'2026-11-01','2026-11-30');
    assert.deepEqual(after,before);
    await db.exec(patch);
    return after;
  };
  const partial = await compare();
  await event(201,'2026-12-02');
  await db.query("UPDATE public.contas_receber SET status='PAGO',valor_pago=200,data_pagamento='2026-12-02' WHERE id=$1",[id(120)]);
  await compare();
  await db.query(`UPDATE public.financial_payment_events SET reversed_at=now(),reversed_by=$2,
    reversal_request_id=$3,reversal_reason='Synthetic reversal' WHERE id=$1`,[id(200),id(900),id(300)]);
  await compare();
  assert.ok(partial.inadimplencia_mensal.quantidade_elegiveis>0);
  await assert.rejects(() => db.exec(patch),/Monthly delinquency drift/);
  await db.exec('ROLLBACK');
  await db.exec('BEGIN');
  await db.exec(`ALTER FUNCTION ${signature} VOLATILE`);
  await assert.rejects(() => db.exec(patch),/Monthly delinquency drift/);
  await db.exec('ROLLBACK');
  for (const role of ['anon','authenticated','service_role']) {
    assert.equal(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE') value",[role,signature]),false);
  }
  console.log(JSON.stringify({cases:scenarios.length,eligibilityCallsBefore:callsBefore,eligibilityCallsAfter:callsAfter,
    fullPayloadEquality:true,partialAndReversal:true,metadataAndAcl:true,driftRejected:true}));
} finally {
  await db.close();
}
