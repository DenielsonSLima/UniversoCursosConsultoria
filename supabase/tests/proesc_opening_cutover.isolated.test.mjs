import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const polo = '44444444-4444-4444-4444-444444444444';
const other = '55555555-5555-5555-5555-555555555555';
const account = '11111111-1111-1111-1111-111111111111';
const banese = '22222222-2222-2222-2222-222222222222';
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const position = (month, scope = polo) => scalar(
  'select public.get_caixa_posicao_total_resumo_secure($1,$2) value', [scope, month]);
const balance = (scope = polo) => scalar(`select saldo_gerencial::text value
  from public.get_contas_bancarias_posicoes_polos_secure() where conta_bancaria_id=$1 and polo_id=$2`, [account, scope]);
const snapshot = () => scalar(`select jsonb_build_object(
  'receipts',(select jsonb_agg(to_jsonb(r) order by id) from public.contas_receber r),
  'expenses',(select jsonb_agg(to_jsonb(d) order by id) from public.despesas_lancamentos d),
  'accounts',(select jsonb_agg(to_jsonb(a) order by id) from public.contas_bancarias a)) value`);

function sqlFunction(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, name);
  const rest = sql.slice(start);
  return rest.slice(0, rest.indexOf('\n$$;') + 4);
}

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA internal_contas;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
    CREATE FUNCTION public.can_access_conta_bancaria(uuid) RETURNS boolean LANGUAGE sql AS $$
      SELECT coalesce(current_setting('test.allowed',true),'true')='true' $$;
    CREATE FUNCTION public.gestor_allowed_polo_ids() RETURNS uuid[] LANGUAGE sql AS $$ SELECT ARRAY['${polo}'::uuid] $$;
    CREATE FUNCTION public.get_caixa_financiamento_resumo_secure(uuid,date) RETURNS jsonb LANGUAGE plpgsql AS $$
      BEGIN IF current_setting('test.allowed',true)='false' THEN
        RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF; RETURN '{}'::jsonb; END $$;
    CREATE FUNCTION public.get_caixa_patrimonio_resumo_secure(uuid,date) RETURNS jsonb LANGUAGE sql AS $$
      SELECT public.get_caixa_financiamento_resumo_secure($1,$2) $$;
    CREATE TABLE public.polos(id uuid PRIMARY KEY,nome text,cnpj text,cidade text,estado text,status text);
    CREATE TABLE public.contas_bancarias(id uuid PRIMARY KEY,polo_id uuid,banco text,titular text,agencia text,
      conta text,tipo text,natureza text,codigo_interno text,system_managed boolean,saldo_inicial numeric,
      data_saldo date,ativo boolean);
    CREATE TABLE public.contas_bancarias_polos(conta_bancaria_id uuid,polo_id uuid,created_at timestamptz DEFAULT '2026-01-01');
    CREATE TABLE public.contas_receber(id uuid DEFAULT gen_random_uuid(),conta_bancaria_id uuid,polo_id uuid,
      status text,data_pagamento date,created_at timestamptz DEFAULT now(),valor_pago numeric,valor numeric,
      manual_settlement_id uuid,manual_settlement_reversed_at timestamptz,manual_settlement_received_cents bigint);
    CREATE TABLE public.contas_pagar(id uuid DEFAULT gen_random_uuid(),conta_bancaria_id uuid,polo_id uuid,
      status text,data_pagamento date,created_at timestamptz DEFAULT now(),valor_pago numeric,valor numeric,despesa_lancamento_id uuid);
    CREATE TABLE public.despesas_lancamentos(LIKE public.contas_pagar INCLUDING DEFAULTS);
    CREATE TABLE public.transferencias_contas(conta_origem_id uuid,conta_destino_id uuid,polo_id uuid,
      polo_destino_id uuid,data_transferencia date,tipo text,valor numeric);
    CREATE TABLE public.patrimonio_eventos(patrimonio_id uuid,tipo text,effective_on date,polo_id uuid,quantidade_movimento int);
    CREATE TABLE public.patrimonios(id uuid,polo_id uuid,status text,quantidade int,valor_unitario numeric,data_aquisicao date);
    CREATE TABLE public.emprestimos_financeiros(id uuid,rateio_modo text,data_liberacao date,status text,polo_matriz_id uuid);
    CREATE TABLE public.emprestimo_parcelas(id uuid,emprestimo_id uuid,status text,data_pagamento date,valor_total numeric);
    CREATE TABLE public.emprestimo_parcela_rateios(emprestimo_parcela_id uuid,polo_id uuid,status text,valor_total numeric);
    INSERT INTO public.polos(id,status) VALUES('${polo}','ativo'),('${other}','ativo');
    INSERT INTO public.contas_bancarias(id,polo_id,natureza,codigo_interno,system_managed,saldo_inicial,data_saldo,ativo)
      VALUES('${account}','${polo}','BANCARIA','INTEGRATION:PROESC:${polo}',true,0,null,true),
        ('${banese}','${polo}','BANCARIA','SETTLEMENT:BANESE',true,0,'2026-01-01',true);
    INSERT INTO public.contas_bancarias_polos(conta_bancaria_id,polo_id)
      VALUES('${account}','${polo}'),('${account}','${other}'),('${banese}','${polo}');
    INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
      VALUES('${account}','${polo}','PAGO','2026-09-29',535989.69,535989.69),
        ('${account}','${polo}','PAGO','2026-09-30',3139.90,3139.90),
        ('${account}','${other}','PAGO','2026-09-30',5303.80,5303.80),
        ('${banese}','${polo}','PAGO','2026-09-30',100,100);
    INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
      SELECT '${account}','${polo}','PAGO','2026-10-01',260,279.90 FROM generate_series(1,5);
    INSERT INTO public.despesas_lancamentos(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
      VALUES('${account}','${polo}','PAGO','2026-09-30',535989.69,535989.69);
  `);
  const existing = source('20260727215413_caixa_monthly_statement_and_banese_gross_receipts.sql');
  await db.exec(sqlFunction(existing, 'get_contas_bancarias_saldos'));
  await db.exec(sqlFunction(existing, 'get_contas_bancarias_posicoes_polos_secure'));
  await db.exec(source('20260913123752_caixa_posicao_total_proesc_control.sql'));
  // PGlite current date follows its host; 2026-10-01 is the fixture's opening.
  // Historical/operational position uses this clock seam only in isolated tests.
  const original = await scalar(`select pg_get_functiondef('public.get_caixa_posicao_total_resumo_secure(uuid,date)'::regprocedure) value`);
  await db.exec(original.replaceAll('current_date', "date '2026-10-02'"));
  assert.equal(Number(await balance()), 4439.90);
  const september = await position('2026-09-01');
  assert.equal(september.dados.saldo_caixa_registrado, '3239.90');
  const untouched = await snapshot();
  const beforeAcl = await scalar(`select jsonb_agg(jsonb_build_object('name',proname,'acl',proacl) order by proname) value
    from pg_proc where proname in ('get_contas_bancarias_saldos','get_contas_bancarias_posicoes_polos_secure','get_caixa_posicao_total_resumo_secure')`);
  const migration = source('20261002010700_proesc_opening_cutover.sql');
  await db.exec(migration);
  assert.deepEqual(await snapshot(), untouched, 'No ledger or bank base mutations');
  assert.deepEqual(await scalar(`select jsonb_agg(jsonb_build_object('name',proname,'acl',proacl) order by proname) value
    from pg_proc where proname in ('get_contas_bancarias_saldos','get_contas_bancarias_posicoes_polos_secure','get_caixa_posicao_total_resumo_secure')`), beforeAcl);
  assert.equal(Number(await balance()), 1300);
  assert.equal(Number(await balance(other)), 5303.80, 'Other polo unchanged');
  assert.equal(await scalar(`select saldo_atual::text value from public.get_contas_bancarias_saldos() where id='${banese}'`), '100', 'Banese unchanged');
  assert.equal(Number(await scalar(`select saldo_atual::text value from public.get_contas_bancarias_saldos() where id='${account}'`)), 6603.80);
  const afterSeptember = await position('2026-09-01');
  assert.equal(afterSeptember.disponivel, september.disponivel);
  assert.equal(afterSeptember.dados.saldo_caixa_registrado, september.dados.saldo_caixa_registrado);
  assert.equal((await position('2026-10-01')).dados.saldo_caixa_registrado, '1400.00');
  assert.equal((await position('2026-10-01', other)).dados.saldo_caixa_registrado, '5303.80');
  assert.equal((await position('2026-10-01', null)).dados.saldo_caixa_registrado, '6703.80');
  assert.equal(await scalar(`select count(*)::int value from internal_contas.proesc_operational_openings`), 1);
  assert.equal(await scalar(`select internal_contas.proesc_operational_movement_included(
    '${account}','${polo}','2026-09-30','2026-09-30') value`), true);
  assert.equal(await scalar(`select internal_contas.proesc_operational_movement_included(
    '${account}','${polo}','2026-09-30','2026-10-01') value`), false);
  assert.equal(await scalar(`select internal_contas.proesc_operational_movement_included(
    '${account}','${polo}','2026-10-01','2026-10-01') value`), true);
  assert.equal(await scalar(`select internal_contas.proesc_operational_movement_included(
    '${account}',null,'2026-09-30','2026-10-01') value`), true, 'Unattributed cash not silently reassigned');
  assert.equal(await scalar(`select count(*)::int value from public.contas_receber
    where polo_id='${polo}' and data_pagamento='2026-10-01'`), 5);
  assert.equal(Number(await scalar(`select sum(valor_pago)::text value from public.contas_receber
    where polo_id='${polo}' and data_pagamento='2026-10-01'`)), 1300);
  await db.exec(`INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
    VALUES('${account}','${polo}','PAGO','2026-09-10',260,279.90)`);
  assert.equal(Number(await balance()), 1300, 'Late historical backfill must not reopen balance');
  assert.equal((await position('2026-09-01')).dados.saldo_caixa_registrado, '3499.90', 'Historical position retains the new proof');
  await db.exec(`INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
    VALUES('${account}','${polo}','PAGO','2026-10-02',260,279.90)`);
  assert.equal(Number(await balance()), 1560, 'New actual October receipt counts');
  assert.equal((await position('2026-10-01')).dados.saldo_caixa_registrado, '1660.00');
  await db.exec(`INSERT INTO public.transferencias_contas VALUES
    ('${account}','${banese}','${polo}','${polo}','2026-09-30','FISICA',10),
    ('${account}','${banese}','${polo}','${polo}','2026-10-02','FISICA',20)`);
  assert.equal(Number(await balance()), 1540, 'Only post-opening scoped transfer leaves Proesc');
  await db.exec(`INSERT INTO public.contas_pagar(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
    VALUES('${account}','${polo}','PAGO','2026-09-20',300,300),
      ('${account}','${polo}','PAGO','2026-10-02',20,20);
    INSERT INTO public.despesas_lancamentos(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
    VALUES('${account}','${polo}','PAGO','2026-09-20',400,400),
      ('${account}','${polo}','PAGO','2026-10-02',30,30)`);
  assert.equal(Number(await balance()), 1490, 'Payables and expenses use the same scope/date boundary');
  await db.exec(`INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor,
    manual_settlement_id,manual_settlement_received_cents)
    VALUES('${account}','${polo}','PAGO','2026-10-02',279.90,279.90,gen_random_uuid(),14000)`);
  assert.equal(Number(await balance()), 1630, 'Canonical manual-settlement amount is preserved');
  await db.exec(`INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
    VALUES('${account}','${polo}','PAGO',null,null,279.90)`);
  assert.equal((await position('2026-10-01')).motivo, 'HISTORICO_INSUFICIENTE', 'Unknown paid date/value stays incomplete');
  assert.equal(Number(await balance()), 1630, 'Unknown date cannot become a new post-opening receipt');
  await db.exec(`INSERT INTO public.transferencias_contas VALUES
    ('${banese}','${account}','${polo}','${polo}','2026-09-30','FISICA',15),
    ('${banese}','${account}','${polo}','${polo}','2026-10-02','FISICA',25)`);
  assert.equal(Number(await balance()), 1655, 'Destination branch only includes post-opening inflow');
  await db.exec(`select set_config('test.allowed','false',false)`);
  assert.equal(await scalar('select count(*)::int value from public.get_contas_bancarias_saldos()'), 0);
  assert.equal(await scalar('select count(*)::int value from public.get_contas_bancarias_posicoes_polos_secure()'), 0);
  assert.equal((await position('2026-10-01')).motivo, 'ACESSO_RESTRITO');
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('select * from internal_contas.proesc_operational_openings'), /permission denied/);
  await assert.rejects(db.query(`select internal_contas.proesc_operational_movement_included('${account}','${polo}','2026-10-01','2026-10-02')`), /permission denied/);
  await db.exec('RESET ROLE');
  console.log('PASS Proesc operational opening: scope, historical preservation, backfill, October receipts, Banese, transfers, grants');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
