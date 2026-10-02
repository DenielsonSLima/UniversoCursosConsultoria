import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const polo = '44444444-4444-4444-4444-444444444444';
const porto = '31497afd-e2dd-4444-aa3d-8087c0ae0753';
const aquidaba = '335fdbe4-b3b4-4622-aa7d-04c585455091';
const propria = 'ff20c5e3-c816-4ee6-b9e9-e731135c9a07';
const outsider = '66666666-6666-6666-6666-666666666666';
const account = '11111111-1111-1111-1111-111111111111';
const banese = '22222222-2222-2222-2222-222222222222';
const local = '33333333-3333-3333-3333-333333333333';
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const position = (month, scope = polo) => scalar(
  'select public.get_caixa_posicao_total_resumo_secure($1,$2) value', [scope, month]);
const snapshot = () => scalar(`select jsonb_build_object(
  'receipts',(select jsonb_agg(to_jsonb(r) order by id) from public.contas_receber r),
  'expenses',(select jsonb_agg(to_jsonb(d) order by id) from public.despesas_lancamentos d),
  'accounts',(select jsonb_agg(to_jsonb(a) order by id) from public.contas_bancarias a),
  'assets',(select jsonb_agg(to_jsonb(a)) from public.patrimonios a),
  'loans',(select jsonb_agg(to_jsonb(a)) from public.emprestimo_parcelas a),
  'openings',(select jsonb_agg(to_jsonb(o) order by polo_id) from internal_contas.proesc_operational_openings o)) value`);
