import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const root = resolve(import.meta.dirname, '../..');
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema internal_academic; create schema internal_financial_correction;
    create table public.contas_receber(id int primary key,status text,tipo_lancamento text,
      parcela_numero int,valor numeric,regra_financeira_tecnica_snapshot jsonb,updated_at text,
      new_nullable text,payment boolean default false,local_intent boolean default true);
    create table internal_academic.technical_manual_cycle_runs(matricula_id int,cycle_number int,receivable_ids int[]);
    create table internal_financial_correction.operations(id int,state text);
    create table internal_financial_correction.items(receivable_id int,matricula_id int,operation_id int,
      kind text,state text,finalized_at timestamptz,run_snapshot jsonb,receivable_snapshot jsonb);
    create table public.payment_gateway_transactions(receivable_id int);
    create function internal_financial_correction.reversed_control_waiver_complete(public.contas_receber)
      returns boolean language sql as $$ select false $$;
    create function internal_financial_correction.has_payment_evidence(public.contas_receber)
      returns boolean language sql as $$ select $1.payment $$;
    create function internal_academic.manual_cycle_has_local_intent(public.contas_receber)
      returns boolean language sql as $$ select $1.local_intent $$;
    insert into public.contas_receber values (1,'PENDENTE','MATRICULA',0,180,'{"destinoCobranca":"LOCAL"}','old',null,false,true);
    insert into internal_academic.technical_manual_cycle_runs values (1,1,array[1]);
    insert into internal_financial_correction.operations values (1,'FINALIZED');
    insert into internal_financial_correction.items
      select 1,1,1,'LOCAL_WAIVER','FINALIZED',now(),to_jsonb(run),to_jsonb(r)-'new_nullable'
      from public.contas_receber r cross join internal_academic.technical_manual_cycle_runs run;
    update public.contas_receber set status='CANCELADO',updated_at='new';
  `);
  await db.exec(await readFile(resolve(root, 'supabase/migrations/20261014132900_contract_individual_waiver_nullable_columns.sql'), 'utf8'));
  const valid = async () => (await db.query('select internal_academic.contract_local_waiver_complete(r) as valid from public.contas_receber r')).rows[0].valid;
  assert.equal(await valid(), true, 'nullable schema addition preserves finalized historical proof');
  for (const mutation of [
    "update public.contas_receber set new_nullable='not empty'",
    'update public.contas_receber set valor=181',
    'update public.contas_receber set payment=true',
    'update public.contas_receber set local_intent=false',
    "update public.contas_receber set status='PENDENTE'",
    "update internal_financial_correction.operations set state='PENDING'",
    'update internal_academic.technical_manual_cycle_runs set receivable_ids=array[2]',
    'insert into public.payment_gateway_transactions values (1)',
  ]) {
    await db.exec('begin');
    await db.exec(mutation);
    assert.equal(await valid(), false, mutation);
    await db.exec('rollback');
  }
  assert.equal(await valid(), true);
  console.log('9 finalized waiver compatibility checks passed');
} finally { await db.close(); }