const metadata = () => scalar(`select to_jsonb(proc)-'prosrc' value
  from pg_proc proc where oid='public.get_caixa_posicao_total_resumo_secure(uuid,date)'::regprocedure`);
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
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.role',true),'service_role') $$;
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
    INSERT INTO public.polos(id,status) VALUES('${polo}','ativo'),('${porto}','ativo'),('${aquidaba}','ativo'),
      ('${propria}','ativo'),('${outsider}','ativo');
    INSERT INTO public.contas_bancarias(id,polo_id,natureza,codigo_interno,system_managed,saldo_inicial,data_saldo,ativo)
      VALUES('${account}','${polo}','BANCARIA','INTEGRATION:PROESC:${polo}',true,0,null,true),
        ('${banese}','${polo}','BANCARIA','SETTLEMENT:BANESE',true,0,'2026-01-01',true),
        ('${local}','${polo}','CAIXA_INTERNO','CAIXA',true,0,'2026-01-01',true);
    INSERT INTO public.contas_bancarias_polos(conta_bancaria_id,polo_id) SELECT '${account}',id FROM public.polos;
    INSERT INTO public.contas_bancarias_polos(conta_bancaria_id,polo_id) VALUES('${banese}','${polo}'),('${local}','${polo}');
    INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
      VALUES('${account}','${polo}','PAGO','2026-08-31',100,100),
        ('${account}','${polo}','PAGO','2026-09-30',3039.90,3039.90),
        ('${account}','${porto}','PAGO','2026-09-30',1910,1910),
        ('${account}','${aquidaba}','PAGO','2026-09-30',3133.80,3133.80),
        ('${account}','${outsider}','PAGO','2026-09-30',55,55),
        ('${account}',null,'PAGO','2026-09-30',77,77),
        ('${banese}','${polo}','PAGO','2026-09-30',100,100),
        ('${local}','${polo}','PAGO','2026-09-30',20,20),
        ('${account}','${porto}','PAGO','2026-10-01',260,279.90);
    INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
      SELECT '${account}','${polo}','PAGO','2026-10-01',260,279.90 FROM generate_series(1,5);
    INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
      VALUES('${account}','${polo}','PAGO','2026-09-01',535989.69,535989.69);
    INSERT INTO public.despesas_lancamentos(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
      VALUES('${account}','${polo}','PAGO','2026-09-30',535989.69,535989.69);
    INSERT INTO public.patrimonios VALUES(gen_random_uuid(),'${polo}','ativo',1,200,'2026-09-01');
    INSERT INTO public.emprestimos_financeiros VALUES('${local}','SEM_RATEIO','2026-09-01','ATIVO','${polo}');
    INSERT INTO public.emprestimo_parcelas VALUES(gen_random_uuid(),'${local}','PENDENTE',null,50);
  `);
  const existing = source('20260727215413_caixa_monthly_statement_and_banese_gross_receipts.sql');
  await db.exec(sqlFunction(existing, 'get_contas_bancarias_saldos'));
  await db.exec(sqlFunction(existing, 'get_contas_bancarias_posicoes_polos_secure'));
  await db.exec(source('20260913123752_caixa_posicao_total_proesc_control.sql'));
  // Fixed clock applies only to this isolated fixture, not the migration.
  const original = await scalar(`select pg_get_functiondef('public.get_caixa_posicao_total_resumo_secure(uuid,date)'::regprocedure) value`);
  await db.exec(original.replaceAll('current_date', "date '2026-10-02'"));
  await db.exec(source('20261002010700_proesc_opening_cutover.sql'));
  await db.exec(source('20261002010900_proesc_all_polos_opening.sql'));
  const untouched = await snapshot();
  const beforeMetadata = await metadata();
  const october = await position('2026-10-01');
  const august = await position('2026-08-01');
  const beforeSeptember = await position('2026-09-01');
  assert.equal(beforeSeptember.dados.saldo_caixa_registrado, '3259.90');
  await db.exec(source('20261002011100_proesc_operational_closing_presentation.sql'));
  assert.deepEqual(await snapshot(), untouched, 'No financial facts or opening metadata mutated');
  assert.deepEqual(await metadata(), beforeMetadata, 'Identity, owner, ACL and security configuration retained');
  assert.deepEqual(await position('2026-10-01'), october, 'October byte-equivalent JSON');
  assert.deepEqual(await position('2026-08-01'), august, 'Other historical months unchanged');
  const september = await position('2026-09-01');
  assert.equal(september.dados.saldo_caixa_registrado, '120.00', 'Banese and local cash survive closure');
  assert.equal(september.dados.valor_total_liquido, '270.00', 'Assets and loan liabilities remain canonical');
  assert.ok(september.dados.observacao.startsWith('Encerramento operacional de implantação do Controle Proesc; o histórico permanece preservado e separado. '));
  assert.deepEqual(september.dados.fechamento_implantacao, {
    data_encerramento: '2026-09-30', data_abertura: '2026-10-01',
    saldo_historico_controle_proesc: '3139.90', ajuste_encerramento_operacional: '-3139.90',
    saldo_encerramento_proesc: '0.00', saldo_abertura_proesc: '0.00',
  });
  for (const [scope, historical] of [[porto, '1910.00'], [aquidaba, '3133.80'], [propria, '0.00']]) {
    const result = await position('2026-09-01', scope);
    assert.equal(result.dados.saldo_caixa_registrado, '0.00');
    assert.equal(result.dados.fechamento_implantacao.saldo_historico_controle_proesc, historical);
  }
  assert.equal((await position('2026-09-01', outsider)).dados.saldo_caixa_registrado, '55.00');
  assert.equal((await position('2026-09-01', outsider)).dados.fechamento_implantacao, undefined);
  const global = await position('2026-09-01', null);
  assert.equal(global.dados.saldo_caixa_registrado, '252.00', 'Unassigned and unapproved-polo cash preserved');
  assert.equal(global.dados.valor_total_liquido, '402.00');
  assert.equal(global.dados.fechamento_implantacao.saldo_historico_controle_proesc, '8183.70');
  await db.exec(`select set_config('test.role','authenticated',false)`);
  assert.equal((await position('2026-09-01', null)).dados.fechamento_implantacao.saldo_historico_controle_proesc,
    '3139.90', 'Closing metadata honors the restricted operator allowed-polo list');
  await db.exec(`select set_config('test.role','service_role',false)`);
  await db.exec(`INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
    VALUES('${account}','${porto}','PAGO','2026-09-20',260,279.90)`);
  const backfilled = await position('2026-09-01', porto);
  assert.equal(backfilled.dados.saldo_caixa_registrado, '0.00');
  assert.equal(backfilled.dados.fechamento_implantacao.saldo_historico_controle_proesc, '2170.00');
  assert.equal((await position('2026-10-01', porto)).dados.saldo_caixa_registrado, '260.00');
  await db.exec(`INSERT INTO public.contas_receber(conta_bancaria_id,polo_id,status,data_pagamento,valor_pago,valor)
    VALUES('${account}','${porto}','PAGO',null,null,279.90)`);
  const insufficient = await position('2026-09-01', porto);
  assert.equal(insufficient.motivo, 'HISTORICO_INSUFICIENTE');
  assert.equal(insufficient.dados, undefined, 'No artificial zero when history is incomplete');
  await db.exec(`select set_config('test.allowed','false',false)`);
  const denied = await position('2026-09-01');
  assert.equal(denied.motivo, 'ACESSO_RESTRITO');
  assert.equal(denied.dados, undefined);
  console.log('PASS operational closing: real DDL, exact date/scope, raw audit, zero control only, unchanged Banese/assets/loans/ledger/ACL');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
